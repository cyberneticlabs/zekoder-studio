---
id: 002-builtin-plugin-pollutes-e2e-fixtures
type: bug
title: Built-in Zekoder plugin runs in e2e daemons and mutates test fixtures
status: merged
createdAt: 2026-10-10
openedAt: 2026-10-10T17:00:16.033Z
updatedAt: 2026-10-11T20:38:44.824Z
completedAt: 2026-10-11T20:38:44.824Z
severity: high
branch: bug-002-builtin-plugin-pollutes-e2e-fixtures
promoted: false
packages: []
mergeMode: local
commit: 04d125117cfe4027b311d3c20efbaa36d11679eb
filesTouched:
  - .zekoder/bugs/002-builtin-plugin-pollutes-e2e-fixtures.md
  - packages/app/e2e/support/helpers/e2e-worker.ts
  - packages/server/src/server/bootstrap.ts
  - packages/server/src/server/plugins/builtin/index.test.ts
  - packages/server/src/server/plugins/builtin/index.ts
verifiedBaseSha: 08e19dccbdcf81ebe2409e87adee53592b833b68
relatedFeatures:
  - 001-builtin-zekoder-plugin
  - 005-dev-zekoder-plugin-path-override
relatedBugs:
  - 001-e2e-paseo-branding-assertions
  - 003-agent-timeline-e2e-deterministic-failures
relatedFollowups: []
resolvedBy: null
statusHistory:
  - from: planned
    to: in-progress
    at: 2026-10-11T20:24:39.343Z
  - from: in-progress
    to: ready
    at: 2026-10-11T20:37:41.555Z
  - from: ready
    to: merged
    at: 2026-10-11T20:38:44.824Z
---
# Bug 002-builtin-plugin-pollutes-e2e-fixtures: Built-in Zekoder plugin runs in e2e daemons and mutates test fixtures

## Summary

The built-in `zekoder` plugin always starts in e2e daemons, installs itself into every test workspace and adds sidebar and header UI, which breaks ~22 Playwright e2e tests that assume pristine fixtures.

## Repro steps

1. Merge upstream Paseo v0.11.x into main (`8e24f0fee`) so the e2e suite runs against the fork with the built-in Zekoder plugin (feature `001-builtin-zekoder-plugin`).
2. Run the Playwright e2e suite from `packages/app` (CI run https://github.com/cyberneticlabs/zekoder-studio/actions/runs/38065806335, shards 1-4), e.g. `composer-diff-stat.spec.ts`, `same-directory-workspaces.spec.ts`, `directory-bootstrap.spec.ts`, `changes-pane.spec.ts`, `branch-switcher.spec.ts`, `sidebar-nav-settings.spec.ts`, `plugin-button-example.spec.ts`.
3. Observe the failures listed below.

## Expected vs. actual

- **Expected**: e2e fixtures (git workspaces, sidebar prefs, workspace header toolbar) are unaffected by the built-in Zekoder plugin unless a test opts in.
- **Actual**: the plugin writes into workspaces and adds UI:
  1. `.gitignore` (+10 lines) appears as `diff-file-0`: `composer-diff-stat.spec.ts` (14 tests at lines 72,117,144,213,248,320,355,389,423,449,478,499,547,573) expects additions 2, gets 12; `same-directory-workspaces.spec.ts:38` expects `SHARED_CHANGE.md` first, gets `.gitignore`; `changes-pane.spec.ts:300/554/630/893` (extra file, expected 4 got 5; "No changes to display" missing; "Committed" vs "Uncommitted"); `branch-switcher.spec.ts:49`.
  2. `directory-bootstrap.spec.ts:5` expects subscribed/total agents:1 workspaces:1, gets 2/2. <!-- TODO: confirm whether the plugin creates the extra agent/workspace; this is unconfirmed and may be a separate cause. -->
  3. Sidebar nav items `plugin:zekoder:issues`, `plugin:zekoder:reports`, `plugin:zekoder:zekoder` change stored preferences: `sidebar-nav-settings.spec.ts:82` deep-equal fails (+12 lines); helper `packages/app/e2e/support/helpers/sidebar-nav-settings.ts:132`.
  4. "Open Git panel" header button from the plugin makes the toolbar "Workspace actions" locator in `packages/app/e2e/support/helpers/plugin-button-example.ts:15` resolve to 2 elements, a strict-mode violation in `plugin-button-example.spec.ts:4`.

## Root cause

Built-in plugins always start; there is no switch to turn one off.

- `packages/server/src/server/plugins/builtin/index.ts`: `builtinPlugins` includes `"zekoder"`; `BuiltinPluginLoader` loads the whole list.
- `packages/server/src/server/bootstrap.ts` `resolveBuiltinPluginLoader` (~L495): `dependencies.builtinPlugins ?? new BuiltinPluginLoader()`, so the full list is loaded whenever nothing is injected. `PluginService.start()` (`plugins/index.ts` ~L181) starts every built-in regardless of `pluginsEnabled`.
- In-process test daemons already avoid this: `packages/server/src/server/test-utils/paseo-daemon.ts:107` injects `new BuiltinPluginLoader(undefined, [])`. The Playwright e2e daemon does not: `packages/app/e2e/support/helpers/isolated-host-daemon.ts` (~L156-170) spawns `scripts/supervisor-entrypoint.ts --dev`, which boots a real daemon with the default loader, and nothing in `packages/app/e2e/support/helpers/e2e-worker.ts` (`startE2EWorker`, `environment`) turns the plugin off.
- Plugin side effects: `plugins/zekoder/server/version.ts` `installForWorkspace` (`workspace.created` hook, ~L113) and `installBeforeAgent` install zekoder into every workspace/agent start; `plugins/zekoder/index.client.tsx:73` and `plugins/zekoder/client/git-tab.ts:33` add the nav items and "Open Git panel" button.
- No existing env or config switch exists (checked `config.ts`, `config-environment.ts`, `bootstrap.ts`). Feature `005-dev-zekoder-plugin-path-override` (planned, not merged) adds a dev path override, not a disable switch.

## Fix approach

Add a small server env switch that removes ids from the default built-in list, and have the e2e worker daemon set it to disable `zekoder` by default, with a per-spec opt-in. Do not edit individual assertions.

- `packages/server/src/server/bootstrap.ts` `resolveBuiltinPluginLoader`: when no loader is injected, build `new BuiltinPluginLoader(undefined, builtinPlugins.filter(id => !disabled.has(id)))`, where `disabled` is parsed from a new comma-separated env `PASEO_DISABLE_BUILTIN_PLUGINS` (read from `process.env`; unlisting an id also lifts its reservation per `kb/discovery/plugins.md`). Keep the parsing helper next to `BuiltinPluginLoader` in `packages/server/src/server/plugins/builtin/index.ts`. The var is test/diagnostic only; document it in a code comment (approximate placement, confirm during implementation).
- `packages/app/e2e/support/helpers/e2e-worker.ts` `startE2EWorker`: add `PASEO_DISABLE_BUILTIN_PLUGINS: "zekoder"` to the default `environment` object before `...options.environment`, so a spec opts back in with `e2eDaemonEnvironment: { PASEO_DISABLE_BUILTIN_PLUGINS: "" }` (existing option in `packages/app/e2e/support/fixtures.ts`, used like `browser/plugin-management.spec.ts:76`).
- No e2e spec currently references zekoder (`grep -il zekoder packages/app/e2e` is empty), so no spec needs the opt-in today.
- Open product question, not blocking this fix: is installing zekoder into every new workspace / agent start (writing `.gitignore` into user repos) intended behavior? Record the answer on feature `001-builtin-zekoder-plugin`; this bug fixes only the test harness.

## Tasks

- [x] Add `PASEO_DISABLE_BUILTIN_PLUGINS` parsing and filtered default list in `packages/server/src/server/plugins/builtin/index.ts` and use it in `packages/server/src/server/bootstrap.ts` (`resolveBuiltinPluginLoader`), with unit tests in `packages/server/src/server/plugins/builtin/index.test.ts` (unset keeps full list; `zekoder` removes only it; whitespace/empty tolerated; unknown ids ignored).
- [x] Set `PASEO_DISABLE_BUILTIN_PLUGINS: "zekoder"` as the default daemon environment in `packages/app/e2e/support/helpers/e2e-worker.ts`, overridable via `e2eDaemonEnvironment`.
- [x] Confirm `packages/app/e2e/browser/directory-bootstrap.spec.ts:5` (agents 1/workspaces 1) passes once the plugin is off; if not, note the separate cause in this doc and file a followup.
- [x] Run only the changed/affected specs locally, never the full suite: `npx vitest run packages/server/src/server/plugins/builtin/index.test.ts --bail=1`, plus the failing Playwright specs named above one file at a time.
- [x] `npm run typecheck`, `npm run lint -- <changed files>`, `npm run format:files -- <changed files>`.

## Verification

- Unit tests for the env parsing pass.
- Previously failing specs pass: `composer-diff-stat`, `same-directory-workspaces`, `directory-bootstrap`, `changes-pane` (300/554/630/893), `branch-switcher:49`, `sidebar-nav-settings:82`, `plugin-button-example`.
- A daemon started without the env still lists `zekoder` in the plugin catalog (production behavior unchanged); CI playwright shards 1-4 no longer show the listed failures (other failures tracked in bugs 001 and 003).
