---
id: 006-validate-bug-005-fixes-on-macos
type: followup
title: Validate bug 005 test fixes on a macOS machine
status: planned
createdAt: 2026-10-13
openedAt: 2026-10-13T04:56:56.584Z
updatedAt: 2026-10-13T04:57:29.934Z
origin: zekoder-debt-agent
filedFromTask: null
branch: followup-006-validate-bug-005-fixes-on-macos
promoted: false
packages: []
relatedFeatures: []
relatedBugs:
  - 005-macos-local-test-portability-and-flakes
  - 006-macos-undiagnosed-e2e-failures
relatedFollowups:
  - 004-full-local-test-run-before-push
resolvedBy: null
statusHistory: []
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

- [ ] Item 1: in `packages/server`, run `npx vitest run src/server/workspace-service-port-allocator.test.ts`. Confirm it passes (realpath fix in `packages/server/src/server/workspace-service-port-allocator.test.ts`).
- [ ] Item 2: in `packages/desktop`, run `E2E_DESKTOP_RUNTIME=1 npx playwright test --config=playwright.config.ts --project=desktop e2e/keyboard-shortcut-unassign.spec.ts`. Confirm the `win32` case shows `Ctrl+Shift+⌫` (renderer change in `packages/app/src/desktop/host.ts` and `packages/app/src/utils/shortcut-platform.ts`).
- [ ] Item 4: in `packages/desktop`, run `npm run test:e2e:browser-tabs`. Confirm `packages/desktop/e2e/browser-tabs.e2e.mjs` skips the hidden-frame case on darwin and prints its reason.
- [ ] Item 5a: in `packages/app`, run `npx playwright test --project=browser` on `e2e/browser/keyboard-chord-modifier-step.spec.ts`, `new-workspace-entry.spec.ts`, `pane-find.spec.ts`, `plugin-sidebar-items.spec.ts`, `sidebar-nav-settings.spec.ts`, `sidebar-help.spec.ts`. Confirm the shortcut-hint cases pass (fixture change in `packages/app/e2e/support/fixtures.ts` pins `navigator.platform`).
- [ ] Item 6: run `npx vitest run src/server/workspace-git-service.observation.integration.test.ts` in `packages/server` about 5 times in isolation. Confirm no `activeWatcherCount` failure.
- [ ] Item 7: run `npx vitest run --project browser src/terminal/runtime/terminal-find.browser.test.ts` in `packages/app` several times. Confirm it passes every run.
- [ ] Item 3 (optional): run `PASEO_LOCAL_SPEECH_AUTO_DOWNLOAD=0 npx tsx packages/cli/tests/15-provider.test.ts` from the repo root with codex and opencode installed. Confirm the codex model case passes.
- [ ] File a bug (or append to bug 006) for each failure, with the command, platform, and output. Then record results in this doc and set the status via `zekoder_update_item`.

## Verification

Every command above passes on macOS (item 4 skips with its stated reason), or each remaining failure has a filed bug. Record the macOS version, Node version, and run counts for items 6 and 7 when closing.
