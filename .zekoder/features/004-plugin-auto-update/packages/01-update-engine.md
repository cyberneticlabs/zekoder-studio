# 01 — Update engine

Branch: `004-plugin-auto-update-01-update-engine`
Depends on: none
Worktree: `git worktree add ../worktrees/004-plugin-auto-update-01-update-engine -b 004-plugin-auto-update-01-update-engine` from the supervisor's staging branch, then `npm ci` and `npm run build:client`.

## Context

Implements contract **builtin-plugin-updater** and consumes **zekoder-plugin-release-manifest** (contracts.md). Self-contained module under `packages/server/src/server/plugins/builtin/updates/`; no daemon wiring (package 03 does that).

Reuse:
- `writeJsonFileAtomic` — `packages/server/src/server/atomic-file.ts:23`.
- Fetch pattern with `redirect: "error"` and `AbortSignal.timeout` — `packages/server/src/server/plugins/managed-source/registry.ts:32-36`.
- `semver` (already a server dependency) for ordering, `satisfies` on `requires.paseo`, prerelease detection.
- `node:crypto`: `createPublicKey({ key: <12-byte Ed25519 SPKI prefix + raw 32 bytes>, format: "der", type: "spki" })`, `crypto.verify(null, manifestBytes, key, signature)`; `createHash("sha256")` for the artifact.
- `tar` — already in `package-lock.json` transitively (7.5.12 under several packages; hoisted root is 6.2.1). Add it as an exact-pinned dependency of `packages/server`: `npm install --workspace packages/server --save-exact tar@7.5.12`.

Channel rule (feature 003): `stable` considers stable releases only; `beta` considers stable and beta and takes the highest. Never pick a version ≤ `bundledVersion` or ≤ the highest installed good version (no downgrade). Rollback happens only through `revoked` in `resolveActive`.

Signature check uses the exact downloaded manifest bytes before parsing. The `.sig` file is a list of `{ keyId, sig }`; the manifest is valid when any entry whose `keyId` matches a `TRUSTED_KEYS` entry verifies. No valid entry → `lastError` `signature-invalid`, no state change besides `lastCheckAt`. Then the replay check: `sequence < highestSequence` → reject with `lastError` `sequence-replay`; equal → no new selection beyond what state already holds; higher → persist as `highestSequence`. Compat is checked against the daemon version (contracts.md). Building the key-rotation process is out of scope; only the list-shaped hooks ship here.

Status data package 02 serves (contract builtin-plugin-update-status). Every failure records a typed `lastError = { code, message, at }` with `code` from: `manifest-fetch-failed` (network/HTTP on manifest or `.sig`), `manifest-invalid` (schema/pluginId/URL-prefix), `signature-invalid`, `sequence-replay`, `incompatible` (candidate's `requires.paseo` excludes the daemon), `revoked`, `download-failed`, `sha256-mismatch` (also size overrun), `unpack-failed` (tar error, link/traversal entry, missing or wrong `paseo-plugin.json`), `start-failed` (via `recordStartFailure`). A successful check clears `lastError`. The updater caches the resolved candidate in memory after every `checkNow()` and `resolveActive()`, and the synchronous `getStatus()` reads that cache for `stagedVersion` / `restartRequired`. When `resolveActive()` yields `{ fallbackReason }` or `null`, the cached candidate is the bundled version, so a revoked/failed running downloaded copy reports `stagedVersion = bundledVersion`, `restartRequired: true`. It also reports the running `fallbackReason` from `recordRunning`. Start failures retry once: the first `recordStartFailure` only counts (`startFailures`), the second moves the version to `failed`. The channel is read from `desktop-channel.json` at the start of each check (contract); missing or invalid means `stable`.

## Tasks

- [ ] `updates/trusted-keys.ts`: `export const TRUSTED_KEYS: readonly TrustedKey[] = []` (`TrustedKey = { keyId, publicKey }`) and `export const MANIFEST_URL = "https://storage.googleapis.com/zekoder-releases/plugins/zekoder/manifest.json"`, with a comment pointing at external dependency 2.
- [ ] `updates/manifest.ts`: zod schema for the manifest (contracts.md), `verifyManifestSignature(bytes, signatures: { keyId; sig }[], trustedKeys)`, and pure `selectCandidate({ manifest, channel, bundledVersion, installed, failed, daemonVersion })`. Reject artifact URLs outside `https://storage.googleapis.com/zekoder-releases/plugins/zekoder/`.
- [ ] `updates/index.ts`: `BuiltinPluginUpdater` per contract. `checkNow()`: fetch manifest + `.sig` (30 s timeout), verify, apply the sequence check, save `revoked`/`latestAvailable`/`lastCheckAt`/`highestSequence`, select, download artifact (size from manifest as cap, 5 min timeout), check sha256, unpack into `<version>.staging-<uuid>` with a `tar` filter that rejects links and any path escaping the root, require `paseo-plugin.json` with `id === pluginId`, rename to `<version>/`, append to `installed`. Keep the newest 3 installed versions; delete older ones and stray `*.staging-*` dirs. All failures set a typed `lastError`; nothing throws out of `checkNow`. `start()` schedules with `setTimeout` + `.unref()`; no overlapping checks. Disabled (no keys) → `getStatus().enabled === false`, no fetch.
- [ ] `resolveActive()` (including the excluded-copy `fallbackReason` and the one-retry rule), `recordStartFailure()`, `recordRunning()`, `getStatus()` per contract. `getStatus()` returns the 02 `BuiltinPluginUpdateStatus` shape with `stagedVersion`, `restartRequired`, `fallbackReason` and typed `lastError`, read from the cached candidate. Use a local structurally identical type plus local code/reason unions; 03 swaps them for the `@getpaseo/protocol/messages` exports.
- [ ] `updates/index.test.ts` (new, beside the module): local `node:http` server fixture, Ed25519 keypair from `generateKeyPairSync("ed25519")`, tar fixture from a temp plugin dir. Assert the exact `lastError.code` in every failure case. Cases: newer stable installs and becomes `stagedVersion`; manifest fetch 500 → `manifest-fetch-failed`; malformed manifest → `manifest-invalid`; bad signature; signature from an untrusted key; signature list with an unknown `keyId` plus a valid trusted entry accepted; a list with only an untrusted `keyId` rejected; manifest with lower `sequence` than persisted rejected and state unchanged (equal sequence no-op, higher accepted and persisted); sha256 mismatch; path-traversal/link entry rejected; incompatible `requires.paseo` skipped; beta skipped on stable; beta channel takes newer stable over older beta; revoked skipped and dropped by `resolveActive` (falls back to previous good, else `{ fallbackReason: "revoked" }`); one start failure → still returned by `resolveActive` (retry); second failure → `{ fallbackReason: "previously-failed" }`; `getStatus()` right after `checkNow()` installs a newer version reports `stagedVersion` + `restartRequired: true` without awaiting anything; running downloaded version (via `recordRunning`) then revoked by a newer manifest with no other good copy → `stagedVersion === bundledVersion`, `restartRequired: true`; channel file `beta` / missing / garbage → beta / stable / stable; version ≤ bundled ignored; failed version ignored; disabled makes no request; prune keeps 3.

## Verification

- `npx vitest run packages/server/src/server/plugins/builtin/updates/index.test.ts --bail=1 > /tmp/test-output.txt 2>&1`
- `npm run typecheck`, `npm run lint -- packages/server/src/server/plugins/builtin/updates`, `npm run format:files` on each changed file.
- No real network or GCS in tests.

## Progress

- Status: planned
- Completed: none
- Blockers: final manifest field names / artifact format from external dependency 1 (code to contracts.md; adapt on confirmation).
