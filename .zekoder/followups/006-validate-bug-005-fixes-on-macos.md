---
id: 006-validate-bug-005-fixes-on-macos
type: followup
title: Validate bug 005 test fixes on a macOS machine
status: merged
createdAt: 2026-10-13
openedAt: 2026-10-13T04:56:56.584Z
updatedAt: 2026-10-13T11:15:49.190Z
completedAt: 2026-10-13T11:15:49.190Z
origin: zekoder-debt-agent
filedFromTask: null
branch: followup-006-validate-bug-005-fixes-on-macos
promoted: false
packages: []
mergeMode: local
commit: 2c42398630534a2fcc540c233c97842996a44a04
filesTouched:
  - .zekoder/bugs/007-pane-find-e2e-fails-on-macos-after-platform-pin.md
  - .zekoder/bugs/008-desktop-browser-tabs-e2e-settings-memory-closes-on-macos.md
  - .zekoder/bugs/009-terminal-find-browser-test-flake-persists-on-macos.md
  - .zekoder/bugs/010-observation-integration-watcher-count-flake-persists-on-macos.md
  - .zekoder/followups/006-validate-bug-005-fixes-on-macos.md
verifiedBaseSha: 240a4a83f0a5b27989a8839e2255526c42598b17
relatedFeatures: []
relatedBugs:
  - 005-macos-local-test-portability-and-flakes
  - 006-macos-undiagnosed-e2e-failures
relatedFollowups:
  - 004-full-local-test-run-before-push
resolvedBy: null
statusHistory:
  - from: planned
    to: merged
    at: 2026-10-13T11:15:49.190Z
---
# Followup 006-validate-bug-005-fixes-on-macos: Validate bug 005 test fixes on a macOS machine

## Summary

Run bug 005's repro commands on a real macOS dev machine and confirm the fixes merged in 894d1d3be hold.

## Why it's out of scope now

The fixes were implemented and verified on a Linux host only (Ubuntu 26.04, no display or xvfb, no Mac available). The macOS-specific behavior could not be exercised there.

Already verified on Linux (2026-10-12):

- App Playwright (`npx playwright test --project=browser` in `packages/app`) on keyboard-chord-modifier-step, new-workspace-entry, pane-find, plugin-sidebar-items, sidebar-nav-settings, sidebar-help, terminal-tab-title-loading: 38/38 pass.
- `npx vitest run --project browser src/terminal/runtime/terminal-find.browser.test.ts` in `packages/app`: 9/9 in 3 consecutive runs.
- `packages/cli/tests/15-provider.test.ts`: codex model case passes with codex-cli 0.162.1. The opencode case failed only because opencode is not installed on that host.
- Server port-allocator and observation integration tests passed in the supervisor's gate.

Not runnable on Linux: desktop `keyboard-shortcut-unassign.spec.ts` (item 2) and desktop `npm run test:e2e:browser-tabs` (item 4).

## Proposed approach

Verification only, no code expected. Use the numbered repro commands in `.zekoder/bugs/005-macos-local-test-portability-and-flakes.md`. Anything that still fails gets filed as a bug (or added to bug 006), not fixed inline.

Out of scope here, owned by bug 006-macos-undiagnosed-e2e-failures: `terminal-tab-title-loading.spec.ts:58` macOS behavior, the `new-workspace.spec.ts` PR tests, and scroll smoothness.

## Tasks

- [x] Item 1: in `packages/server`, run `npx vitest run src/server/workspace-service-port-allocator.test.ts`. Confirm it passes (realpath fix in `packages/server/src/server/workspace-service-port-allocator.test.ts`).
- [x] Item 2: in `packages/desktop`, run `E2E_DESKTOP_RUNTIME=1 npx playwright test --config=playwright.config.ts --project=desktop e2e/keyboard-shortcut-unassign.spec.ts`. Confirm the `win32` case shows `Ctrl+Shift+⌫` (renderer change in `packages/app/src/desktop/host.ts` and `packages/app/src/utils/shortcut-platform.ts`).
- [x] Item 4: in `packages/desktop`, run `npm run test:e2e:browser-tabs`. Confirm `packages/desktop/e2e/browser-tabs.e2e.mjs` skips the hidden-frame case on darwin and prints its reason.
- [x] Item 5a: in `packages/app`, run `npx playwright test --project=browser` on `e2e/browser/keyboard-chord-modifier-step.spec.ts`, `new-workspace-entry.spec.ts`, `pane-find.spec.ts`, `plugin-sidebar-items.spec.ts`, `sidebar-nav-settings.spec.ts`, `sidebar-help.spec.ts`. Confirm the shortcut-hint cases pass (fixture change in `packages/app/e2e/support/fixtures.ts` pins `navigator.platform`).
- [x] Item 6: run `npx vitest run src/server/workspace-git-service.observation.integration.test.ts` in `packages/server` about 5 times in isolation. Confirm no `activeWatcherCount` failure.
- [x] Item 7: run `npx vitest run --project browser src/terminal/runtime/terminal-find.browser.test.ts` in `packages/app` several times. Confirm it passes every run.
- [x] Item 3 (optional): run `PASEO_LOCAL_SPEECH_AUTO_DOWNLOAD=0 npx tsx packages/cli/tests/15-provider.test.ts` from the repo root with codex and opencode installed. Confirm the codex model case passes.
- [x] File a bug (or append to bug 006) for each failure, with the command, platform, and output. Then record results in this doc and set the status via `zekoder_update_item`.

## Verification

Every command above passes on macOS (item 4 skips with its stated reason), or each remaining failure has a filed bug. Record the macOS version, Node version, and run counts for items 6 and 7 when closing.

## Results (macOS)

Run 2026-10-13 on macOS 26.6.2 (build 25G83, `sw_vers`), Darwin 25.6.0, arm64, Node v24.19.0, from branch `followup-006-validate-bug-005-fixes-on-macos` (base `issue/followup-006-validate-bug-005-fixes-on-macos`). Dependencies via `npm ci`, then `npm run build:server`. No code changes. Logs were in `/tmp/f006-*.txt`.

| Item | Command | Result |
| ---- | ------- | ------ |
| 1 | `packages/server`: `npx vitest run src/server/workspace-service-port-allocator.test.ts` | PASS, 5/5 |
| 2 | `packages/desktop`: `E2E_DESKTOP_RUNTIME=1 npx playwright test ... e2e/keyboard-shortcut-unassign.spec.ts` | PASS, 3/3 (the `win32` case passes) |
| 4 | `packages/desktop`: `npm run test:e2e:browser-tabs` | FAIL, 3 of 3 runs, before the hidden-frame case: `cdpSession.send: Target page, context or browser has been closed` in `settings-memory.electron.mjs:86`. The darwin skip message was never reached, so it is unverified. Filed bug 008. |
| 5a | `packages/app`: `npx playwright test --project=browser` on the six named specs | 25 passed, 12 failed. The shortcut-hint cases pass: `keyboard-chord-modifier-step` 2/2, `new-workspace-entry` 7/7 (including `:140` Ctrl+P), `plugin-sidebar-items` 6/6 (including `:244`), `sidebar-nav-settings` 4/4 (including `:34` and `:82`), `sidebar-help` 6/6. All 12 `pane-find.spec.ts` tests fail (`:446` included); a rerun of that spec alone gave 12/12 failures again. Filed bug 007 (probable cause: fixture pins `navigator.platform` to `Win32`, specs press `ControlOrMeta`, which is Meta on macOS). |
| 6 | `packages/server`: `npx vitest run src/server/workspace-git-service.observation.integration.test.ts`, isolated | 15 runs: 14 pass, 1 fail (run 4: `activeWatcherCount` 1 instead of 2 after the 25 s wait). Filed bug 010. |
| 7 | `packages/app`: `npx vitest run --project browser src/terminal/runtime/terminal-find.browser.test.ts` | 12 runs: 8 pass (9/9), 4 fail (runs 1 to 4, `samples.length` 1, wanted more than 1, after the 5 s `vi.waitFor`). Filed bug 009. |
| 3 | `PASEO_LOCAL_SPEECH_AUTO_DOWNLOAD=0 npx tsx packages/cli/tests/15-provider.test.ts` | Codex case PASS (Test 7, codex-cli 0.162.1). Script then failed at Test 8 `provider models opencode` with `Provider opencode is not available`: opencode is not installed on this host (prerequisite, not a defect). Tests after 8 did not run. |

Filed bugs: 007-pane-find-e2e-fails-on-macos-after-platform-pin, 008-desktop-browser-tabs-e2e-settings-memory-closes-on-macos, 009-terminal-find-browser-test-flake-persists-on-macos, 010-observation-integration-watcher-count-flake-persists-on-macos.

Conclusion: items 1, 2, 3 (codex) and the shortcut-hint cases of 5a hold on macOS. Items 4, 6, 7 and `pane-find.spec.ts` (5a) do not.
