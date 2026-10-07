# 03 — Overlay loader and wiring

Branch: `004-plugin-auto-update-03-overlay-loader`
Depends on: 01, 02
Worktree: `git worktree add ../worktrees/004-plugin-auto-update-03-overlay-loader -b 004-plugin-auto-update-03-overlay-loader` from the supervisor's staging branch (after 01 and 02 merged), then `npm ci` and `npm run build:server`.

## Context

Consumes **builtin-plugin-updater** (01) and **builtin-plugin-update-status** (02). Read `docs/plugins.md` "Built-in plugins" and "Vendored plugins" first.

- Built-in start loop: `PluginService.start()` — `packages/server/src/server/plugins/index.ts:175-188`. It calls `runtime.startBuiltinPlugin({ id, directory })`, then `publishProviderRegistrations(plugin.id, plugin.directory)`. `startBuiltinPlugin` (`runtime.ts:346`) throws before registering on manifest, compat or compile failure.
- Locks: the same id keeps `rejectBuiltinId` (`index.ts:787`) and `builtinPluginIds`. Do not touch them.
- Bootstrap: `packages/server/src/server/bootstrap.ts:495` (`resolveBuiltinPluginLoader` — `dependencies.builtinPlugins ?? new BuiltinPluginLoader()`), `:597-634` (`daemonVersion`, `new PluginService(...)`, `paseoHome`).
- **Scope: desktop app only (user decision).** The opt-in is the existing `config.desktopManaged`. It comes from `PASEO_DESKTOP_MANAGED=1` (`config.ts:613`), which `daemonLaunchEnvironment` (`config-environment.ts:76-91`) sets only when the desktop launches the daemon. `paseo daemon restart` keeps the supervisor launch (`packages/cli/src/commands/daemon/restart.ts:17-18`), so the opt-in survives the `restart_desktop_daemon` IPC (`daemon-manager.ts:363`) and Settings → Host → Restart. Headless npm/Docker daemons, dev checkouts, CI and smoke runs stay off.
- Channel: the daemon does not take the channel from env. The desktop writes it to a file in `$PASEO_HOME` (contract builtin-plugin-updater), and the updater reads that file at every check. The channel therefore survives CLI restarts and the reused-daemon path at `daemon-manager.ts:291`.

## Tasks

- [ ] `PluginService`: optional dependency `builtinUpdater` (01's class). In `start()`, for `builtinUpdater.pluginId`, call `resolveActive()`:
  - **Directory returned:** start it. On failure, call `runtime.stopPluginById(id)` and `recordStartFailure(version, message)`, log, then start the bundled directory in the same start with `fallbackReason: "start-failed"`. This retries once: 01 blocks the version after its second failure.
  - **`{ fallbackReason }` returned** (revoked, previously-failed, incompatible): start bundled with that reason.
  - **`null`:** start bundled with `fallbackReason: null`.

  Then call `recordRunning({ source, version, fallbackReason })` and pass the directory actually started to `publishProviderRegistrations`.
- [ ] `BuiltinPluginLoader` (`builtin/index.ts`): make `root` a public `readonly` property. In bootstrap, derive the updater's bundled root from the loader actually used (`resolveBuiltinPluginLoader(dependencies).root`), never from a second `resolveBuiltinPluginsRoot()` call. This keeps an injected test loader and the updater on one root.
- [ ] Bootstrap: build the updater only when all of these hold:
  - `config.desktopManaged === true`
  - `ZEKODER_PLUGIN_UPDATES !== "off"`
  - the loader root's basename is `builtin-plugins` and it contains `zekoder.lock.json` (packaged or built daemon, never the repo `plugins/`)

  Read `bundledVersion` from that lock. Pass the updater as `builtinUpdater`, plus a `builtinUpdateStatus` adapter whose `list()` returns `[updater.getStatus()]`, filtered by `pluginId` (an injected `dependencies.builtinUpdateStatus` from 02 wins). When the updater is not built: if the loader's list does not include `zekoder`, the adapter returns `[]`; otherwise it returns `[{ pluginId: "zekoder", runningVersion: <lock version>, source: "bundled", bundledVersion: <lock version>, enabled: false }]`, version from the loader root's `zekoder.lock.json`, so 023 can show "Updates are managed by the desktop app". Replace 01's local status/code types with 02's protocol exports. Call `start()` after `PluginService.start()`, and `stop()` on daemon shutdown next to the existing plugin teardown.
- [ ] Desktop (`packages/desktop/src/daemon/daemon-manager.ts`): in `startDaemon()`, write `$PASEO_HOME/builtin-plugin-updates/desktop-channel.json` `{ channel }` atomically (temp + rename) before both the reuse return (~L291) and a fresh spawn. Get the channel from the desktop settings store `releaseChannel`, the same source `resolveRequestedReleaseChannel` (~L394) falls back to. A settings change then applies at the next check after the next app launch. Extend `daemon-manager.test.ts` to cover both paths.
- [ ] CI keeps updates off:
  - `scripts/builtin-plugins-dist.test.mjs` starts the daemon without desktop management, so it is already off. Add one assertion that the update status is `enabled: false` or empty.
  - `packages/desktop/e2e/packaged-app-smoke.js` launches the real desktop app, so it would opt in. Add `ZEKODER_PLUGIN_UPDATES: "off"` to the launch env it builds (~L152).
- [ ] Tests in `packages/server/src/server/plugins/index.posix.test.ts` (existing fixtures `createPlugin`/`createStore`/`BuiltinPluginLoader`):
  - A downloaded dir starts and is reported `downloaded` with `fallbackReason: null`.
  - A failing downloaded dir falls back to bundled in one start, with `fallbackReason: "start-failed"` and `lastError.code: "start-failed"`. A second start retries it; after the second failure, the third start gets `fallbackReason: "previously-failed"` without trying it.
  - A revoked-only copy starts bundled with `fallbackReason: "revoked"`.
  - `null` starts bundled.
  - Built-in locks still reject enable/disable/update for the id.
  - The updater is not built when `desktopManaged` is false, or when an injected loader's root is not a `builtin-plugins` root; status then reports `enabled: false` with `runningVersion` = lock version and `source: "bundled"`; a loader without `zekoder` reports `[]`.
- [ ] Test in `runtime.posix.test.ts`: copy `plugins/zekoder` to a temp dir outside the repo and run `startBuiltinPlugin` on it. This proves compile/import validation works without the repo `tsconfig`/`node_modules`.
- [ ] Docs: rewrite the `docs/plugins.md` "Vendored plugins" part to cover signed updates:
  - desktop-launched daemons only, and why
  - where copies live and the channel file
  - next-start apply, with restart via Settings → Host → Restart daemon
  - one retry and then block on start failure; revocation fallback
  - the status RPC, `paseo.pluginUpdates.status("zekoder")`, and `ZEKODER_PLUGIN_UPDATES=off`
  - that zekoder-plugins feature 023-plugin-auto-update-publishing owns the release format (signed envelope, `sha256`/`size`/`treeChecksum`); link its contract rather than restating it
  - why this is the user-approved exception to exact pinning (signed, immutable, version-pinned, bundled fallback; approved 2026-10-07)

  Add one line to `docs/data-model.md` for `$PASEO_HOME/builtin-plugin-updates/`.

## Verification

- `npx vitest run packages/server/src/server/plugins/index.posix.test.ts --bail=1 > /tmp/test-output.txt 2>&1`, and the same for `packages/server/src/server/plugins/runtime.posix.test.ts` and `packages/desktop/src/daemon/daemon-manager.test.ts`. `node --test scripts/builtin-plugins-dist.test.mjs > /tmp/test-output.txt 2>&1` after `npm run build:server`.
- `npm run typecheck`; `npm run lint` and `npm run format:files` on the changed files.
- Never restart the daemon on :6767. Manual checks use `npm run dev` (6768).

## Progress

- Status: planned
- Completed: none
- Blockers: packages 01 and 02 merged.
