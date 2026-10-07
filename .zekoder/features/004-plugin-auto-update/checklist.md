# Checklist

## Feature-level gates

- [ ] `npm run typecheck` and `npm run lint` pass; `npm run format` run before commit.
- [ ] Only changed test files run locally (`--bail=1`); full suite in CI.
- [ ] No private key, token or secret committed; only public keys in `trusted-keys.ts`.
- [ ] Protocol additions optional, schemas pure, every shim tagged `COMPAT(pluginUpdates)`; code/reason fields are open strings on the wire.
- [ ] Bundled copy always loads when the downloaded copy is absent, invalid, revoked, failed or incompatible.
- [ ] Built-in locks unchanged: enable/disable/reload/update/install on `zekoder` still rejected.
- [ ] Persistence stays file-based JSON via `writeJsonFileAtomic`.
- [ ] Main daemon on :6767 never restarted.

## 01 — Update engine

- [ ] Signature verified on raw manifest bytes before parsing; any trusted `{keyId, sig}` entry suffices.
- [ ] Lower manifest `sequence` than persisted `highestSequence` rejected; compat checked against daemon version.
- [ ] Every failure records a typed `lastError.code` from the contract list; `stagedVersion` reported.
- [ ] Artifact URL prefix, size cap, sha256 and unpack path/link checks enforced.
- [ ] No downgrade; revoked/failed versions skipped; channel rule matches feature 003.
- [ ] Empty `TRUSTED_KEYS` → disabled, no network.
- [ ] `tar` added exact-pinned; `updates/index.test.ts` green.

## 02 — Status RPC

- [ ] RPC names follow `docs/rpc-namespacing.md` (`plugin.updates.get_status.*`).
- [ ] Status fields match contract builtin-plugin-update-status (incl. any final list forwarded from zekoder-plugins).
- [ ] `server_info.features.pluginUpdates` advertised and checked by the client.
- [ ] `PaseoApi.pluginUpdates.status` available; old hosts give a clear "update the host" error.
- [ ] New gate `requireBuiltinPluginUpdates()` used; existing `requirePluginUpdates()` untouched; new types use the `BuiltinPluginUpdate*` prefix.
- [ ] `packages/protocol/src/messages.plugins.test.ts`, `packages/client/src/daemon-client.test.ts`, `packages/server/src/server/plugins/index.posix.test.ts` green.

## 03 — Overlay loader

- [ ] Downloaded copy used only on next daemon start; fallback in the same start on failure, with `fallbackReason` set.
- [ ] Updater built only for desktop-launched daemons (`desktopManaged`) with a packaged `builtin-plugins` root taken from the loader actually used; off with `ZEKODER_PLUGIN_UPDATES=off`.
- [ ] Desktop writes `desktop-channel.json` on fresh start and reused-daemon paths.
- [ ] `scripts/builtin-plugins-dist.test.mjs` asserts updates off; `packaged-app-smoke.js` sets `ZEKODER_PLUGIN_UPDATES=off`.
- [ ] Start failure retried once, blocked after the second; `restartRequired` reported, no auto-restart.
- [ ] Plugin copied outside the repo compiles and starts (`runtime.posix.test.ts`).
- [ ] `docs/plugins.md` and `docs/data-model.md` updated in place.
