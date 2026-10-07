# 01 — Update engine

Branch: `004-plugin-auto-update-01-update-engine`
Depends on: none
Worktree: `git worktree add ../worktrees/004-plugin-auto-update-01-update-engine -b 004-plugin-auto-update-01-update-engine` from the supervisor's staging branch, then `npm ci` and `npm run build:client`.

## Context

Implements contract **builtin-plugin-updater** and consumes **plugin-release-channel** (contracts.md; format owned by zekoder-plugins feature 023). Self-contained module under `packages/server/src/server/plugins/builtin/updates/`; no daemon wiring (package 03 does that).

Reuse:
- `writeJsonFileAtomic` — `packages/server/src/server/atomic-file.ts:23`.
- Fetch pattern with `redirect: "error"` and `AbortSignal.timeout` — `packages/server/src/server/plugins/managed-source/registry.ts:32-36`.
- `semver` (already a server dependency): ordering, prerelease detection, `satisfies` on `requires.paseo` against the daemon version's stable core.
- `node:crypto`: `createPublicKey({ key: { kty: "OKP", crv: "Ed25519", x: <base64url of the 32 raw bytes> }, format: "jwk" })`, `crypto.verify(null, payloadBytes, key, sig)`; `createHash("sha256")`.
- `tar` — in `package-lock.json` transitively (7.5.12; hoisted root is 6.2.1). Add it exact-pinned: `npm install --workspace packages/server --save-exact tar@7.5.12`.
- Tree checksum algorithm: `computeTreeChecksum` in `scripts/sync-zekoder-plugin.mjs:104-130` (`listFiles` + hash loop). The server package cannot import from `scripts/`, so port the ~25 lines into `updates/tree-checksum.ts` unchanged in behaviour (files only, sorted by `/`-joined relative path, `"<path>\0<byteLength>\0"` + bytes + `"\0"`, lowercase hex). A comment names the script as the reference. A test pins the two together (Tasks).

Check order in `checkNow()` and the `lastError.code` each step emits:
1. Fetch `manifest.json` (30 s timeout) — `manifest-fetch-failed`. One fetch only; there is no `.sig`.
2. Parse the envelope (`schemaVersion: 1`, `payload` string, `signatures[]`) — `manifest-invalid`.
3. Base64-decode `payload`; valid when ≥1 entry with `alg: "ed25519"` and a `keyId` in `TRUSTED_KEYS` verifies over those bytes; unknown key ids ignored — else `signature-invalid` (state unchanged except `lastCheckAt`).
4. `JSON.parse` the payload bytes; zod payload schema, `pluginId === "zekoder"`, every `releases[v].version === v`, every `artifact.url` inside `https://storage.googleapis.com/zekoder-releases/plugins/zekoder/` — `manifest-invalid`.
5. `sequence` < `highestSequence` → `sequence-replay`, state unchanged, stop. Equal → keep the manifest-derived state already held (`revoked`, `highestSequence`) and continue. Higher → persist `highestSequence` and `revoked` (as `revoked[].version` strings). Both equal and higher continue to steps 6–10, so a download that failed on one check is retried on the next check at the same sequence. Always save `latestAvailable` and `lastCheckAt`.
6. Select per contracts.md › Selection (channel rule same as feature 003; never ≤ bundled or ≤ highest installed good version; rollback only through `revoked` in `resolveActive`). Best excluded only by `requires.paseo` → `incompatible`.
7. Download `artifact.url` (5 min timeout) — `download-failed`. Stop as soon as bytes exceed `artifact.size`, and require total = `size` — `size-mismatch`. Then sha256 — `sha256-mismatch`.
8. Extract into `<version>.staging-<uuid>` with a `tar` filter: only `File`/`Directory` entries, every path under the single root `zekoder/`, no absolute or `..` paths; require `zekoder/paseo-plugin.json` with `id === pluginId` — `unpack-failed`.
9. `computeTreeChecksum(<staging>/zekoder)` must equal `treeChecksum` — `tree-checksum-mismatch`.
10. Rename `<staging>/zekoder` to `<version>/`, remove the staging dir, append to `installed`. Keep the newest 3 installed versions; delete older ones and stray `*.staging-*` dirs.

A successful check clears `lastError`; nothing throws out of `checkNow`. The channel is read from `desktop-channel.json` at the start of each check; missing or invalid means `stable`. `getStatus().channel` reports the channel read at the last check (before the first check: the current file value, else `stable`). `getStatus()` follows the contract (cached candidate; `restartRequired` true whenever the next start runs a different version than now, including rollback to bundled after a revoke). Start failures retry once: the first `recordStartFailure` only counts, the second moves the version to `failed`. Key rotation is followup 002-plugin-signing-key-rotation; only the list-shaped keyring ships here.

## Tasks

- [ ] `updates/trusted-keys.ts`: `TrustedKey = { keyId; alg: "ed25519"; publicKey; addedAt }` (zekoder-plugins keyring entry shape), `export const TRUSTED_KEYS: readonly TrustedKey[] = []`, `export const MANIFEST_URL = "https://storage.googleapis.com/zekoder-releases/plugins/zekoder/manifest.json"`. Comment: entries are copied verbatim from zekoder-plugins `scripts/plugin-release-keys.json` (external dependency 2).
- [ ] `updates/tree-checksum.ts`: port of `computeTreeChecksum` (see Context).
- [ ] `updates/manifest.ts`: zod envelope and payload schemas (contracts.md › plugin-release-channel), `verifyEnvelope(envelope, trustedKeys): Uint8Array | null` (returns verified payload bytes), and pure `selectCandidate({ payload, channel, bundledVersion, installed, failed, daemonVersion })`.
- [ ] `updates/index.ts`: `BuiltinPluginUpdater` per contract, `checkNow()` in the order above. `start()` schedules with `setTimeout` + `.unref()`; no overlapping checks. Disabled (no keys) → `getStatus().enabled === false`, no fetch.
- [ ] `resolveActive()` (excluded-copy `fallbackReason`, one-retry rule, revoked never returned), `recordStartFailure()`, `recordRunning()`, `getStatus()` per contract. Use a local structurally identical status type plus local code/reason unions; 03 swaps them for the `@getpaseo/protocol/messages` exports.
- [ ] `updates/index.test.ts` (new, beside the module): local `node:http` fixture, Ed25519 keypair from `generateKeyPairSync("ed25519")` exported to the raw-base64 keyring shape, tar fixture built from a temp `zekoder/` dir. Assert the exact `lastError.code` in every failure case:
  - newer stable installs, becomes `stagedVersion`; installed dir holds `paseo-plugin.json` at its root (not under `zekoder/`)
  - manifest 500 → `manifest-fetch-failed`; bad envelope or payload, `pluginId` mismatch, URL outside prefix → `manifest-invalid`
  - bad signature, untrusted-only key id, `alg` not `ed25519` → `signature-invalid`; unknown key id plus a valid trusted entry → accepted
  - lower `sequence` → `sequence-replay`, state unchanged; higher persisted; equal keeps `revoked`/`highestSequence` and still selects and downloads: a download that fails (500) on one check succeeds on the next check at the same sequence and installs
  - truncated artifact and oversized artifact → `size-mismatch`; right size, wrong bytes → `sha256-mismatch`
  - symlink entry, `../` path, extra top-level entry beside `zekoder/`, missing `paseo-plugin.json` → `unpack-failed`
  - one file changed in the tarball with matching sha256/size in the manifest → `tree-checksum-mismatch`
  - incompatible `requires.paseo` skipped (`incompatible`); prerelease daemon satisfies a range on its stable core
  - beta skipped on stable; beta channel takes newer stable over older beta; channel file `beta` / missing / garbage → beta / stable / stable; `getStatus().channel` before any check = current channel file value, after a check = the channel that check read
  - revoked objects stored as version strings; revoked dropped by `resolveActive` (previous good, else `{ fallbackReason: "revoked" }`), even when already downloaded
  - one start failure → still returned (retry); second → `{ fallbackReason: "previously-failed" }`
  - `getStatus()` right after `checkNow()` installs → `stagedVersion` + `restartRequired: true` synchronously; running downloaded version revoked with no other good copy → `stagedVersion === bundledVersion`, `restartRequired: true`
  - version ≤ bundled ignored; failed version ignored; disabled makes no request; prune keeps 3
- [ ] `updates/tree-checksum.test.ts` (new): `computeTreeChecksum(<repo>/plugins/zekoder)` equals `checksum` in `plugins/zekoder.lock.json` (the script's own output; CI's `sync-zekoder-plugin --check` keeps the lock current), so the port cannot drift from the script.

## Verification

- `npx vitest run packages/server/src/server/plugins/builtin/updates/index.test.ts --bail=1 > /tmp/test-output.txt 2>&1`, then the same for `updates/tree-checksum.test.ts`.
- `npm run typecheck`, `npm run lint -- packages/server/src/server/plugins/builtin/updates`, `npm run format:files` on each changed file.
- No real network or GCS in tests.

## Progress

- Status: planned
- Completed: none
- Blockers: none (external dependency 1 is the format owner; contracts.md mirrors its final format).
