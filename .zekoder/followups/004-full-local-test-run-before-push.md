---
id: 004-full-local-test-run-before-push
type: followup
title: Run the full test suite locally and get it green before pushing main
status: planned
createdAt: 2026-10-10
openedAt: 2026-10-10T17:02:39.597Z
updatedAt: 2026-10-10T17:03:28.947Z
origin: zekoder-debt-agent
filedFromTask: null
branch: followup-004-full-local-test-run-before-push
promoted: false
packages: []
relatedFeatures:
  - 002-zekoder-rebrand
  - 001-builtin-zekoder-plugin
relatedBugs:
  - 001-e2e-paseo-branding-assertions
  - 002-builtin-plugin-pollutes-e2e-fixtures
  - 003-agent-timeline-e2e-deterministic-failures
relatedFollowups: []
resolvedBy: null
statusHistory: []
---
# Followup 004-full-local-test-run-before-push: Run the full test suite locally and get it green before pushing main

## Summary

Run every CI-equivalent job locally, get it green, then push `main` and confirm GitHub Actions CI is green on `cyberneticlabs/zekoder-studio`.

## Why it's out of scope now

Blocked on three bugs from CI run https://github.com/cyberneticlabs/zekoder-studio/actions/runs/38065806335 (7 red jobs after the upstream v0.11.x merge `8e24f0fee`):

- `001-e2e-paseo-branding-assertions`
- `002-builtin-plugin-pollutes-e2e-fixtures`
- `003-agent-timeline-e2e-deterministic-failures`

Dependency (prose, see relations): this followup must not start until those three bugs are fixed and merged to `main`. Local commit `8d4e80a1f` (unit test branding fixes) is not pushed; `main` is ahead of `origin/main`.

## Proposed approach

One agent runs each CI job's commands from `.github/workflows/ci.yml` locally, one workspace at a time, piping every run to a file under `/tmp` and reading it afterward. Then push and watch CI.

Constraints (explicit exception to the `CLAUDE.md` "never run the full suite" rule, requested by the user):

- Exactly one agent runs tests. No parallel agents running tests at the same time.
- Sequential only. No concurrent workspaces.
- Per run: `<cmd> > /tmp/<name>.txt 2>&1`, then read the file. Re-run only a failing file with `npx vitest run <file> --bail=1`.
- Do not restart the main daemon on port 6767.
- `gh` in this checkout defaults to upstream `getpaseo/paseo`. Always pass `-R cyberneticlabs/zekoder-studio`.

Known local env gotcha: `packages/server/src/server/plugins/index.posix.test.ts` ("npm plugin installation") fails locally with npm `EALLOWSCRIPTS` ("--allow-scripts is not allowed in project-scoped installs"). This comes from local npm config, not code. Do not count it as a regression and do not edit the test. Either run once with the local npm config adjusted (e.g. a temporary `npm_config_*` env override or a throwaway `.npmrc` outside the repo) to confirm it passes, or record it as env-only and confirm it is green in the CI run after push. Say which in the final report.

Job to command map (from `.github/workflows/ci.yml`):

| CI job | Local commands |
| --- | --- |
| changes (CI contracts) | `node --test scripts/ci-workflow.test.mjs scripts/daemon-launch-contract.test.mjs scripts/sync-fdroid-changelogs.test.mjs scripts/sync-zekoder-plugin.test.mjs scripts/upload-release-assets.test.mjs scripts/release-version-utils.test.mjs scripts/sync-release-notes-from-changelog.test.mjs scripts/desktop-release/release-data.test.mjs scripts/desktop-release/release-ci.test.mjs branding/generate-assets.test.mjs` |
| format | `npm run format:check` |
| lint | `npm run lint` (CI also runs lockfile-lint and `npm audit signatures`; optional locally, needs network) |
| typecheck | `npm run build:server`, `node --test scripts/builtin-plugins-dist.test.mjs`, `npm run typecheck`, `npx vitest run packages/website/src --bail=1` (website e2e mockups: `npm run test:e2e --workspace=@getpaseo/website`, needs chromium and webkit) |
| server-tests | `npm run build:server-deps`, `npm run test --workspace=@getpaseo/server`, `npm run test --workspace=@getpaseo/builtin-plugins` (approximate workspace: it lives in `plugins/package.json`; confirm name during run), `npm run test:hub-cli-contract --workspace=@getpaseo/server` |
| relay-tests | `npm run build:relay`, `npm run test --workspace=@getpaseo/relay` |
| cli-tests (3 shards) | env `PASEO_LOCAL_SPEECH_AUTO_DOWNLOAD=0 PASEO_DICTATION_ENABLED=0 PASEO_VOICE_MODE_ENABLED=0`; for N in 1,2,3 run `PASEO_CLI_TEST_SHARD=N PASEO_CLI_TEST_SHARD_TOTAL=3 npm run test:local --workspace=@getpaseo/cli`; shard 3 also `npm run test:unit --workspace=@getpaseo/cli` |
| desktop-tests | `npm run build:server`, `npm run test --workspace=@getpaseo/desktop`, `npm run test:e2e:renderer --workspace=@getpaseo/desktop` (lifecycle and browser-tabs e2e are Linux/xvfb steps in CI; run locally if feasible, otherwise leave to CI) |
| app-tests | `npm run build:app-deps`, `npm run test --workspace=@getpaseo/app` |
| sdk-tests | `npm run build:relay && npm run build:client`, `npm run build:plugin`, then `npm run test` for `@getpaseo/plugin`, `@getpaseo/protocol`, `@getpaseo/client`, `@getpaseo/highlight`, then `npm run typecheck:examples --workspace=@getpaseo/client` |
| playwright (4 shards) | `npm run build:server`, `npm run build --workspace=@getpaseo/expo-two-way-audio`, then for N in 1..4 `npm run test:e2e --workspace=@getpaseo/app -- --shard=N/4` (needs `npx playwright install chromium`) |

Windows and macOS-only CI jobs (server-tests windows/macos file observation, desktop-tests windows) cannot run on this machine's Linux-equivalent path; confirm them in the CI run after push.

## Tasks

- [ ] Precondition: confirm bugs `001-e2e-paseo-branding-assertions`, `002-builtin-plugin-pollutes-e2e-fixtures`, `003-agent-timeline-e2e-deterministic-failures` (`.zekoder/bugs/`) are resolved and their fixes are on `main`. Stop and report if not.
- [ ] Run format, lint and typecheck jobs from the map above (`package.json` root scripts `format:check`, `lint`, `typecheck`). Fix nothing silently; file a bug for any failure outside this followup's scope.
- [ ] Run server tests (`packages/server/package.json` scripts `test`, `test:hub-cli-contract`) and built-in plugin tests (`plugins/package.json`). Apply the `index.posix.test.ts` EALLOWSCRIPTS handling above.
- [ ] Run relay (`packages/relay`), CLI shards 1-3 (`packages/cli/package.json` `test:local`, `test:unit`), sdk-tests set (`packages/plugin`, `packages/protocol`, `packages/client`, `packages/highlight`, client examples typecheck).
- [ ] Run app unit tests (`packages/app`) and desktop unit plus renderer e2e (`packages/desktop`).
- [ ] Run Playwright browser shards 1-4 (`packages/app`, `test:e2e`).
- [ ] Record a pass/fail table (job, command, result, `/tmp` log path) in this doc's Verification section or the final report.
- [ ] Push `main` to origin, then `gh run list -R cyberneticlabs/zekoder-studio --branch main` and `gh run watch -R cyberneticlabs/zekoder-studio <run-id>` until done. Report any red job.

## Verification

- Locally green: `format:check`, `lint`, `typecheck`, and every workspace test command in the map above, with the one documented env-only exception (`index.posix.test.ts` EALLOWSCRIPTS) explained.
- `git log origin/main..main` is empty after push.
- The CI run on `cyberneticlabs/zekoder-studio` for the pushed head SHA is green on all jobs (`gh run view -R cyberneticlabs/zekoder-studio <run-id>`), including the EALLOWSCRIPTS test.
