---
id: 005-dev-zekoder-plugin-path-override
type: feature
title: Dev-only local path override for the built-in Zekoder plugin
status: planned
createdAt: 2026-10-07
openedAt: 2026-10-07T17:38:25.452Z
updatedAt: 2026-10-07T17:43:16.532Z
branch: feature-005-dev-zekoder-plugin-path-override
promoted: false
dependsOn: []
packages: []
contracts: []
relatedFeatures:
  - 001-builtin-zekoder-plugin
  - 004-plugin-auto-update
relatedBugs: []
relatedFollowups: []
statusHistory: []
---
# Feature 005-dev-zekoder-plugin-path-override: Dev-only local path override for the built-in Zekoder plugin

> **Light-tier plan.** One branch (`feature-005-dev-zekoder-plugin-path-override`), one document.
> No protocol change, no new RPC, no cross-package contract. The app reuses the existing
> `plugin.list` and `plugin.reload` RPCs.

## User's request (verbatim)

"Dev-only local override of the built-in Zekoder plugin. Today `zekoder` is a reserved built-in ID (vendored in plugins/zekoder, loaded by BuiltinPluginLoader in packages/server/src/server/plugins/builtin/index.ts) and cannot be installed over, reloaded, enabled or disabled. Developer (solo) wants: when the app runs in dev/debug mode, an env var from .env (e.g. ZEKODER_PLUGIN_DEV_PATH=/Users/ahmedelshalaby/Code/zekoder/zekoder-plugins/paseo) links the Zekoder plugin to that local source directory, so they can edit the plugin source and reload it from the UI (their current workflow with a directory-installed plugin). In production/packaged builds the var must be ignored: no custom path, no reload button, only the vendored built-in end-user behavior."

User decision: include a dev-only reload button where the Zekoder plugin's UI is shown.

## Refined scope

- **Dev daemon only.** The override applies when `PASEO_NODE_ENV=development`. `npm run dev` and the unpackaged desktop launcher already set it; packaged builds get `production`.
- **With `ZEKODER_PLUGIN_DEV_PATH` set:** `zekoder` is dropped from the built-in list and runs as an ordinary directory plugin from that path.
- **Reserved IDs:** the rules stay as they are. `PluginService.builtinPluginIds` comes from the loader's list (`plugins/index.ts:119-120`), so an un-listed `zekoder` can be listed and reloaded.
- **Reload button:** a dev-only "Reload plugin" button in the app's plugin surface header.

## Assumptions (recommended defaults; the user did not answer, so the coordinator chose them)

- **Generic button.** It shows in a dev app build for any plugin that `plugin.list` reports as a directory install, not only `zekoder`. In production `zekoder` is never listed, so the button cannot appear for it.
- **Seed scope.** The seed sets `pluginsEnabled: true` and `plugins.zekoder` in the dev home config only (`.dev/paseo-home`). Enabling plugins also starts any other plugins already configured there.
- **After unsetting the var**, the built-in returns. The existing start warning (`plugins/index.ts:189-195`) ignores the leftover `plugins.zekoder` entry.

## Out of scope

- Any packaged or production behavior change.
- Reserved-ID rule changes.
- Editing `plugins/zekoder/` or `scripts/sync-zekoder-plugin.mjs`.
- Any `server_info` or protocol field.
- A `.env` loader for desktop.
- Tilde expansion.
- Touching the daemon on 6767.

## Approach

**Config (server).**
- `config.ts:568` filters env through `configurationEnvironment`.
  - Add `ZEKODER_PLUGIN_DEV_PATH` to `CONFIG_CONTEXT_ENV_KEYS` in `config-environment.ts`.
  - Do not add it to `DAEMON_SETTING_ENV_KEYS`, which managed launches strip.
- In `config.ts`, next to `isDev` (~L637), add:
  `zekoderPluginDevPath: isDev && raw ? path.resolve(raw) : undefined`, where `raw = nonEmptyEnv(env.ZEKODER_PLUGIN_DEV_PATH)`.
  - `path.resolve` resolves against the daemon cwd. There is no `~` expansion.
- Add the optional field to `PaseoDaemonConfig` (`bootstrap.ts:390`).
- The value reaches `PaseoDaemonConfig` only through `loadConfig` / `resolveConfigFromPersisted`. Nothing else sets it.

**Loader (server, `bootstrap.ts`).**
- `resolveBuiltinPluginLoader(dependencies)` (~L495) gains a second parameter: `zekoderPluginDevPath: string | undefined`. The call site (~L632) passes `config.zekoderPluginDevPath`.
- An injected `dependencies.builtinPlugins` still wins.
- Otherwise, when the path is set, it returns
  `new BuiltinPluginLoader(undefined, builtinPlugins.filter((id) => id !== "zekoder"))`.
- No new helper in `builtin/index.ts`.

**Seed (server).**
- New file `packages/server/src/server/plugins/builtin/dev-override.ts` (kept out of `builtin/index.ts` to limit conflicts with 004).
- It exports `seedZekoderDevPlugin(store: Pick<DaemonConfigStore, "get" | "patch">, devPath: string): boolean`.
- `daemonConfigStore.patch` replaces `plugins` wholesale (`daemon-config-store.ts:370`), so the function must merge:
  ```ts
  const current = store.get();
  const entry = current.plugins?.zekoder;
  if (current.pluginsEnabled === true && entry?.source === "directory" && entry.path === devPath && entry.enabled !== false) return false;
  store.patch({ plugins: { ...current.plugins, zekoder: { source: "directory", path: devPath, enabled: true } }, pluginsEnabled: true });
  return true;
  ```
- In `bootstrap.ts`, call it before `new PluginService` (~L622) when `config.zekoderPluginDevPath` is set. Log one `warn` with the path.

**Dev `.env`.**
- `npm run dev` already loads `packages/server/.env` (dotenv, `packages/server/scripts/dev-runner.ts:1-8`) and passes `process.env` down to the daemon.
- `dev:desktop` loads no `.env`. Its Electron app targets the 6768 dev daemon (`PASEO_DAEMON_ENDPOINT` in `packages/desktop/scripts/dev.sh`).
- Workflow: run `npm run dev` with the `.env` set, then `npm run dev:desktop`. No new loader.

**Button (app; the least invasive spot).**
- It goes in `packages/app/src/plugins/surface-screen.tsx`, the host screen for every plugin surface, including the Zekoder pages. That screen already holds `serverId`, `pluginId` and `client` (L138-151) and builds the header (~L178-188).
- **Visibility:** a header icon button, shown only when `isDev` (`@/constants/platform`) is true **and** the `plugin.list` entry for `pluginId` has `installation?.identity.kind === "directory"`.
- **Data:** export `pluginQueryKey` from `screens/settings/plugins-page.tsx:36`. Read it with the same `useFetchQuery` + `client.listPlugins()` pattern used there (L300-309), so the cache is shared and `status.plugin_catalog_changed` refreshes it.
- **Action:** press calls `client.reloadPlugin(pluginId)`. The button is disabled while the reload is pending.
- **Feedback:** on error, show an inline `<Text style={styles.errorText}>` under the header with the error message. This reuses the screen's existing `errorText` style (L237, L254). On success, the plugin catalog refresh re-renders the surface.

**Merge-conflict risk with 004-plugin-auto-update.**
- 004 also edits `bootstrap.ts` (~L495/~L622 loader and `PluginService` wiring) and the "Built-in plugins" section of `docs/plugins.md`. Whichever lands second rebases onto the other.
- This plan keeps those edits to two hunks and puts the seed in its own file.
- If 004 lands first and resolves the zekoder directory from an update cache, skip that path when `zekoderPluginDevPath` is set.

## Related work considered

- **004-plugin-auto-update** (feature, planned): separate. It shares files only (see the conflict risk above). There is no dependency either way.
- **001-builtin-zekoder-plugin** (merged): context. It created the reservation this feature lifts in dev.
- **Open bugs/followups:** none overlap.
- **Decisions:** none recorded for this area.

## Tasks

- [ ] 1. **Config.**
  - `packages/server/src/server/config-environment.ts`: add the key to `CONFIG_CONTEXT_ENV_KEYS`.
  - `packages/server/src/server/config.ts`: add `zekoderPluginDevPath` (gated on `isDev`, resolved with `path.resolve`).
  - `bootstrap.ts`: add the optional field to `PaseoDaemonConfig`.
- [ ] 2. **Loader and seed.**
  - New `packages/server/src/server/plugins/builtin/dev-override.ts`: `seedZekoderDevPlugin`, as above.
  - `packages/server/src/server/bootstrap.ts`: add the second parameter to `resolveBuiltinPluginLoader` with the inline filter, call `seedZekoderDevPlugin`, and log the warning before `new PluginService`.
- [ ] 3. **Server tests in existing suites.**
  - `config-plugins.test.ts`: the path is resolved to absolute only with `PASEO_NODE_ENV=development`, and is `undefined` for `production` or unset.
  - `plugins/builtin/index.test.ts`: a `BuiltinPluginLoader` built with the filtered list has no `zekoder` in `ids` and does not pass it to `load`.
  - `plugins/index.posix.test.ts`:
    - Using `createStore` with an existing `other` directory entry, `seedZekoderDevPlugin` keeps `other`, adds `zekoder`, and sets `pluginsEnabled`.
    - A second call returns `false`.
    - A `PluginService` with the filtered loader lists `zekoder` as a directory install, and `reloadPlugin("zekoder")` is not rejected as reserved.
- [ ] 4. **App button.**
  - `packages/app/src/screens/settings/plugins-page.tsx`: export `pluginQueryKey`.
  - `packages/app/src/plugins/surface-screen.tsx`: add the button, its pending state, and the inline error text.
- [ ] 5. **App test.** New `packages/app/src/plugins/surface-screen.test.tsx`, reusing the host-runtime / `listPlugins` / `reloadPlugin` mocks from `plugins-page.test.tsx:23-120`.
  - The button shows for a directory install when `isDev` is true.
  - It is hidden when `isDev` is false, and hidden when the plugin is not listed.
  - Pressing it calls `reloadPlugin(pluginId)`.
- [ ] 6. **Docs and env template.**
  - `docs/plugins.md` "Built-in plugins": rewrite the line "Editing one in development requires a daemon restart." to describe `ZEKODER_PLUGIN_DEV_PATH`. State that it needs an absolute path, that only the dev daemon honors it, and where the reload button is.
  - `packages/server/.env.example`: add a commented `# ZEKODER_PLUGIN_DEV_PATH=/absolute/path/to/zekoder-plugins/paseo` line with the comment "use an absolute path".

## Verification

- **Gates** (npm scripts only): `npm run typecheck`, `npm run lint -- <changed files>`, `npm run format:files -- <changed files>`.
- **Tests:** run each changed test file alone with `npx vitest run <file> --bail=1 > /tmp/test-output.txt 2>&1`.
- **Manual check** (dev daemon on 6768 only):
  1. With an absolute path in `packages/server/.env`, run `npm run dev`. `npm run cli -- plugin ls` shows `zekoder` with that path, and other configured plugins are still listed.
  2. Edit the plugin source, then press the header reload on a Zekoder surface. The change appears without a daemon restart.
  3. Remove the var and restart the dev daemon. `zekoder` is built-in again and absent from `plugin ls`, and there is no button.
- **Production guard:** with `PASEO_NODE_ENV=production`, `zekoderPluginDevPath` is `undefined` (task 3 test).
