# Get started

## Prerequisites

- Node 22+, `npm ci`, `npm run build:client` (01/02), `npm run build:server` (03).
- No real GCS or production key needed: tests use a local HTTP fixture and a generated Ed25519 keypair.
- Never restart the daemon on :6767. Manual runs use the dev daemon (`npm run dev`, port 6768, `PASEO_HOME=.dev/paseo-home`).

## Run

- Unit tests (one file at a time): `npx vitest run` on the single changed file with `--bail=1 > /tmp/test-output.txt 2>&1` (files in the mapping table below).
- Gates: `npm run typecheck`, `npm run lint`, `npm run format`.

## Manual walkthrough (after external dependencies 1 and 2 land)

1. Build a packaged desktop app with the real keyring entry copied into `TRUSTED_KEYS`; launch it on the stable channel. → Status shows `source: bundled`, `runningVersion` = lock version, `enabled: true`.
2. Wait ~60 s. → Status `lastCheckAt` set, `stagedVersion` = stable pointer, `restartRequired: true`, `lastError` null; `$PASEO_HOME/builtin-plugin-updates/zekoder/<version>/` exists with `paseo-plugin.json` at its root.
3. Restart the daemon from Settings → Host → Restart daemon (never :6767 by hand). → Status `source: downloaded`, `runningVersion` = new version, `stagedVersion` null, `restartRequired: false`; `paseo plugin disable zekoder` is still rejected as reserved.
4. Plugins side revokes that version (023 appends a `revoked` object, bumps `sequence`); wait for a check. → `restartRequired: true`, `stagedVersion` = bundled (or previous good). Restart. → `source: bundled` with `fallbackReason: revoked` (or previous good copy), `runningVersion` ≠ revoked version.
5. Corrupt `index.server.ts` in the downloaded dir; restart the daemon (Settings → Host → Restart daemon). → Plugin works from bundled; status `fallbackReason: start-failed`, `lastError.code: start-failed`. Restart again. → It retries once, fails, still bundled. Restart a third time. → `fallbackReason: previously-failed`, no attempt to load that version until a newer one ships.
6. Switch the app to beta in desktop settings, quit and relaunch the app (the desktop rewrites `desktop-channel.json` on launch, also when it reuses a running daemon). → The next check (≤ 6 h, or force one by restarting the daemon from Settings → Host → Restart daemon) considers beta releases; status `channel: beta`.
7. Quit the app, launch it with `ZEKODER_PLUGIN_UPDATES=off` in its environment, and restart the daemon from Settings → Host → Restart daemon. A headless `paseo daemon start` behaves the same without the variable. → `enabled: false`, no network request, bundled copy loads.

## Integration-test mapping

| Walkthrough step | Automated coverage |
| --- | --- |
| 1, 7 | `plugins/index.posix.test.ts` (bundled path, not built without `desktopManaged`), `updates/index.test.ts` (disabled), `scripts/builtin-plugins-dist.test.mjs` (off) |
| 2 | `updates/index.test.ts` (newer stable installs; envelope, size, sha256, tree checksum), `updates/tree-checksum.test.ts` |
| 3 | `plugins/index.posix.test.ts` (downloaded starts, locks), `runtime.posix.test.ts` (compile outside repo) |
| 4 | `updates/index.test.ts` (revoked → previous good → null) |
| 5 | `plugins/index.posix.test.ts` (fallback + failure recorded) |
| 6 | `updates/index.test.ts` (channel rules), `daemon-manager.test.ts` (channel file on reuse and fresh paths) |
| status RPC | `messages.plugins.test.ts`, `daemon-client.test.ts`, `plugin-paseo-api.e2e.test.ts` (plugin server handler calls `paseo.pluginUpdates.status("zekoder")`) |
