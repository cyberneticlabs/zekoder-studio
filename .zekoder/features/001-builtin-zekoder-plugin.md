---
id: 001-builtin-zekoder-plugin
type: feature
title: Ship the Zekoder plugin as a non-removable built-in
status: merged
createdAt: 2026-10-04
openedAt: 2026-10-04T11:52:39.549Z
updatedAt: 2026-10-06T13:12:42.369Z
completedAt: 2026-10-06T13:12:42.369Z
branch: feature-001-builtin-zekoder-plugin
promoted: false
dependsOn: []
packages: []
contracts: []
mergeMode: local
commit: ae3d438104c8ff27a2b35806cafbea3cfab7b094
filesTouched:
  - .github/workflows/ci.yml
  - .oxfmtrc.json
  - .oxlintrc.json
  - .zekoder/features/001-builtin-zekoder-plugin.md
  - docs/plugins.md
  - knip.json
  - packages/server/src/server/plugins/builtin/index.ts
  - packages/server/src/server/plugins/index.posix.test.ts
  - packages/server/src/server/plugins/index.ts
  - plan.md
  - plugins/zekoder.lock.json
  - plugins/zekoder/client/agent-branch-pills.ts
  - plugins/zekoder/client/agent-defaults.tsx
  - plugins/zekoder/client/button.tsx
  - plugins/zekoder/client/chip.tsx
  - plugins/zekoder/client/coding-health-tab.tsx
  - plugins/zekoder/client/config-panel.tsx
  - plugins/zekoder/client/date-picker.tsx
  - plugins/zekoder/client/doc-viewer.tsx
  - plugins/zekoder/client/dropdown.tsx
  - plugins/zekoder/client/git-panel.tsx
  - plugins/zekoder/client/git-tab.ts
  - plugins/zekoder/client/health-aggregate.ts
  - plugins/zekoder/client/health-charts.tsx
  - plugins/zekoder/client/issue-detail.tsx
  - plugins/zekoder/client/issue-row.tsx
  - plugins/zekoder/client/issues-tab.tsx
  - plugins/zekoder/client/machine-defaults-panel.tsx
  - plugins/zekoder/client/panel-location.ts
  - plugins/zekoder/client/provider-onboarding.tsx
  - plugins/zekoder/client/report-settings-panel.tsx
  - plugins/zekoder/client/reports-surface.tsx
  - plugins/zekoder/client/start-agent-button.tsx
  - plugins/zekoder/client/styles.ts
  - plugins/zekoder/client/tab-bar.tsx
  - plugins/zekoder/client/telemetry-panel.tsx
  - plugins/zekoder/client/version-panel.tsx
  - plugins/zekoder/client/zekoder-surface.tsx
  - plugins/zekoder/index.client.tsx
  - plugins/zekoder/index.server.ts
  - plugins/zekoder/paseo-plugin.json
  - plugins/zekoder/server/branch.ts
  - plugins/zekoder/server/config.ts
  - plugins/zekoder/server/git.ts
  - plugins/zekoder/server/mcp-client.ts
  - plugins/zekoder/server/org-health-cli.ts
  - plugins/zekoder/server/report-server.ts
  - plugins/zekoder/server/reports.ts
  - plugins/zekoder/server/role-variants.ts
  - plugins/zekoder/server/telemetry.ts
  - plugins/zekoder/server/version.ts
  - plugins/zekoder/server/zekoder.ts
  - plugins/zekoder/shared/branch.ts
  - plugins/zekoder/shared/config.ts
  - plugins/zekoder/shared/errors.ts
  - plugins/zekoder/shared/git.ts
  - plugins/zekoder/shared/issues.ts
  - plugins/zekoder/shared/reports.ts
  - plugins/zekoder/shared/telemetry.ts
  - plugins/zekoder/shared/version.ts
  - scripts/sync-zekoder-plugin.mjs
  - scripts/sync-zekoder-plugin.test.mjs
verifiedBaseSha: 34f50d65246e713760cad9daeaf87f50e58a8b16
relatedFeatures: []
relatedBugs: []
relatedFollowups: []
statusHistory:
  - from: planned
    to: merged
    at: 2026-10-06T13:12:42.369Z
---

# Feature 001-builtin-zekoder-plugin: Ship the Zekoder plugin as a non-removable built-in

> **Light-tier plan.** One area, one branch, one document — no `packages/` folder, and no separate
> contracts or external-dependencies docs. If this turns out to be more than a single
> zekoder-coding-agent can execute, promote it (`zekoder_update_item {patch: {promoted: true}}`)
> rather than padding this document to look bigger.

## User's request (verbatim)

"Zcuader Studio should be able automatically installing Zcuader plugin. Check the Zcuder plugins repo. Upon installation, those plugins will take over its responsibility to install the skills and the other features required for Zcuder. should not be allowed to uninstall Zcuder plugins." (Zcuader/Zcuder = Zekoder; Zcuader Studio = Zekoder Studio, this repo.)

## Refined scope

- Ship `zekoder-plugins/paseo` (manifest id `zekoder`, v0.11.1) as a Paseo built-in: always active, independent of `pluginsEnabled`, not removable or disableable.
- Vendor it into `plugins/zekoder/` with `scripts/sync-zekoder-plugin.mjs`, pinned to an exact commit. The script writes `plugins/zekoder.lock.json` (repo, ref, commit SHA, plugin version, content checksum) as release-manifest input. The vendored copy is committed.
- Initial pin: `cyberneticlabs/zekoder-plugins` tag `v0.11.1` (commit `380f37b044eb5591ae551773256c5a915d7bc5f0`), superseding the planned commit `8203aae`.
- Users with a pre-existing `plugins.zekoder` config entry (directory/git install): the daemon keeps running the built-in and ignores the configured entry with one warning. Enable, disable, reload, preview-update and apply-update on that id are rejected as reserved. Remove only cleans the stale config entry. Nothing stops the built-in or deletes its settings or logs.
- Docs: `docs/plugins.md` built-in section and `plan.md` plugin delivery.

## Out of scope

- Any change in the zekoder-plugins repo (tagging, editing code or deps). Vendored files are never hand-edited; a fix there is a new pin.
- Provisioning upstream-Paseo or remote hosts not running this repo's daemon. Mobile-specific work.
- Auto-deleting a user's stale `plugins.zekoder` entry or managed git checkout (guardrail: preserve user config). `paseo plugin remove zekoder` stays available to drop it.
- A full release-manifest generator; this item only produces the lock file it will read.

## Approach

**Built-in registry.** `packages/server/src/server/plugins/builtin/index.ts:5-17` is the only per-id list. Build copy (`packages/server/package.json` `build:lib` cpSync of `plugins/`), desktop extraResource (`packages/desktop/electron-builder.yml:20,32-33`), `scripts/builtin-plugins-dist.test.mjs`, `builtin/index.test.ts` and `packages/desktop/e2e/packaged-app-smoke.js:35-57` all iterate `builtinPlugins`. No other per-id edits.

**Constraints verified.** Plugin imports are only `@getpaseo/plugin{,/server,/client,/client/react-native}`, `zod`, `react`, `react-native`, `@tanstack/react-query`, `node:*` — all allowed by `packages/server/src/server/plugins/compiler.ts:246-256` and client externals `:400-410`. Planner typechecked the copied files under `plugins/tsconfig.json` settings against the current SDK: 0 errors. Activation registers handlers and schedules unref'd timers only; no synchronous spawn/network, so offline, credential-free startup (smoke check) holds. Do not copy the plugin's `tsconfig.json`, `package.json`, `package-lock.json` or `README.md`: a nested `tsconfig.json` changes compiler resolution (`compiler-imports.ts:21`).

**Sync script.** `scripts/sync-zekoder-plugin.mjs`, Node ESM like `scripts/sync-fdroid-changelogs.mjs`, CLI guard via `scripts/is-main-module.mjs`. Two modes:

- **Sync** (`--ref <full-sha|tag>`, required): `--repo <ssh-url|local-path>`, default `git@github.com:cyberneticlabs/zekoder-plugins.git` (the repo is private; SSH uses the developer's git credentials, and a local path such as `../zekoder-plugins` needs no network). Clone to a temp dir, resolve `ref` to a commit, and reject anything that is not a 40-hex SHA or an existing tag (no branches). Read `paseo/package.json` `files` as the copy allowlist. Replace `plugins/zekoder/` wholesale. Checksum = sha256 over sorted `relativePath\0content` entries. Write `plugins/zekoder.lock.json`: `{repo, ref, commit, version, checksum}`, 2-space JSON plus trailing newline. `repo` records the default SSH URL even when a local path was used, so the lock never holds a machine path.
- **Check** (`--check`, no other args, offline): validate the lock's own fields (`repo` non-empty, `commit` 40-hex, `ref` is the commit or a non-empty tag name, `version` a semver string, taken at sync from `paseo/package.json` since that file is not vendored, `checksum` 64-hex). Then recompute the vendored tree checksum and exit non-zero on mismatch. It does not contact the remote and does not re-resolve `ref`.

Export the checksum, copy and lock-validation functions for the test.

**Collision guard.** `packages/server/src/server/plugins/index.ts`. Today a configured id equal to a built-in id records a failure ("Plugin is already running", `runtime.ts:332`), lists as `running` (catalog-derived, `:201-236`), and `disablePlugin`/`removePlugin`/global switch-off call `stopPlugin` (`:556`), which stops the built-in. `removePlugin` also deletes `settingsDirectory/<id>` and calls `runtime.clearLogs` (`:463`), the built-in's settings and logs. `applyUpdates` -> `updateSource` (`:694`) can build a candidate and rewrite the stale entry. Fix in place, reusing `this.builtinPlugins.ids` and the existing message `Plugin ID "<id>" is reserved for a built-in plugin` (`:255`), extracted into one private `rejectBuiltinId(id)` helper that the install paths also use:

- `enablePlugin`, `disablePlugin`, `reloadPlugin`: call `rejectBuiltinId` first, before any config patch or `requireItem` (`:793`).
- `previewUpdates`: explicit `pluginId` that is built-in -> `rejectBuiltinId` throws before any work. The all-sources path skips built-in ids.
- `applyUpdates`: if any proposal id is built-in, throw the reserved error before `enqueue`, so `updateSource` never runs.
- `removePlugin`: stays allowed for a built-in id. It deletes the config entry and the managed source, but skips `stopPlugin`, `runtime.clearLogs` and the settings-directory `rm`.
- private `startPlugin` (`:540`): no-op for built-in ids (covers `start()` and `handleGlobalSwitch` re-enable).
- private `stopPlugin` (`:556`): resolve `false` without touching registrations/runtime for built-in ids (covers `stopConfiguredPlugins` on global switch-off).
- `listPlugins`: omit built-in ids, so built-ins stay absent from the installed list as documented.
- `start()`: one `logger.warn({pluginId}, ...)` per configured built-in id, naming `paseo plugin remove <id>` as cleanup.

**Lint/format/knip.** Vendored code must stay byte-identical to the pin, so exclude it from formatting and lint. Add `plugins/zekoder/**` to `.oxfmtrc.json` and `.oxlintrc.json` `ignorePatterns`. Add `"ignore": ["zekoder/**"]` to the `plugins` workspace in `knip.json`.

## Related work considered

No open bugs/followups. No decisions on file. Merged-history search: only this item.

## Tasks

- [x] 1. Add `scripts/sync-zekoder-plugin.mjs` per Approach, plus `scripts/sync-zekoder-plugin.test.mjs` (`node:test`). Build a temp local git repo fixture (passed via `--repo <path>`, no network) with `paseo/` files including extras outside `files`. Assert: allowlist-only copy, lock fields and stable checksum, lock `repo` is not the local path, branch ref rejected, `--check` passes offline with no `--ref`, `--check` fails after a vendored byte changes and after a malformed lock field. Append the test file to the `node --test` list at `.github/workflows/ci.yml:55`.
- [x] 2. Run `node scripts/sync-zekoder-plugin.mjs --ref v0.11.1` (was `8203aaec8757a8115294834021ceecc25447bcda`) (default SSH repo; if SSH auth is unavailable, `--repo /Users/ahmedelshalaby/Code/zekoder/zekoder-plugins`, which has the commit). Commit `plugins/zekoder/**` and `plugins/zekoder.lock.json` as generated. If the commit is unreachable or `paseo-plugin.json` id is not `zekoder`, stop and report.
- [x] 3. Add `"zekoder"` to the end of `builtinPlugins` (`packages/server/src/server/plugins/builtin/index.ts`). Add the ignore entries to `.oxfmtrc.json`, `.oxlintrc.json`, `knip.json`.
- [x] 4. Implement the collision guard in `packages/server/src/server/plugins/index.ts`. Add one case to `packages/server/src/server/plugins/index.posix.test.ts`, reusing `createPlugin`/`createStore`/`BuiltinPluginLoader` as in the test at `:181`. Built-in `b` that logs one line at start, `pluginsEnabled: true`, config entry `plugins.b`, and a file under `settingsDirectory/b`. Assert: after `start()`, `listPlugins()` omits `b`. `disablePlugin("b")` and `applyUpdates([{id: "b", ...}])` reject with the reserved message. Then patch `pluginsEnabled: false` and assert `b` is still in the plugin catalog. Then `removePlugin("b")` resolves, `plugins.b` is gone from config, `b` is still in the catalog, `settingsDirectory/b` still exists, and `getLogs("b")` still holds the start line.
- [x] 5. Docs. In `docs/plugins.md` "Built-in plugins" (`:89-108`), rewrite in place. Allowed client imports add `react`, `react-native`, `@tanstack/react-query`. Add the vendored-plugin rule: `plugins/zekoder/` comes from `scripts/sync-zekoder-plugin.mjs` and `plugins/zekoder.lock.json`; never edit it by hand; re-pin to change. Add that a configured entry with a built-in id is ignored with a warning, management RPCs on it are rejected as reserved, and `remove` only drops the config entry. In `plan.md`, update the plugin delivery lines (`:44-54`) to name the built-in mechanism and the lock file as the release-manifest source. Follow CLAUDE.md doc voice.
- [x] 6. Run `npm run format:files -- <changed non-vendored files>`, `npm run typecheck`, `npm run lint`.

## Verification

- `node --test scripts/sync-zekoder-plugin.test.mjs`. `node scripts/sync-zekoder-plugin.mjs --check` exits 0 offline.
- `npm run build:server`, then `node --test scripts/builtin-plugins-dist.test.mjs` (zekoder compiles, starts, appears in catalog).
- One at a time, output to `/tmp/test-output.txt`, `--bail=1`: `packages/server/src/server/plugins/builtin/index.test.ts`, `packages/server/src/server/plugins/index.posix.test.ts`, `packages/server/src/server/plugins/internal-seam.e2e.test.ts`.
- `npm run typecheck`, `npm run lint`, `npm run format:check` clean.
- Done = `zekoder` is in the plugin catalog with `pluginsEnabled` false. It is absent from `listPlugins`. Install, enable, disable, reload and update with id `zekoder` are rejected as reserved. A stale `plugins.zekoder` entry cannot stop it, and removing that entry keeps its settings and logs. The packaged-app smoke check runs in CI/release and is not run locally.
