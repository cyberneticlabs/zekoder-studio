<!-- discovery-stamp: sha=fe5c5681e2228de4e578fae2fd1b6d6703c3bbe4 globs=["packages/server/src/server/plugins/**", "plugins/**", "packages/desktop/electron-builder.yml", "packages/desktop/e2e/packaged-app-smoke.js", "scripts/builtin-plugins-dist.test.mjs", "scripts/*.mjs", "packages/server/package.json", ".github/workflows/ci.yml", "knip.json", ".oxlintrc.json", ".oxfmtrc.json", "docs/plugins.md", "plan.md"] updatedAt=2026-10-04T12:20:00Z -->
# Discovery: plugins

## Built-in registry and packaging
- `packages/server/src/server/plugins/builtin/index.ts` — `builtinPlugins` string-id array: the only per-id list. `resolveBuiltinPluginsRoot()` picks `<asar parent>/builtin-plugins` (desktop), `dist/server/builtin-plugins` (built) or repo `plugins/` (dev). `BuiltinPluginLoader.ids` set.
- `packages/server/package.json` `build:lib` — cpSync of whole `plugins/` into `dist/server/builtin-plugins` (drops node_modules, test dirs, *.test/spec, tsbuildinfo).
- `packages/desktop/electron-builder.yml:20,32-33` — builtin-plugins outside asar, shipped as extraResource.
- `plugins/` — workspace `@getpaseo/builtin-plugins` (deps: @getpaseo/plugin, zod); one `tsconfig.json` (NodeNext, DOM, jsx) typechecks all plugin dirs via `typecheck:server`. Plugin dirs have no own package.json/tsconfig; a nested tsconfig changes compiler resolution (`compiler-imports.ts:21`).
- Built-in client entries are compiled by the daemon at start (`runtime.ts` startBuiltinPlugin) and served via plugin catalog; app fetches in `packages/app/src/plugins/catalog-sync.tsx`.

## Import rules
- `compiler.ts:13` SERVER_HOST_MODULES; `:246-256` allowed without local install: plugin SDK specifiers (`plugins/plugin-sdk-specifiers.ts`), zod, react, react-native, @tanstack/react-query, node built-ins. Client externals `:400-410`.

## PluginService (`plugins/index.ts`)
- `start()` ~L175: built-ins load first (failure logged, never crashes), then configured entries if `pluginsEnabled`.
- Install paths reject built-in ids ("reserved for a built-in plugin", ~L254/287/315).
- Collision gap (pre-001): configured entry with a built-in id records "already running" failure, lists as running, and disable/remove/global-off `stopPlugin` stops the built-in; remove deletes `settingsDirectory/<id>`. Feature 001 plans guards in startPlugin/stopPlugin/removePlugin/listPlugins.

## Checks and tests
- `scripts/builtin-plugins-dist.test.mjs` (ci.yml ~L121) — every builtin in dist compiles, starts, appears in catalog.
- `packages/desktop/e2e/packaged-app-smoke.js:35-57` — catalog ids must equal `builtinPlugins`; built-ins must start offline without credentials.
- `plugins/builtin/index.test.ts`, `plugins/index.posix.test.ts` (fixtures: createPlugin/createStore/BuiltinPluginLoader), `plugins/internal-seam.e2e.test.ts`.
- ci.yml ~L55 explicit `node --test scripts/*.test.mjs` list; scripts are Node ESM `.mjs` with sibling `.test.mjs`, CLI guard `scripts/is-main-module.mjs`.
- Lint/format/knip have no plugin-specific ignores; vendored code needs explicit ignores to stay byte-identical.

## Docs
- `docs/plugins.md` "Built-in plugins" ~L89-108. `plan.md` plugin delivery ~L44-54, success signals ~L168-173.
