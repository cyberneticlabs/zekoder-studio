# Contracts

## builtin-plugin-updater

- Type: internal · Kind: store · Owner: 01 · Consumers: 03
- Module: `packages/server/src/server/plugins/builtin/updates/index.ts` exports `BuiltinPluginUpdater`.
- Constructor options: `{ pluginId: "zekoder", paseoHome, bundledVersion, daemonVersion, manifestUrl, trustedKeys: readonly TrustedKey[], logger, fetch?, now?, intervalMs? }`. `TrustedKey = { keyId: string; alg: "ed25519"; publicKey: string; addedAt: string }` — one entry of the zekoder-plugins keyring `scripts/plugin-release-keys.json`, copied verbatim (`publicKey` = standard base64 of the raw 32-byte Ed25519 key). Empty list → updater is `disabled`, makes no network call.
- **Channel source:** read at the start of every check from `$PASEO_HOME/builtin-plugin-updates/desktop-channel.json` (`{ channel: "stable" | "beta" }`, written by the desktop app, package 03). Missing or invalid → `stable`.
- **Compat base:** a release's `requires.paseo` range is checked with `semver.satisfies` against the stable core (`major.minor.patch`, prerelease dropped) of the Paseo **daemon** version, so daemon `0.10.0-beta.2` satisfies `>=0.10.0`. Daemon version = (`resolveDaemonVersion()`, `packages/server/package.json`), never the desktop app version.
- `resolveActive(): Promise<{ directory: string; version: string } | { fallbackReason: BuiltinPluginUpdateFallbackReason } | null>` — highest installed version newer than `bundledVersion`, not revoked in the last verified manifest, not in `failed`, compatible with `daemonVersion`. A version with one recorded start failure is still returned (one retry). When newer installed copies exist but all are excluded, returns the reason for the best excluded one (`revoked`, `previously-failed`, `incompatible`). `null` → nothing downloaded, use bundled. A revoked version is never returned, even if already downloaded.
- `recordStartFailure(version: string, message: string): Promise<void>` — increments `startFailures[version]` and sets `lastError` `{ code: "start-failed", ... }`. At 2 failures the version moves to `failed`; only a newer version can replace it.
- `recordRunning(input: { source: "bundled" | "downloaded"; version: string; fallbackReason: BuiltinPluginUpdateFallbackReason | null }): void` — what actually started this daemon run, and why bundled ran if it did.
- `start(): void` / `stop(): void` — first check after 60 s, then every `intervalMs` (default 6 h); never overlapping. `checkNow(): Promise<void>` for tests.
- `getStatus(): BuiltinPluginUpdateStatus` is synchronous and reads an in-memory candidate cache recomputed at the end of every `checkNow()` and `resolveActive()`. When `resolveActive()` yields `{ fallbackReason }` or `null`, the cached candidate is the **bundled** version. `stagedVersion` = cached candidate version when it differs from `runningVersion`, else `null`. `restartRequired = stagedVersion !== null`, which means: true whenever the next start runs a different version than now, including rollback to bundled after a revoke. `channel` = the channel read at the last check; before the first check, the current `desktop-channel.json` value, else `stable`.
- State file `$PASEO_HOME/builtin-plugin-updates/<pluginId>/state.json`, written with `writeJsonFileAtomic` (`packages/server/src/server/atomic-file.ts`): `{ schemaVersion: 1, installed: string[], failed: string[], startFailures: Record<string, number>, revoked: string[], lastCheckAt: string | null, lastError: BuiltinPluginUpdateError | null, latestAvailable: string | null, highestSequence: number | null }`. `revoked` holds version strings derived from the manifest's `revoked[].version` (user decision; the wire format stays objects). `highestSequence` is the highest `sequence` that passed signature verification. Unpacked copies at `.../<pluginId>/<version>/` (the contents of the artifact's `zekoder/` root). A version enters `installed` only after full verify + unpack + tree check + rename.

## builtin-plugin-update-status

- Type: cross-system · Counterpart: cyberneticlabs/zekoder-plugins feature 023-plugin-auto-update-publishing (consumer: Version tab, its package 02) · External dependency: 1 · Owner: 02 · Consumers: 03 (implements the provider)
- **Studio owns this API.** zekoder-plugins 023 consumes it. The field list below is final and confirmed by 023.
- Type names use the `BuiltinPluginUpdate*` prefix to stay distinct from the existing `PluginUpdate*` source-update schemas (`messages.ts` ~L1473-1508, ~L6720-6745).

### Shape (`BuiltinPluginUpdateStatusSchema`, `packages/protocol/src/messages.ts`)

| Field             | Type                                                              | Meaning                                                                                                  |
| ----------------- | ----------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| `pluginId`        | `string` (required)                                               |                                                                                                          |
| `runningVersion`  | `string` (required)                                               | version this daemon run actually started                                                                 |
| `source`          | `"bundled" \| "downloaded"` (required)                            |                                                                                                          |
| `stagedVersion`   | `string \| null`, optional                                        | verified version that loads on next start                                                                |
| `restartRequired` | `boolean`, optional                                               | true whenever the next start runs a different version than now, incl. rollback to bundled after a revoke |
| `fallbackReason`  | `string \| null`, optional                                        | why bundled runs although a downloaded copy exists                                                       |
| `lastCheckAt`     | `string \| null`, optional                                        | ISO time of the last completed check                                                                     |
| `lastError`       | `{ code: string; message: string; at: string } \| null`, optional |                                                                                                          |
| `bundledVersion`  | `string`, optional                                                |                                                                                                          |
| `latestAvailable` | `string \| null`, optional                                        | highest eligible version in the last verified manifest                                                   |
| `channel`         | `"stable" \| "beta"`, optional                                    | from the desktop app; display only                                                                       |
| `enabled`         | `boolean`, optional                                               | false when not desktop-launched, no trusted keys, or `ZEKODER_PLUGIN_UPDATES=off`                        |

- `fallbackReason` known values (`BuiltinPluginUpdateFallbackReason`): `start-failed`, `revoked`, `previously-failed`, `incompatible`.
- `lastError.code` known values (`BuiltinPluginUpdateErrorCode`): `manifest-fetch-failed`, `manifest-invalid`, `signature-invalid`, `sequence-replay`, `incompatible`, `revoked`, `download-failed`, `sha256-mismatch`, `size-mismatch`, `unpack-failed`, `tree-checksum-mismatch`, `start-failed`.
- Both are `z.string()` on the wire; the known values are exported TS string-literal unions documented next to the schema. A closed `z.enum` would make an old client reject a new code (docs/protocol-compatibility.md: never narrow). Daemon code only emits listed values.

### Surfaces

- Wire: `plugin.updates.get_status.request { requestId, pluginId? }` → `plugin.updates.get_status.response { payload: { requestId, plugins: BuiltinPluginUpdateStatus[] } }` (`get_status`: docs/rpc-namespacing.md requires a verb).
- Capability: `server_info.features.pluginUpdates?: boolean`, tagged `COMPAT(pluginUpdates)`.
- Plugin-facing call, exactly: `paseo.pluginUpdates.status("zekoder")` — `PaseoApi.pluginUpdates.status(pluginId?: string): Promise<BuiltinPluginUpdateStatus[]>`, plain string argument. Available on the client `usePaseo()` API and on the server-side `PaseoApi` that plugin `server.handle` handlers receive (`packages/plugin/src/server/contracts.ts:10`, built by `createPaseoApi(daemonClient)` in `packages/server/src/server/plugins/plugin-process.ts:275` over the IPC transport). 023 calls it from its server handlers.
- On an older host `paseo.pluginUpdates` is undefined or the call rejects with "Update the host to view plugin update status."; 023 shows its own "unknown" text.
- No restart API. The plugin never restarts anything and Studio never auto-restarts; users restart from **Settings → Host → Restart daemon** (`packages/app/src/screens/settings/host-page.tsx`, `restart_server_request`).
- Server provider interface (02 defines in `packages/server/src/server/plugins/index.ts`, 03 implements): `interface BuiltinPluginUpdateStatusProvider { list(pluginId?: string): BuiltinPluginUpdateStatus[] }`. `PluginService` takes it as optional dependency `builtinUpdateStatus` and exposes `getBuiltinPluginUpdateStatus(pluginId?)`; absent → empty list. The session handler calls `this.pluginRuntime.getBuiltinPluginUpdateStatus(...)`.

## plugin-release-channel

- Type: cross-system · Counterpart: cyberneticlabs/zekoder-plugins feature 023-plugin-auto-update-publishing · External dependency: 1 · Owner: external (zekoder-plugins 023) · Consumers: 01
- **zekoder-plugins 023 owns this format** (envelope, payload, artifact, GCS layout, keyring); Studio consumes it. Source of truth: 023's `contracts.md` › `plugin-release-channel`. The summary below is what 01 codes against; on any difference, 023 wins.

### Location

- Envelope: `https://storage.googleapis.com/zekoder-releases/plugins/zekoder/manifest.json` (`max-age=60`). One fetch; there is no `.sig` object.
- Artifact: `plugins/zekoder/releases/vX.Y.Z[-beta.N]/zekoder-plugin-vX.Y.Z[-beta.N].tar.gz`, immutable. The reader always uses the manifest's `artifact.url`, never builds it, and rejects any URL outside `https://storage.googleapis.com/zekoder-releases/plugins/zekoder/`. Studio never touches `releases/` (skills/MCP) or `desktop/` (feature 003).

### Envelope and signature

`{ schemaVersion: 1, payload: <standard base64 of the exact UTF-8 payload bytes>, signatures: [{ keyId, alg: "ed25519", sig: <standard base64 of 64 bytes> }] }`. Verify Ed25519 over the decoded payload bytes, then `JSON.parse` them. Valid when at least one entry has `alg: "ed25519"`, a `keyId` in the embedded keyring, and verifies. Unknown `keyId`s are ignored. Zero valid → `signature-invalid`.
Why one envelope: one object is one atomic update. A detached `.sig` can be read out of step with `manifest.json` under the 60 s cache and give a spurious `signature-invalid`.

### Payload (schemaVersion 1)

`{ schemaVersion: 1, pluginId: "zekoder", sequence: int, publishedAt, channels: { stable: version | null, beta: version | null }, releases: { [version]: { version, tag, channel: "stable" | "beta", commit, publishedAt, artifact: { url, sha256, size }, treeChecksum, requires: { paseo: semverRange } } }, revoked: [{ version, reason, revokedAt }] }`.

- `channels` is informational; selection uses `releases`.
- `sequence`: +1 on every write including revoke-only. Lower than persisted → `sequence-replay`, state unchanged; equal → no-op; higher → accept and persist `highestSequence`.
- `revoked`: append-only objects. A revoked version is never loaded, even if already downloaded.

### Selection (normative)

Eligible = releases with channel `stable` (stable app) or `stable | beta` (beta app), not revoked, `requires.paseo` satisfied by the **daemon** version (a prerelease daemon matches its stable core), and greater than bundled. Pick the highest; none → bundled. Download, check `sha256` and `size`, extract, check `treeChecksum`, stage for next start.

### Artifact

- gzip tar; regular files and directories only (no symlinks, absolute paths or `..`). Single root dir `zekoder/` holding `paseo-plugin.json` (`id: "zekoder"`) and the rest of the vendored file set. Any other top-level entry is rejected. The installed dir is the contents of `zekoder/`.
- `treeChecksum` = `computeTreeChecksum` from `scripts/sync-zekoder-plugin.mjs` over the extracted `zekoder/` dir: files sorted by `/`-joined relative path; per file sha256-update `"<path>\0<byteLength>\0"`, the bytes, `"\0"`; lowercase hex. Same value `plugins/zekoder.lock.json` `checksum` holds for a vendored tag.

### Keyring

zekoder-plugins `scripts/plugin-release-keys.json` = `{ "keys": [{ keyId: "zk-plugin-YYYY-MM", alg: "ed25519", publicKey: <standard base64 raw 32 bytes>, addedAt }] }`. Studio embeds a copy of the `keys` list as `TRUSTED_KEYS` (contract builtin-plugin-updater). Node import: `createPublicKey({ key: { kty: "OKP", crv: "Ed25519", x: <base64url of the 32 bytes> }, format: "jwk" })`.
