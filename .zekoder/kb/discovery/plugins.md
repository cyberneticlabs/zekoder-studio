<!-- discovery-stamp: sha=96449efc8c37b95f76ca0ef18bacfe5891880412 globs=["packages/server/src/server/plugins/**", "plugins/**", "packages/desktop/electron-builder.yml", "packages/desktop/e2e/packaged-app-smoke.js", "scripts/builtin-plugins-dist.test.mjs", "scripts/*.mjs", "packages/server/package.json", ".github/workflows/ci.yml", "knip.json", ".oxlintrc.json", ".oxfmtrc.json", "docs/plugins.md", "plan.md", "packages/server/src/server/bootstrap.ts", "packages/server/src/server/session.ts", "packages/server/src/server/websocket-server.ts", "packages/server/src/server/atomic-file.ts", "packages/protocol/src/messages.ts", "packages/client/src/index.ts", "packages/client/src/daemon-client.ts", "packages/plugin/src/**", "packages/desktop/src/daemon/daemon-manager.ts", "packages/server/src/server/test-utils/paseo-daemon.ts", "packages/server/src/server/config.ts", "packages/server/src/server/config-environment.ts", "packages/server/src/server/paseo-env.ts", "packages/server/scripts/dev-runner.ts", "packages/server/.env.example", "packages/desktop/src/daemon/node-entrypoint-launcher.ts", "packages/desktop/scripts/dev.sh", "packages/protocol/src/plugin-config.ts", "packages/app/src/plugins/surface-screen.tsx", "packages/app/src/screens/settings/plugins-page.tsx", "packages/app/src/constants/platform.ts"] updatedAt=2026-10-07T17:55:00Z -->

# Discovery: plugins

## Built-in registry and packaging

- `packages/server/src/server/plugins/builtin/index.ts` — `builtinPlugins` id array (includes `zekoder`); `resolveBuiltinPluginsRoot()` picks `<asar parent>/builtin-plugins` (desktop), `dist/server/builtin-plugins` (built) or repo `plugins/` (dev). `BuiltinPluginLoader(root, list).load(start)` yields `{id, directory: root/id}`; `.ids` = the list, and `PluginService.builtinPluginIds` comes from it (`plugins/index.ts:119-120`) — un-listing an id lifts its reservation everywhere.
- `packages/server/package.json` `build:lib` — cpSync of whole `plugins/` (incl. `zekoder.lock.json`) into `dist/server/builtin-plugins` (drops node_modules, test dirs, \*.test/spec, tsbuildinfo).
- `packages/desktop/electron-builder.yml:20,32-33` — builtin-plugins outside asar, shipped as extraResource.
- `plugins/` — workspace `@getpaseo/builtin-plugins`; one `tsconfig.json` typechecks all plugin dirs via `typecheck:server`. Plugin dirs have no own package.json/tsconfig.
- Built-in client entries compiled by the daemon at start and served via plugin catalog; app fetches in `packages/app/src/plugins/catalog-sync.tsx`.

## Vendored zekoder plugin

- `plugins/zekoder/` vendored from cyberneticlabs/zekoder-plugins by `scripts/sync-zekoder-plugin.mjs` (`--ref`, `--check`). Lock `plugins/zekoder.lock.json`: `{repo, ref, commit, version, checksum}`. Never hand-edit; oxfmt/oxlint/knip skip it.
- `computeTreeChecksum` (`scripts/sync-zekoder-plugin.mjs:104-130`, `listFiles` + hash loop): regular files only, sorted `/`-joined relative paths, sha256 of `"<path>\0<len>\0"` + bytes + `"\0"`, hex. Lock `checksum` is its output; the zekoder-plugins release `treeChecksum` uses the same algorithm. Server code cannot import `scripts/` — port it and pin with a test against the lock.
- `plugins/zekoder/paseo-plugin.json` — `{id, description, requirements: {paseo: ">=0.9.2"}}`; version lives only in the lock.
- Its UI: `index.client.tsx` registers surfaces (`issues`, `reports`, `zekoder`), workspace panels and sidebar items via `@getpaseo/plugin/client`; plugin code has no access to daemon `client.reloadPlugin`.

## Start and fallback seams

- `PluginService.start()` (`plugins/index.ts` ~L175): built-ins first via loader; per-plugin try/catch logs failure, never crashes; then `publishProviderRegistrations(id, directory)`. Configured entries only if `pluginsEnabled`; a configured entry with a built-in id is ignored with one warning (~L189-195).
- `listPlugins()` (~L208) lists configured, non-built-in entries only; directory installs carry `installation.identity = {kind:"directory", path}` (no `source` field). `reloadPlugin` (~L426) rejects built-in ids, needs an enabled configured source and `pluginsEnabled === true`.
- Persisted schema: `packages/protocol/src/plugin-config.ts` `DirectoryPluginSourceSchema {source:"directory", path, enabled?}`; `pluginsEnabled` defaults false (`config.ts` ~L628). Writes go through `daemonConfigStore.patch({plugins})`.
- `runtime.ts` ~L346 `startBuiltinPlugin({id, directory})`: readPluginManifest → id check → `assertPluginCompatibility` (requirements vs daemonVersion) → `compilePlugin` → launch; throws before registering on failure; `stopPluginById` is a safe no-op when absent.
- Import validation (`compiler.ts` ~L228-265, `compiler-imports.ts`): host modules (plugin SDK specifiers, zod, react, react-native, @tanstack/react-query, node built-ins) skip resolution; other imports resolve from the plugin dir (`ts.findConfigFile` walks up for tsconfig) — a plugin copied outside the repo must be proven to compile by test.
- Locks: `rejectBuiltinId` (`index.ts` ~L787) on install/enable/disable/reload/update paths.
- Bootstrap wiring: `bootstrap.ts` `PaseoDaemonConfig` ~L390 (`isDev` ~L420), dependencies incl. `builtinPlugins` ~L484, `resolveBuiltinPluginLoader` ~L495 (injected loader wins), `new PluginService(logger, daemonConfigStore, daemonVersion, {managedSources, builtinPlugins, settingsDirectory})` ~L622.
- Test daemon: `test-utils/paseo-daemon.ts` `createTestPaseoDaemon` options (~L54) forward `builtinPlugins` (~L107) into bootstrap dependencies.

## Dev signal and env

- Dev signal: `config.isDev` = `PASEO_NODE_ENV === "development"` (`paseo-env.ts:79`, `config.ts` ~L637). Set by `packages/server` `dev` script and by `createElectronNodeEnv` when unpackaged (`node-entrypoint-launcher.ts:33`); packaged desktop and `bin/paseo` force `production`; unset = not dev.
- `config.ts:568` filters env through `configurationEnvironment` (`config-environment.ts:71`): a new env key must be added to `CONFIG_CONTEXT_ENV_KEYS` (context, survives managed launch) or `DAEMON_SETTING_ENV_KEYS` (stripped by `daemonLaunchEnvironment` in managed mode).
- `.env`: only `npm run dev` loads one — `packages/server/.env` via dotenv in `packages/server/scripts/dev-runner.ts:1-8`; template `packages/server/.env.example`. `dev:desktop` loads none; its Electron app targets the 6768 dev daemon (`PASEO_DAEMON_ENDPOINT` in `packages/desktop/scripts/dev.sh`); a desktop-managed daemon inherits `process.env`.

## App plugin UI

- Settings list: `packages/app/src/screens/settings/plugins-page.tsx` — `pluginQueryKey` (L36, `["plugins", serverId]`), `useFetchQuery` + `client.listPlugins()` (~L300), refresh on `status.plugin_catalog_changed`; row menu Reload always shown (disabled unless enabled); reload mutation inline (no reusable hook). Test: `plugins-page.test.tsx`.
- Surface host: `packages/app/src/plugins/surface-screen.tsx` `PluginSurfaceScreen` — has `serverId`, `pluginId`, `client` (L138-151) and the screen header (~L178-188); hosts every plugin surface incl. Zekoder's.
- App dev flag: `isDev` (`__DEV__`) in `packages/app/src/constants/platform.ts:29`.

## Reusable helpers

- `atomic-file.ts` — `writeFileAtomic`, `writeJsonFileAtomic`; `private-files.ts` — `writePrivateFileAtomicSync` (0600).
- `managed-source/registry.ts` ~L32 — fetch with `redirect: "error"` + `AbortSignal.timeout`. `managed-source/npm.ts` — integrity-check pattern.
- `semver` is a server dependency. `tar` exists only transitively (lockfile v7). No ed25519/minisign lib: use `node:crypto` (JWK `{kty:"OKP", crv:"Ed25519", x}` import).

## RPC and capability templates

- Plugin RPCs: `plugin.list.request` (client `listPlugins`), `plugin.reload.request` (handler `session.ts` ~L2405, client `reloadPlugin` ~L5594), `plugin.directory.install.request` (`session.ts` ~L2527). List item schema `messages.ts` ~L6633.
- `plugin.source.status.request/.response` — `messages.ts` ~L1510/~L6701, union registration ~L3223/~L6824; handler `session.ts` ~L2485; client `daemon-client.ts` ~L5525 with feature gate.
- `server_info.features` schema `messages.ts` ~L3548-3625 (e.g. `pluginSourceUpdates` COMPAT ~L3607); advertised in `websocket-server.ts` ~L1830-1845.
- Protocol tests: `packages/protocol/src/messages.plugins.test.ts`.

## Plugin PaseoApi

- `PaseoApi` (`packages/client/src/index.ts` ~L484, `createPaseoApi` ~L547): terminals/workspaces/projects/agents/providers/config only, no plugins namespace.
- Client side: `usePaseo()` (`packages/plugin/src/client/paseo-context.tsx`). Server side: `PluginHandlerContext { paseo: PaseoApi }` (`packages/plugin/src/server/contracts.ts:10`), built per plugin process by `createPaseoApi(daemonClient)` in `plugins/plugin-process.ts:275` — a `DaemonClient` over `ipc://plugin/<id>`.
- Suite for handler→PaseoApi behaviour: `plugins/plugin-paseo-api.e2e.test.ts`.

## Release channel

- Desktop `ReleaseChannelSchema` stable|beta in `packages/desktop/src/settings/desktop-settings.ts`; `resolveRequestedReleaseChannel` in `daemon-manager.ts` ~L394; daemon spawn ~L303-325. The daemon itself does not know the channel.

## Checks and tests

- `scripts/builtin-plugins-dist.test.mjs` (ci.yml ~L121) — every builtin in dist compiles, starts, appears in catalog.
- `packages/desktop/e2e/packaged-app-smoke.js:35-57` — catalog ids must equal `builtinPlugins`; built-ins start offline without credentials.
- `plugins/builtin/index.test.ts`, `plugins/index.posix.test.ts` (fixtures createPlugin/createStore/BuiltinPluginLoader), `plugins/runtime.posix.test.ts`, `plugins/internal-seam.e2e.test.ts`, `plugins/lifecycle/handlers.test.ts`; config: `config-plugins.test.ts`; `scripts/sync-zekoder-plugin.test.mjs`.
- ci.yml ~L55 explicit `node --test scripts/*.test.mjs` list; scripts are Node ESM `.mjs` with sibling `.test.mjs`, CLI guard `scripts/is-main-module.mjs`.

## Docs

- `docs/plugins.md` "Built-in plugins" ~L89-114 and "Vendored plugins" ~L116+. `docs/development.md:22` (desktop dev daemon env). `plan.md` plugin delivery ~L44-54.
