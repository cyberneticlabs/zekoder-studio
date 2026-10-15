<!-- discovery-stamp: sha=9f2afec4f0459a8d377eb3353106830db914b61d globs=["packages/server/src/server/plugins/**", "plugins/**", "packages/desktop/electron-builder.yml", "packages/desktop/e2e/packaged-app-smoke.js", "scripts/builtin-plugins-dist.test.mjs", "scripts/*.mjs", "scripts/plugin-release*", "scripts/desktop-release/**", "packages/server/package.json", ".github/workflows/**", ".gitattributes", "knip.json", ".oxlintrc.json", ".oxfmtrc.json", "docs/plugins.md", "plan.md", "packages/server/src/server/bootstrap.ts", "packages/server/src/server/session.ts", "packages/server/src/server/websocket-server.ts", "packages/server/src/server/atomic-file.ts", "packages/protocol/src/messages.ts", "packages/client/src/index.ts", "packages/client/src/daemon-client.ts", "packages/plugin/src/**", "packages/desktop/src/daemon/daemon-manager.ts", "packages/desktop/src/features/__fixtures__/desktop-release-catalog.wire.json", "packages/server/src/server/test-utils/paseo-daemon.ts", "packages/server/src/server/config.ts", "packages/server/src/server/config-environment.ts", "packages/server/src/server/paseo-env.ts", "packages/server/scripts/dev-runner.ts", "packages/server/.env.example", "packages/desktop/src/daemon/node-entrypoint-launcher.ts", "packages/desktop/scripts/dev.sh", "packages/protocol/src/plugin-config.ts", "packages/app/src/plugins/surface-screen.tsx", "packages/app/src/screens/settings/plugins-page.tsx", "packages/app/src/constants/platform.ts", "packages/app/src/zekoder/**"] updatedAt=2026-10-15T00:07:43Z -->

# Discovery: plugins

## Built-in registry and packaging

- `packages/server/src/server/plugins/builtin/index.ts` — `builtinPlugins` id array (includes `zekoder`); `resolveBuiltinPluginsRoot()` picks `<asar parent>/builtin-plugins` (desktop), `dist/server/builtin-plugins` (built) or repo `plugins/` (dev). `BuiltinPluginLoader(root, list).load(start)` yields `{id, directory: root/id}`; `.ids` = the list, and `PluginService.builtinPluginIds` comes from it (`plugins/index.ts:119-120`) — un-listing an id lifts its reservation everywhere.
- `packages/server/package.json` `build:lib` (~L76) — cpSync of whole `plugins/` into `dist/server/builtin-plugins` (drops node_modules, test dirs, \*.test/spec, tsbuildinfo).
- `packages/desktop/electron-builder.yml:20,32-33` — builtin-plugins outside asar, shipped as extraResource.
- `plugins/` — workspace `@getpaseo/builtin-plugins` (deps `@getpaseo/plugin`, zod; react/react-native/react-query types resolve via root hoist); one NodeNext `tsconfig.json` typechecks all plugin dirs via `typecheck:server`. Plugin dirs have no own tsconfig (a nested one breaks compiler resolution). A nested package.json is not a workspace member (root `workspaces` lists `plugins` only).
- Built-in client entries compiled by the daemon at start and served via plugin catalog; app fetches in `packages/app/src/plugins/catalog-sync.tsx`.

## Zekoder plugin source and identity

- `plugins/zekoder/` is the in-repo source of the built-in `zekoder` plugin (internals: kb/discovery/zekoder-plugin.md). No vendoring, sync script or lock file exists.
- Version source: `plugins/zekoder/package.json` `version`, equal to `shared/plugin-version.ts` `PLUGIN_VERSION`. The `files` list is the release allowlist; `README.md` and `package.json` sit outside it.
- `scripts/zekoder-plugin-tree.mjs`: `computeTreeChecksum` (regular files only, sorted `/`-joined relative paths, sha256 of `"<path>\0<len>\0"` + bytes + `"\0"`, hex), `copyAllowlist`, `computeAllowlistChecksum(dir)` (stage the `files` allowlist, hash the staged tree), `zekoderPluginProvenanceAt(git, commit)` (reads the plugin from the commit's tree via `git archive`, never the working tree). Hashing the whole directory never equals a release `treeChecksum`. Server port: `builtin/updates/tree-checksum.ts:25`, pinned by `tree-checksum.test.ts`.
- Daemon bundled version: `builtin/updates/wiring.ts` `readBundledVersion(<root>/zekoder/package.json)`; null silently disables auto-update.
- Desktop release provenance: `scripts/desktop-release/prepare-release.mjs` and `release-ci.mjs` call `zekoderPluginProvenanceAt`; catalog `plugins` record `{repo: origin URL, ref: "plugins/zekoder", commit, version, checksum}`. Old catalogs hold tag refs from the former plugin repo (`release-data.mjs` ~L261; wire fixture `packages/desktop/src/features/__fixtures__/desktop-release-catalog.wire.json`). `desktop-release-catalog.ts` never reads `plugins`.
- App: `packages/app/src/zekoder/host-provisioning.ts` `ZEKODER_PLUGIN_VERSION` is the npm pin of `@cyberneticlabs/paseo-zekoder` for stock daemons; it only moves after an npm publish (followup 010-publish-paseo-zekoder-to-npm). The test checks its shape, not `package.json`.
- Tooling: oxlint ignores `plugins/zekoder/**` (`.oxlintrc.json:6`, followup 008-lint-zekoder-plugin-source); oxfmt and knip cover it. `.gitattributes` `plugins/zekoder/** -text` keeps the checksum stable on Windows.
- `paseo-plugin.json` is `{id, description, requirements: {paseo: ">=0.9.2"}}`; no version field. Plugin code has no access to daemon `client.reloadPlugin`.

## Plugin release pipeline

- Tags `zekoder-plugin-vX.Y.Z` (stable) and `zekoder-plugin-vX.Y.Z-beta.N` (beta), agent-only like desktop tags. `.github/workflows/plugin-release.yml`: tag push publishes, `workflow_dispatch` on `main` revokes. Runbook: docs/release.md "Zekoder plugin releases"; design: Studio feature 013-plugin-auto-update-publishing.
- `scripts/plugin-release.mjs` (`check-tag`, `build`, `next`, `revoke`, `sign`, `verify`, `keygen`; plain Node, tests `plugin-release.test.mjs`) reads `plugins/zekoder`. Keyring: `scripts/plugin-release-keys.json`, which `builtin/updates/trusted-keys.ts` `TRUSTED_KEYS` must equal (test-pinned).
- Environment `plugin-release`: secret `ZEKODER_PLUGIN_SIGNING_KEY`; vars `ZEKODER_PLUGIN_SIGNING_KEY_ID`, `ZEKODER_RELEASE_BUCKET`, `GCP_WORKLOAD_IDENTITY_PROVIDER`, `GCP_SERVICE_ACCOUNT` (the last two names collide with the desktop repo vars; environment vars shadow them).
- Storage: `gs://zekoder-releases/plugins/zekoder/` — signed `manifest.json` (compare-and-swap with `--if-generation-match`) and immutable `releases/vX.Y.Z/zekoder-plugin-vX.Y.Z.tar.gz`. Release code never writes `releases/` or `desktop/` at the bucket root.
- Tag globs: desktop-release `v*`; android-apk-release `v*`, `android-v*`; deploy-app `v*`, `app-v*`; release-notes-sync `v*`. `zekoder-plugin-v*` matches none; `scripts/ci-workflow.test.mjs` pins both directions.

## Plugin update module (feature 004)

- `builtin/updates/`: `manifest.ts` (envelope/payload zod, `ARTIFACT_URL_PREFIX` L7, `tag` free string L15, `selectCandidate`), `trusted-keys.ts` (`TRUSTED_KEYS` `zk-plugin-2026-10`, `MANIFEST_URL`, mirrors `scripts/plugin-release-keys.json`), `tree-checksum.ts`, `index.ts` (`BuiltinPluginUpdater`), `wiring.ts` (eligibility: desktopManaged, `ZEKODER_PLUGIN_UPDATES` != off, root basename `builtin-plugins`, version present).

## Start and fallback seams

- `PluginService.start()` (`plugins/index.ts` ~L175): built-ins first via loader; per-plugin try/catch logs failure, never crashes; then `publishProviderRegistrations(id, directory)`. Configured entries only if `pluginsEnabled`; a configured entry with a built-in id is ignored with one warning (~L189-195).
- `listPlugins()` (~L208) lists configured, non-built-in entries only; directory installs carry `installation.identity = {kind:"directory", path}`. `reloadPlugin` (~L426) rejects built-in ids, needs an enabled configured source and `pluginsEnabled === true`.
- Persisted schema: `packages/protocol/src/plugin-config.ts` `DirectoryPluginSourceSchema {source:"directory", path, enabled?}`; `pluginsEnabled` defaults false (`config.ts` ~L628). Writes go through `daemonConfigStore.patch({plugins})`.
- `runtime.ts` ~L346 `startBuiltinPlugin({id, directory})`: readPluginManifest → id check → `assertPluginCompatibility` → `compilePlugin` → launch; throws before registering on failure.
- Import validation (`compiler.ts` ~L13, ~L228-265, `compiler-imports.ts`): host modules (plugin SDK specifiers, zod, react, react-native, @tanstack/react-query, node built-ins) skip resolution; other imports resolve from the plugin dir.
- Locks: `rejectBuiltinId` (`index.ts` ~L787) on install/enable/disable/reload/update paths.
- Bootstrap wiring: `bootstrap.ts` `PaseoDaemonConfig` ~L390 (`isDev` ~L420), `builtinPlugins` ~L484, `resolveBuiltinPluginLoader` ~L495, `new PluginService(...)` ~L622.
- Test daemon: `test-utils/paseo-daemon.ts` `createTestPaseoDaemon` options (~L54) forward `builtinPlugins` (~L107).

## Dev signal and env

- Dev signal: `config.isDev` = `PASEO_NODE_ENV === "development"` (`paseo-env.ts:79`, `config.ts` ~L637). Set by `packages/server` `dev` script and by `createElectronNodeEnv` when unpackaged (`node-entrypoint-launcher.ts:33`); packaged desktop and `bin/paseo` force `production`.
- `config.ts:568` filters env through `configurationEnvironment` (`config-environment.ts:71`): a new env key must be added to `CONFIG_CONTEXT_ENV_KEYS` or `DAEMON_SETTING_ENV_KEYS`.
- `.env`: only `npm run dev` loads one (`packages/server/scripts/dev-runner.ts:1-8`); template `packages/server/.env.example`. `dev:desktop` targets the 6768 dev daemon (`packages/desktop/scripts/dev.sh`).

## App plugin UI

- Settings list: `packages/app/src/screens/settings/plugins-page.tsx` — `pluginQueryKey` (L36), `client.listPlugins()` (~L300), refresh on `status.plugin_catalog_changed`. Test: `plugins-page.test.tsx`.
- Surface host: `packages/app/src/plugins/surface-screen.tsx` `PluginSurfaceScreen` (L138-151, header ~L178-188).
- App dev flag: `isDev` (`__DEV__`) in `packages/app/src/constants/platform.ts:29`. Per-host UI detail: discovery/app-host-plugins.md.

## Reusable helpers

- `atomic-file.ts` — `writeFileAtomic`, `writeJsonFileAtomic`; `private-files.ts` — `writePrivateFileAtomicSync` (0600).
- `managed-source/registry.ts` ~L32 — fetch with `redirect: "error"` + `AbortSignal.timeout`. `managed-source/npm.ts` — integrity-check pattern.
- `semver` is a server dependency. ed25519 via `node:crypto` JWK import.

## RPC and capability templates

- Plugin RPCs: `plugin.list.request`, `plugin.reload.request` (`session.ts` ~L2405), `plugin.directory.install.request` (`session.ts` ~L2527). List item schema `messages.ts` ~L6633.
- `plugin.source.status.request/.response` — `messages.ts` ~L1510/~L6701; handler `session.ts` ~L2485; client `daemon-client.ts` ~L5525 with feature gate.
- `server_info.features` schema `messages.ts` ~L3548-3625; advertised in `websocket-server.ts` ~L1830-1845. Protocol tests: `packages/protocol/src/messages.plugins.test.ts`.

## Plugin PaseoApi

- `PaseoApi` (`packages/client/src/index.ts` ~L484, `createPaseoApi` ~L547): no plugins namespace. Client `usePaseo()` (`packages/plugin/src/client/paseo-context.tsx`); server `PluginHandlerContext { paseo }` (`packages/plugin/src/server/contracts.ts:10`) built in `plugins/plugin-process.ts:275`. Suite: `plugins/plugin-paseo-api.e2e.test.ts`.

## Release channel

- Desktop `ReleaseChannelSchema` stable|beta in `packages/desktop/src/settings/desktop-settings.ts`; `resolveRequestedReleaseChannel` in `daemon-manager.ts` ~L394. The daemon reads the channel from `desktop-channel.json`.

## Checks and tests

- `scripts/builtin-plugins-dist.test.mjs` (ci.yml ~L143) — every builtin in dist compiles, starts, appears in catalog; exercises `createBuiltinUpdateWiring`.
- `packages/desktop/e2e/packaged-app-smoke.js:35-57` — catalog ids must equal `builtinPlugins`; built-ins start offline.
- `plugins/builtin/index.test.ts`, `plugins/index.posix.test.ts`, `plugins/runtime.posix.test.ts`, `plugins/internal-seam.e2e.test.ts`, `plugins/lifecycle/handlers.test.ts`, `config-plugins.test.ts`, `builtin/updates/*.test.ts`.
- ci.yml ~L78 explicit `node --test` list (includes `zekoder-plugin-tree.test.mjs`, `plugin-release.test.mjs`); scripts are Node ESM `.mjs` with sibling `.test.mjs`, CLI guard `scripts/is-main-module.mjs`. ci.yml ~L194 paths filter maps `plugins/**` to server CI.

## Docs

- `docs/plugins.md` "Built-in plugins" and "The Zekoder plugin" (version source, checksum, update eligibility); `docs/zekoder-plugin.md` (developing it); `docs/release.md` "Zekoder plugin releases". `docs/development.md:22`. `plan.md` repo table ~L22, plugin delivery ~L44-54.
