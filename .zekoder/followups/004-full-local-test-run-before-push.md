---
id: 004-full-local-test-run-before-push
type: followup
title: Run the full test suite locally and get it green before pushing main
status: merged
createdAt: 2026-10-10
openedAt: 2026-10-10T17:02:39.597Z
updatedAt: 2026-10-11T23:42:40.406Z
completedAt: 2026-10-11T23:42:40.406Z
origin: zekoder-debt-agent
filedFromTask: null
branch: followup-004-full-local-test-run-before-push
promoted: false
packages: []
mergeMode: local
commit: c3397c51e6c87e06d587c5beaa4c1d4d7b7adc4a
filesTouched:
  - .zekoder/bugs/004-antigravity-signal-process-eperm-macos.md
  - .zekoder/bugs/005-macos-local-test-portability-and-flakes.md
  - .zekoder/followups/004-full-local-test-run-before-push.md
verifiedBaseSha: cfb7666348b477372fb9e0ef25ce0fe43c590fce
relatedFeatures:
  - 002-zekoder-rebrand
  - 001-builtin-zekoder-plugin
relatedBugs:
  - 001-e2e-paseo-branding-assertions
  - 002-builtin-plugin-pollutes-e2e-fixtures
  - 003-agent-timeline-e2e-deterministic-failures
relatedFollowups: []
resolvedBy: null
statusHistory:
  - from: planned
    to: merged
    at: 2026-10-11T23:42:40.406Z
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

- [x] Precondition: confirm bugs `001-e2e-paseo-branding-assertions`, `002-builtin-plugin-pollutes-e2e-fixtures`, `003-agent-timeline-e2e-deterministic-failures` (`.zekoder/bugs/`) are resolved and their fixes are on `main`. Stop and report if not.
- [x] Run format, lint and typecheck jobs from the map above (`package.json` root scripts `format:check`, `lint`, `typecheck`). Fix nothing silently; file a bug for any failure outside this followup's scope.
- [x] Run server tests (`packages/server/package.json` scripts `test`, `test:hub-cli-contract`) and built-in plugin tests (`plugins/package.json`). Apply the `index.posix.test.ts` EALLOWSCRIPTS handling above.
- [x] Run relay (`packages/relay`), CLI shards 1-3 (`packages/cli/package.json` `test:local`, `test:unit`), sdk-tests set (`packages/plugin`, `packages/protocol`, `packages/client`, `packages/highlight`, client examples typecheck).
- [x] Run app unit tests (`packages/app`) and desktop unit plus renderer e2e (`packages/desktop`).
- [x] Run Playwright browser shards 1-4 (`packages/app`, `test:e2e`).
- [x] Record a pass/fail table (job, command, result, `/tmp` log path) in this doc's Verification section or the final report.
- [ ] Push `main` to origin, then `gh run list -R cyberneticlabs/zekoder-studio --branch main` and `gh run watch -R cyberneticlabs/zekoder-studio <run-id>` until done. Report any red job. (deferred to user — not pushed by request)

## Verification

- Locally green: `format:check`, `lint`, `typecheck`, and every workspace test command in the map above, with the one documented env-only exception (`index.posix.test.ts` EALLOWSCRIPTS) explained.
- `git log origin/main..main` is empty after push. (deferred to user — not pushed by request)
- The CI run on `cyberneticlabs/zekoder-studio` for the pushed head SHA is green on all jobs (`gh run view -R cyberneticlabs/zekoder-studio <run-id>`), including the EALLOWSCRIPTS test. (deferred to user — not pushed by request)

### Local run results (2026-10-11/12)

Run in worktree `followup-004-full-local-test-run-before-push` (main content plus an empty marker commit), macOS arm64, Node 24.19.0, sequential, one agent. Nothing was pushed. Logs are under `/tmp/zk004-*.txt` and are not committed.

Environment setup that applies to every row: `npm install` skips dependency install scripts on this machine (`allow-scripts=@anthropic-ai/claude-code` in `~/.npmrc`), so `NPM_CONFIG_USERCONFIG=/tmp/zk004-empty-npmrc npm rebuild` was run once. `opencode-ai` (installed to `/tmp/zk004-agents`, not the repo) and an empty npm user config were used only on the rows marked "env override". `@openai/codex@0.105.0` could not be run locally (macOS killed the binary, exit 137), so CI-pinned codex was not reproduced.

| Job | Command | Result | Log |
| --- | --- | --- | --- |
| changes (CI contracts) | `node --test scripts/ci-workflow.test.mjs ... branding/generate-assets.test.mjs` | pass (105/105) | `/tmp/zk004-contracts.txt` |
| format | `npm run format:check` | pass | `/tmp/zk004-format.txt` |
| lint | `npm run lint` (lockfile-lint and `npm audit signatures` not run) | pass (0 warnings, 0 errors) | `/tmp/zk004-lint.txt` |
| typecheck | `npm run build:server` | pass | `/tmp/zk004-build-server.txt` |
| typecheck | `node --test scripts/builtin-plugins-dist.test.mjs` | pass | `/tmp/zk004-builtin-dist.txt` |
| typecheck | `npm run typecheck` | pass | `/tmp/zk004-typecheck.txt` |
| typecheck | `npx vitest run packages/website/src --bail=1` | pass (482/482) | `/tmp/zk004-website-unit.txt` |
| typecheck | `npm run test:e2e --workspace=@getpaseo/website` (chromium + webkit) | pass (61 passed, 1 skipped) | `/tmp/zk004-website-e2e.txt` |
| typecheck | `npm pack --dry-run --ignore-scripts` for protocol, client, server | pass | `/tmp/zk004-pack-dry-run.txt` |
| server-tests | `npm run build:server-deps` | pass | `/tmp/zk004-build-server-deps.txt` |
| server-tests | `npm run test --workspace=@getpaseo/server` (unit phase) | FAIL (3 failed, 6281 passed): 2x EALLOWSCRIPTS (`index.posix.test.ts`, `managed-source.posix.test.ts`) and `workspace-service-port-allocator.test.ts` | `/tmp/zk004-server.txt` |
| server-tests | `npm run test:unit --workspace=@getpaseo/server` with env override | FAIL (2 failed, 6282 passed): `workspace-service-port-allocator.test.ts` (macOS `/private/var` realpath) and `workspace-git-service.observation.integration.test.ts` (flaky) | `/tmp/zk004-server-unit-override.txt` |
| server-tests | `npm run test:integration --workspace=@getpaseo/server` (the `test` script never reached this phase because unit failed) | FAIL then pass: `opencode-bridge.local.e2e.test.ts` versioned runtime hit EALLOWSCRIPTS; the other 7 files pass | `/tmp/zk004-server-integration.txt` |
| server-tests | versioned-runtime test rerun with env override | pass (2 passed, 4 skipped) | `/tmp/zk004-server-integration-override.txt` |
| server-tests | `npx vitest run src/server/plugins/index.posix.test.ts src/server/plugins/managed-source.posix.test.ts` with env override | pass (41/41) | `/tmp/zk004-server-allowscripts-override.txt` |
| server-tests | `npm run test --workspace=@getpaseo/builtin-plugins` | FAIL (1 failed, 331 passed): antigravity `reports startup auth without waiting for init forever` (`kill EPERM`, bug 004) | `/tmp/zk004-builtin-plugins.txt` |
| server-tests | `npm run test:hub-cli-contract --workspace=@getpaseo/server` | pass | `/tmp/zk004-hub-cli-contract.txt` |
| relay-tests | `npm run build:relay`, `npm run test --workspace=@getpaseo/relay` | pass (51 passed, 1 skipped) | `/tmp/zk004-relay.txt` |
| cli-tests shard 1 | `PASEO_CLI_TEST_SHARD=1 PASEO_CLI_TEST_SHARD_TOTAL=3 npm run test:local --workspace=@getpaseo/cli` | pass | `/tmp/zk004-cli-shard1.txt` |
| cli-tests shard 2 | same, shard 2 | FAIL: `15-provider` (codex 0.160.0 model catalogue, env-only, bug 005 item 3); the other 14 files pass | `/tmp/zk004-cli-shard2.txt`, `/tmp/zk004-cli-15-provider-alone.txt` |
| cli-tests shard 3 | same, shard 3 | pass | `/tmp/zk004-cli-shard3.txt` |
| cli-tests shard 3 | `npm run test:unit --workspace=@getpaseo/cli` | pass (345 passed, 1 skipped) | `/tmp/zk004-cli-unit.txt` |
| sdk-tests | `npm run build:relay && npm run build:client`, `npm run build:plugin` | pass | `/tmp/zk004-build-relay-client.txt`, `/tmp/zk004-build-plugin.txt` |
| sdk-tests | `npm run test` for plugin / protocol / client / highlight | pass (129 / 776 / 243 / 102) | `/tmp/zk004-sdk-plugin.txt`, `-protocol`, `-client`, `-highlight` |
| sdk-tests | `npm run typecheck:examples --workspace=@getpaseo/client` | pass | `/tmp/zk004-sdk-client-examples.txt` |
| app-tests | `npm run build:app-deps`, `npm run test --workspace=@getpaseo/app` | FAIL (1 failed, 5731 passed): `terminal-find.browser.test.ts` timing flake, passed on 1 of 2 isolated reruns (bug 005 item 7) | `/tmp/zk004-app.txt` |
| desktop-tests | `npm run test --workspace=@getpaseo/desktop` | pass (428 passed, 9 skipped) | `/tmp/zk004-desktop.txt` |
| desktop-tests | `npm run test:e2e:renderer --workspace=@getpaseo/desktop` | FAIL (1 failed, 33 passed): `keyboard-shortcut-unassign.spec.ts` win32 case, macOS-host glyphs, 2 of 2 isolated reruns (bug 005 item 2) | `/tmp/zk004-desktop-renderer-e2e.txt` |
| desktop-tests | `npm run test:e2e:lifecycle --workspace=@getpaseo/desktop` (CI: Linux/xvfb) | pass on macOS | `/tmp/zk004-desktop-lifecycle-e2e.txt` |
| desktop-tests | `npm run test:e2e:browser-tabs --workspace=@getpaseo/desktop` (CI: Linux/xvfb) | FAIL on macOS (`hidden browser produced 120 animation frames`); deferred to CI | `/tmp/zk004-desktop-browser-tabs-e2e.txt` |
| playwright | `npm run build:server`, `npm run build --workspace=@getpaseo/expo-two-way-audio` | pass | `/tmp/zk004-build-expo-audio.txt` |
| playwright shard 1/4 | `PWTEST_SHARD_WEIGHTS=111:172:137:160 npm run test:e2e --workspace=@getpaseo/app -- --shard=1/4` | FAIL (4 failed, 155 passed) | `/tmp/zk004-playwright-shard1.txt` |
| playwright shard 2/4 | same, 2/4 | FAIL (4 failed, 195 passed) | `/tmp/zk004-playwright-shard2.txt` |
| playwright shard 3/4 | same, 3/4 | FAIL (9 failed, 161 passed) | `/tmp/zk004-playwright-shard3.txt` |
| playwright shard 4/4 | same, 4/4 | FAIL (22 failed, 172 passed) | `/tmp/zk004-playwright-shard4.txt` |
| playwright reruns | the 21 failing spec files rerun with `opencode` on PATH and the env override | 28 of 39 failures recovered (missing `opencode`, EALLOWSCRIPTS); 11 failed, 100 passed | `/tmp/zk004-playwright-rerun-failed.txt` |
| playwright reruns | `agent-timeline-scroll-smoothness.spec.ts --repeat-each=2`; `new-workspace.spec.ts -g "pasted GitHub PR"` | still FAIL | `/tmp/zk004-playwright-smoothness-alone.txt`, `/tmp/zk004-playwright-newworkspace-alone.txt` |

#### EALLOWSCRIPTS disposition

`index.posix.test.ts` ("npm plugin installation") passed once the npm user config was replaced with an empty file (`NPM_CONFIG_USERCONFIG=/tmp/zk004-empty-npmrc`), 41 of 41 tests across it and `managed-source.posix.test.ts`. So the failure comes from the local `~/.npmrc` `allow-scripts` setting, not the code. The same cause also hit `managed-source.posix.test.ts`, the opencode versioned-runtime integration test, `creation-old-daemon.spec.ts`, `owned-subscriptions-old-daemon.spec.ts` and `plugin-management.spec.ts`; all passed with the override. No test was edited. Confirmation in CI is deferred to the user (not pushed).

#### Not green locally, left for CI or filed

Real-regression status of the remaining failures is unproven: each is either host-dependent on macOS or timing-sensitive, and none reproduces the three fixed CI failures (bugs 001 to 003). Filed as bug `004-antigravity-signal-process-eperm-macos` (macOS-only `EPERM`, a code defect) and bug `005-macos-local-test-portability-and-flakes` (all other items, including the 11 Playwright specs that still fail). Not run: Windows and macOS file-observation CI jobs, the Windows desktop job, `lockfile-lint`, `npm audit signatures`, and Linux/xvfb steps (the `browser-tabs` failure above is deferred to CI).
