# Contracts

## builtin-plugin-updater

- Type: internal · Kind: store · Owner: 01 · Consumers: 03
- Module: `packages/server/src/server/plugins/builtin/updates/index.ts` exports `BuiltinPluginUpdater`.
- Constructor options: `{ pluginId: "zekoder", paseoHome, bundledVersion, daemonVersion, manifestUrl, trustedKeys: readonly TrustedKey[], logger, fetch?, now?, intervalMs? }` with `TrustedKey = { keyId: string; publicKey: string }` (base64 raw 32-byte Ed25519 key). Empty list → updater is `disabled`, makes no network call.
- **Channel source:** read at the start of every check from `$PASEO_HOME/builtin-plugin-updates/desktop-channel.json` (`{ channel: "stable" | "beta" }`, written by the desktop app, package 03). Missing or invalid → `stable`.
- **Compat base:** a release's `requires.paseo` semver range (same meaning as `paseo-plugin.json` `requirements.paseo`) is checked with `semver.satisfies` against the Paseo **daemon** version (`resolveDaemonVersion()`, `packages/server/package.json` version), never the desktop app version.
- `resolveActive(): Promise<{ directory: string; version: string } | { fallbackReason: BuiltinPluginUpdateFallbackReason } | null>` — highest installed version newer than `bundledVersion`, not revoked in the last verified manifest, not in `failed`, compatible with `daemonVersion`. A version with one recorded start failure is still returned (one retry). When newer installed copies exist but all are excluded, returns the reason for the best excluded one (`revoked`, `previously-failed`, `incompatible`). `null` → nothing downloaded, use bundled.
- `recordStartFailure(version: string, message: string): Promise<void>` — increments `startFailures[version]` and sets `lastError` `{ code: "start-failed", ... }`. At 2 failures the version moves to `failed` and is never tried again; only a newer version can replace it.
- `recordRunning(input: { source: "bundled" | "downloaded"; version: string; fallbackReason: BuiltinPluginUpdateFallbackReason | null }): void` — what actually started this daemon run, and why bundled ran if it did.
- `start(): void` / `stop(): void` — first check after 60 s, then every `intervalMs` (default 6 h); never overlapping. `checkNow(): Promise<void>` for tests.
- `getStatus(): BuiltinPluginUpdateStatus` is synchronous. The updater keeps the resolved candidate in memory and recomputes it from state at the end of every `checkNow()` and `resolveActive()` call. `getStatus()` reads that cache. When `resolveActive()` yields `{ fallbackReason }` or `null`, the cached candidate is the **bundled** version. `stagedVersion` = cached candidate version when it differs from `runningVersion`, else `null`. `restartRequired = stagedVersion !== null`. So a running downloaded copy that later becomes revoked or failed reports `stagedVersion = bundledVersion` and `restartRequired: true`, and the restart completes the rollback.
- State file `$PASEO_HOME/builtin-plugin-updates/<pluginId>/state.json`, written with `writeJsonFileAtomic` (`packages/server/src/server/atomic-file.ts`): `{ schemaVersion: 1, installed: string[], failed: string[], startFailures: Record<string, number>, revoked: string[], lastCheckAt: string | null, lastError: BuiltinPluginUpdateError | null, latestAvailable: string | null, highestSequence: number | null }`. `highestSequence` is the highest manifest `sequence` that passed signature verification. Unpacked copies at `.../<pluginId>/<version>/`. A version appears in `installed` only after full verify + unpack + rename.

## builtin-plugin-update-status

- Type: internal · Kind: store · Owner: 02 · Consumers: 03
- Jointly defined: **zekoder-plugins proposes the shape** (its `pluginUpdates.status` plan), **Studio implements it** with this repo's wire conventions. Fields marked *(pending)* await the plugins agent's final field list, forwarded by the coordinator.
- Type names use the `BuiltinPluginUpdate*` prefix to stay distinct from the existing `PluginUpdate*` source-update schemas (`PluginUpdatePreviewRequestSchema`, `PluginUpdateProposalSchema`, … in `messages.ts` ~L1473-1508, ~L6720-6745).
- Protocol, `packages/protocol/src/messages.ts`, `BuiltinPluginUpdateStatusSchema`:
  - `pluginId: string` (required)
  - `runningVersion: string` (required) — version that started this daemon run
  - `source: "bundled" | "downloaded"` (required)
  - `stagedVersion?: string | null` — downloaded, verified, applies at next start
  - `restartRequired?: boolean` — true when `stagedVersion` is set; the Version tab shows "restart the daemon to apply"
  - `fallbackReason?: string | null` — why bundled runs although a downloaded copy exists; null when downloaded runs or none exists
  - `lastCheckAt?: string | null` — ISO time of the last completed check
  - `lastError?: { code: string; message: string; at: string } | null`
  - `bundledVersion?: string` *(pending — Studio addition)*
  - `latestAvailable?: string | null` *(pending — Studio addition)*
  - `channel?: "stable" | "beta"` *(pending — Studio addition)*
  - `enabled?: boolean` *(pending — Studio addition; false when not desktop-launched, no trusted keys, or `ZEKODER_PLUGIN_UPDATES=off`)*
- `fallbackReason` known values (`BuiltinPluginUpdateFallbackReason`): `start-failed`, `revoked`, `previously-failed`, `incompatible`.
- `lastError.code` known values (`BuiltinPluginUpdateErrorCode`): `manifest-fetch-failed`, `manifest-invalid`, `signature-invalid`, `sequence-replay`, `incompatible`, `revoked`, `download-failed`, `sha256-mismatch`, `unpack-failed`, `start-failed`.
- Both are `z.string()` on the wire, with the known values exported as TS string-literal unions and documented next to the schema. A closed `z.enum` would make an old client reject a new code from a newer daemon (docs/protocol-compatibility.md: never narrow). Daemon code only emits listed values.
- Wire: `plugin.updates.get_status.request { requestId, pluginId? }` → `plugin.updates.get_status.response { payload: { requestId, plugins: BuiltinPluginUpdateStatus[] } }`. The operation segment is `get_status`, not `status`, because docs/rpc-namespacing.md requires a verb there.
- Capability: `server_info.features.pluginUpdates?: boolean`, tagged `COMPAT(pluginUpdates)`.
- Server provider interface (02 defines in `packages/server/src/server/plugins/index.ts`, 03 implements): `interface BuiltinPluginUpdateStatusProvider { list(pluginId?: string): BuiltinPluginUpdateStatus[] }`. `PluginService` takes it as optional dependency `builtinUpdateStatus` and exposes `getBuiltinPluginUpdateStatus(pluginId?)`; absent → empty list. The session handler calls `this.pluginRuntime.getBuiltinPluginUpdateStatus(...)`.

## zekoder-plugin-release-manifest

- Type: cross-system · Counterpart: cyberneticlabs/zekoder-plugins · External dependency: 1 · Owner: 01 (Studio consumer side; the plugins repo owns the schema) · Consumers: none
- Pending owner confirmation. Studio's required fields — package 01 codes against these and adapts field names when the owner publishes the final schema:
  - URL: `https://storage.googleapis.com/zekoder-releases/plugins/zekoder/manifest.json` (public read, `Cache-Control` short).
  - Signature: detached `manifest.json.sig` next to it, JSON `{ signatures: [{ keyId: string, sig: string }] }`; each `sig` is base64 Ed25519 over the exact manifest bytes. Studio accepts the manifest when **any** entry whose `keyId` is in its trusted list verifies; entries with unknown `keyId` are ignored. One entry is the normal case; the list exists so a later rotation can dual-sign.
  - Replay protection: body carries `sequence` — a positive integer the publisher increments on every manifest publish (including revocation-only re-signs). Studio rejects a verified manifest whose `sequence` is lower than its persisted `highestSequence` (`sequence-replay`, nothing else changes); equal is a no-op for selection; higher is accepted and persisted.
  - Body: `{ schemaVersion: 1, pluginId: "zekoder", sequence: number, channels: { stable: version | null, beta: version | null }, revoked: string[], releases: { [version]: { version, channel: "stable" | "beta", commit, requires: { paseo: semverRange }, artifact: { url, sha256, size } } } }`. `requires.paseo` is checked against the daemon version.
  - Artifact URL is immutable under `plugins/zekoder/releases/<version>/`, HTTPS on `storage.googleapis.com/zekoder-releases/plugins/zekoder/`. Unpacked root contains `paseo-plugin.json` with `id: "zekoder"` and the same file set the vendored copy has (`index.server.ts`, `index.client.tsx`, `server/`, `client/`, `shared/`).
  - Versions are strict semver; beta = `X.Y.Z-beta.N`. Revoking = adding to `revoked` and re-signing; a revoked version is never deleted from the bucket (rollback guardrail).

## plugin-update-status-api

- Type: cross-system · Counterpart: cyberneticlabs/zekoder-plugins (Version tab) · External dependency: 1 · Owner: 02 · Consumers: none
- The plugins repo proposed the shape; Studio implements it (builtin-plugin-update-status above).
- The plugin calls `paseo.pluginUpdates.status("zekoder")` on the `PaseoApi` its client (`usePaseo()`) and server contexts already receive. It returns `BuiltinPluginUpdateStatus[]`. `pluginUpdates` is a new top-level namespace beside `providers` and `config`, which matches how `PaseoApi` groups actions.
- On an older host `paseo.pluginUpdates` is undefined, or the call rejects with an "update the host" error. The plugin then shows "not supported by this app version". Unknown `fallbackReason` or `lastError.code` values show as generic text.
- `restartRequired: true` → the Version tab tells the user to restart the daemon from Studio's existing **Settings → Host → Restart daemon** action (`packages/app/src/screens/settings/host-page.tsx`, `restart_server_request`). The plugin does not trigger restarts, and Studio never auto-restarts.
