<!-- discovery-stamp: sha=702b8ee454f4f3f10e78891745b1ccb0712efc84 globs=["packages/server/src/server/plugins/**", "plugins/**", "packages/desktop/electron-builder.yml", "packages/desktop/e2e/packaged-app-smoke.js", "scripts/builtin-plugins-dist.test.mjs", "scripts/*.mjs", "packages/server/package.json", ".github/workflows/ci.yml", "knip.json", ".oxlintrc.json", ".oxfmtrc.json", "docs/plugins.md", "plan.md", "packages/server/src/server/bootstrap.ts", "packages/server/src/server/session.ts", "packages/server/src/server/websocket-server.ts", "packages/server/src/server/atomic-file.ts", "packages/protocol/src/messages.ts", "packages/client/src/index.ts", "packages/client/src/daemon-client.ts", "packages/plugin/src/**", "packages/desktop/src/daemon/daemon-manager.ts", "packages/server/src/server/test-utils/paseo-daemon.ts"] updatedAt=2026-10-07T16:45:00Z -->
# Discovery: plugins

## Built-in registry and packaging
- `packages/server/src/server/plugins/builtin/index.ts` — `builtinPlugins` id array (includes `zekoder`); `resolveBuiltinPluginsRoot()` picks `<asar parent>/builtin-plugins` (desktop), `dist/server/builtin-plugins` (built) or repo `plugins/` (dev). `BuiltinPluginLoader(root, list).load(start)` yields `{id, directory: root/id}`.
- `packages/server/package.json` `build:lib` — cpSync of whole `plugins/` (incl. `zekoder.lock.json`) into `dist/server/builtin-plugins` (drops node_modules, test dirs, *.test/spec, tsbuildinfo).
- `packages/desktop/electron-builder.yml:20,32-33` — builtin-plugins outside asar, shipped as extraResource.
- `plugins/` — workspace `@getpaseo/builtin-plugins`; one `tsconfig.json` typechecks all plugin dirs via `typecheck:server`. Plugin dirs have no own package.json/tsconfig.
- Built-in client entries compiled by the daemon at start and served via plugin catalog; app fetches in `packages/app/src/plugins/catalog-sync.tsx`.

## Vendored zekoder plugin
- `plugins/zekoder/` vendored from cyberneticlabs/zekoder-plugins by `scripts/sync-zekoder-plugin.mjs` (`--ref`, `--check`). Lock `plugins/zekoder.lock.json`: `{repo, ref, commit, version, checksum}`. Never hand-edit; oxfmt/oxlint/knip skip it.
- `computeTreeChecksum` (`scripts/sync-zekoder-plugin.mjs:104-130`, `listFiles` + hash loop): regular files only, sorted `/`-joined relative paths, sha256 of `"<path>\0<len>\0"` + bytes + `"\0"`, hex. Lock `checksum` is its output; the zekoder-plugins release `treeChecksum` uses the same algorithm. Server code cannot import `scripts/` — port it and pin with a test against the lock.
- `plugins/zekoder/paseo-plugin.json` — `{id, description, requirements: {paseo: ">=0.9.2"}}`; version lives only in the lock.

## Start and fallback seams
- `PluginService.start()` (`plugins/index.ts` ~L175): built-ins first via loader; per-plugin try/catch logs failure, never crashes; then `publishProviderRegistrations(id, directory)`. Configured entries only if `pluginsEnabled`.
- `runtime.ts` ~L346 `startBuiltinPlugin({id, directory})`: readPluginManifest → id check → `assertPluginCompatibility` (requirements vs daemonVersion) → `compilePlugin` → launch; throws before registering on failure; `stopPluginById` is a safe no-op when absent.
- Import validation (`compiler.ts` ~L228-265, `compiler-imports.ts`): host modules (plugin SDK specifiers, zod, react, react-native, @tanstack/react-query, node built-ins) skip resolution; other imports resolve from the plugin dir (`ts.findConfigFile` walks up for tsconfig) — a plugin copied outside the repo must be proven to compile by test.
- Locks: `rejectBuiltinId` (`index.ts` ~L787) on install/enable/disable/reload/update paths; configured entry sharing a built-in id is ignored with a warning.
- Bootstrap wiring: `packages/server/src/server/bootstrap.ts` ~L484-496 (dependencies incl. `builtinPlugins`, `resolveBuiltinPluginLoader`), ~L597-634 (`resolveDaemonVersion`, `new PluginService(logger, store, daemonVersion, {managedSources, builtinPlugins, settingsDirectory})` ~L622, `paseoHome`).
- Test daemon: `test-utils/paseo-daemon.ts` `createTestPaseoDaemon` options (~L54) forward `builtinPlugins` (~L107) into bootstrap dependencies — the seam for injecting plugin-service deps in e2e tests.

## Reusable helpers
- `atomic-file.ts` — `writeFileAtomic`, `writeJsonFileAtomic`; `private-files.ts` — `writePrivateFileAtomicSync` (0600).
- `managed-source/registry.ts` ~L32 — fetch with `redirect: "error"` + `AbortSignal.timeout`. `managed-source/npm.ts` — integrity-check pattern.
- `semver` is a server dependency. `tar` exists only transitively (lockfile v7). No ed25519/minisign lib: use `node:crypto` (JWK `{kty:"OKP", crv:"Ed25519", x}` import).

## RPC and capability templates
- `plugin.source.status.request/.response` — `packages/protocol/src/messages.ts` ~L1510/~L6701, union registration ~L3223/~L6824; handler `session.ts` ~L2485 (`this.pluginRuntime`); client `daemon-client.ts` ~L5525 with feature gate.
- `server_info.features` schema `messages.ts` ~L3548-3625 (e.g. `pluginSourceUpdates` COMPAT ~L3607); advertised in `websocket-server.ts` ~L1830-1845.
- Protocol tests: `packages/protocol/src/messages.plugins.test.ts`.

## Plugin PaseoApi
- `PaseoApi` (`packages/client/src/index.ts` ~L484, `createPaseoApi` ~L547): terminals/workspaces/projects/agents/providers/config only, no plugins namespace.
- Client side: `usePaseo()` (`packages/plugin/src/client/paseo-context.tsx`). Server side: `PluginHandlerContext { paseo: PaseoApi }` (`packages/plugin/src/server/contracts.ts:10`), built per plugin process by `createPaseoApi(daemonClient)` in `plugins/plugin-process.ts:275` — a `DaemonClient` over `ipc://plugin/<id>` (`daemon-transport.ts`), so feature gates read the same `server_info.features`.
- Suite for handler→PaseoApi behaviour: `plugins/plugin-paseo-api.e2e.test.ts` (temp plugin dir + `createTestPaseoDaemon`).

## Release channel
- Desktop `ReleaseChannelSchema` stable|beta in `packages/desktop/src/settings/desktop-settings.ts`; `resolveRequestedReleaseChannel` in `packages/desktop/src/daemon/daemon-manager.ts` ~L394; daemon spawn env ~L315 (`PASEO_CLI` only). The daemon itself does not know the channel.

## Checks and tests
- `scripts/builtin-plugins-dist.test.mjs` (ci.yml ~L121) — every builtin in dist compiles, starts, appears in catalog.
- `packages/desktop/e2e/packaged-app-smoke.js:35-57` — catalog ids must equal `builtinPlugins`; built-ins start offline without credentials.
- `plugins/builtin/index.test.ts`, `plugins/index.posix.test.ts` (fixtures createPlugin/createStore/BuiltinPluginLoader), `plugins/runtime.posix.test.ts`, `plugins/internal-seam.e2e.test.ts`, `plugins/lifecycle/handlers.test.ts`; `scripts/sync-zekoder-plugin.test.mjs`.
- ci.yml ~L55 explicit `node --test scripts/*.test.mjs` list; scripts are Node ESM `.mjs` with sibling `.test.mjs`, CLI guard `scripts/is-main-module.mjs`.

## Docs
- `docs/plugins.md` "Built-in plugins" ~L89-114 and "Vendored plugins" ~L116+. `plan.md` plugin delivery ~L44-54, success signals ~L168-173.
