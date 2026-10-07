<!-- discovery-stamp: sha=6994f399eaae6766179c2174e0e63aba81e3dd74 globs=["packages/server/src/server/plugins/**", "plugins/**", "packages/desktop/electron-builder.yml", "packages/desktop/e2e/packaged-app-smoke.js", "scripts/builtin-plugins-dist.test.mjs", "scripts/*.mjs", "packages/server/package.json", ".github/workflows/ci.yml", "knip.json", ".oxlintrc.json", ".oxfmtrc.json", "docs/plugins.md", "plan.md", "packages/server/src/server/bootstrap.ts", "packages/server/src/server/session.ts", "packages/server/src/server/websocket-server.ts", "packages/server/src/server/atomic-file.ts", "packages/protocol/src/messages.ts", "packages/client/src/index.ts", "packages/client/src/daemon-client.ts", "packages/plugin/src/**", "packages/desktop/src/daemon/daemon-manager.ts"] updatedAt=2026-10-07T14:40:00Z -->
# Discovery: plugins

## Built-in registry and packaging
- `packages/server/src/server/plugins/builtin/index.ts` — `builtinPlugins` id array (includes `zekoder`); `resolveBuiltinPluginsRoot()` picks `<asar parent>/builtin-plugins` (desktop), `dist/server/builtin-plugins` (built) or repo `plugins/` (dev). `BuiltinPluginLoader(root, list).load(start)` yields `{id, directory: root/id}`.
- `packages/server/package.json` `build:lib` — cpSync of whole `plugins/` (incl. `zekoder.lock.json`) into `dist/server/builtin-plugins` (drops node_modules, test dirs, *.test/spec, tsbuildinfo).
- `packages/desktop/electron-builder.yml:20,32-33` — builtin-plugins outside asar, shipped as extraResource.
- `plugins/` — workspace `@getpaseo/builtin-plugins`; one `tsconfig.json` typechecks all plugin dirs via `typecheck:server`. Plugin dirs have no own package.json/tsconfig.
- Built-in client entries compiled by the daemon at start and served via plugin catalog; app fetches in `packages/app/src/plugins/catalog-sync.tsx`.

## Vendored zekoder plugin
- `plugins/zekoder/` vendored from cyberneticlabs/zekoder-plugins by `scripts/sync-zekoder-plugin.mjs` (`--ref`, `--check`; `computeTreeChecksum`). Lock `plugins/zekoder.lock.json`: `{repo, ref, commit, version, checksum}`. Never hand-edit; oxfmt/oxlint/knip skip it.
- `plugins/zekoder/paseo-plugin.json` — `{id, description, requirements: {paseo: ">=0.9.2"}}`; version lives only in the lock.

## Start and fallback seams
- `PluginService.start()` (`plugins/index.ts` ~L175): built-ins first via loader; per-plugin try/catch logs failure, never crashes; then `publishProviderRegistrations(id, directory)`. Configured entries only if `pluginsEnabled`.
- `runtime.ts` ~L346 `startBuiltinPlugin({id, directory})`: readPluginManifest → id check → `assertPluginCompatibility` (requirements vs daemonVersion) → `compilePlugin` → launch; throws before registering on failure; `stopPluginById` is a safe no-op when absent.
- Import validation (`compiler.ts` ~L228-265, `compiler-imports.ts`): host modules (plugin SDK specifiers, zod, react, react-native, @tanstack/react-query, node built-ins) skip resolution; other imports resolve from the plugin dir (`ts.findConfigFile` walks up for tsconfig) — a plugin copied outside the repo must be proven to compile by test.
- Locks: `rejectBuiltinId` (`index.ts` ~L787) on install/enable/disable/reload/update paths; configured entry sharing a built-in id is ignored with a warning.
- Bootstrap wiring: `packages/server/src/server/bootstrap.ts` ~L597-634 (`resolveDaemonVersion`, `new PluginService(logger, store, daemonVersion, {managedSources, builtinPlugins, settingsDirectory})`, `paseoHome`).

## Reusable helpers
- `atomic-file.ts` — `writeFileAtomic`, `writeJsonFileAtomic`; `private-files.ts` — `writePrivateFileAtomicSync` (0600).
- `managed-source/registry.ts` ~L32 — fetch with `redirect: "error"` + `AbortSignal.timeout`. `managed-source/npm.ts` — integrity-check pattern.
- `semver` is a server dependency. `tar` exists only transitively (lockfile v7). No ed25519/minisign lib: use `node:crypto`.

## RPC and capability templates
- `plugin.source.status.request/.response` — `packages/protocol/src/messages.ts` ~L1510/~L6701, union registration ~L3223/~L6824; handler `session.ts` ~L2485 (`this.pluginRuntime`); client `daemon-client.ts` ~L5525 with feature gate.
- `server_info.features` schema `messages.ts` ~L3548-3625 (e.g. `pluginSourceUpdates` COMPAT ~L3607); advertised in `websocket-server.ts` ~L1830-1845.
- Protocol tests: `packages/protocol/src/messages.plugins.test.ts`.
- `PaseoApi` (`packages/client/src/index.ts` ~L484, `createPaseoApi` ~L547): terminals/workspaces/projects/agents/providers/config only, no plugins namespace. Plugin client (`usePaseo()`, `packages/plugin/src/client/paseo-context.tsx`) and server context (`packages/plugin/src/server/contracts.ts`) both receive `PaseoApi`; `useRpc` calls the plugin's own server RPCs.

## Release channel
- Desktop `ReleaseChannelSchema` stable|beta in `packages/desktop/src/settings/desktop-settings.ts`; `resolveRequestedReleaseChannel` in `packages/desktop/src/daemon/daemon-manager.ts` ~L394; daemon spawn env ~L315 (`PASEO_CLI` only). The daemon itself does not know the channel.

## Checks and tests
- `scripts/builtin-plugins-dist.test.mjs` (ci.yml ~L121) — every builtin in dist compiles, starts, appears in catalog.
- `packages/desktop/e2e/packaged-app-smoke.js:35-57` — catalog ids must equal `builtinPlugins`; built-ins start offline without credentials.
- `plugins/builtin/index.test.ts`, `plugins/index.posix.test.ts` (fixtures createPlugin/createStore/BuiltinPluginLoader), `plugins/runtime.posix.test.ts`, `plugins/internal-seam.e2e.test.ts`; `scripts/sync-zekoder-plugin.test.mjs`.
- ci.yml ~L55 explicit `node --test scripts/*.test.mjs` list; scripts are Node ESM `.mjs` with sibling `.test.mjs`, CLI guard `scripts/is-main-module.mjs`.

## Docs
- `docs/plugins.md` "Built-in plugins" ~L89-114 and "Vendored plugins" ~L116+. `plan.md` plugin delivery ~L44-54, success signals ~L168-173.
