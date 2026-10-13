---
id: 007-pane-find-e2e-fails-on-macos-after-platform-pin
type: bug
title: "pane-find.spec.ts fails 12 of 12 on macOS: fixture pins navigator.platform to Win32 but specs press ControlOrMeta"
status: merged
createdAt: 2026-10-13
openedAt: 2026-10-13T11:13:10.626Z
updatedAt: 2026-10-13T12:31:51.712Z
completedAt: 2026-10-13T12:31:51.712Z
severity: medium
branch: bug-007-pane-find-e2e-fails-on-macos-after-platform-pin
promoted: false
packages: []
mergeMode: local
commit: a24ea851c83ba5492ed652b61790cde4a607b293
filesTouched:
  - .zekoder/bugs/007-pane-find-e2e-fails-on-macos-after-platform-pin.md
  - packages/app/e2e/browser/agent-message-submission.spec.ts
  - packages/app/e2e/browser/changes-shortcut-placement.spec.ts
  - packages/app/e2e/browser/chat-find.spec.ts
  - packages/app/e2e/browser/command-center-workspace-management.spec.ts
  - packages/app/e2e/browser/context-window-meter.spec.ts
  - packages/app/e2e/browser/empty-pane-keyboard.spec.ts
  - packages/app/e2e/browser/explorer-surface-upgrade.spec.ts
  - packages/app/e2e/browser/file-editing.spec.ts
  - packages/app/e2e/browser/keyboard-shortcut-sequence.spec.ts
  - packages/app/e2e/browser/launcher-tab.spec.ts
  - packages/app/e2e/browser/new-workspace-preselect.spec.ts
  - packages/app/e2e/browser/pane-find.spec.ts
  - packages/app/e2e/browser/provider-settings-refresh.spec.ts
  - packages/app/e2e/browser/settings-toggle-tab-regression.spec.ts
  - packages/app/e2e/browser/sidebar-workspace-pin-shortcut.spec.ts
  - packages/app/e2e/browser/terminal-find.spec.ts
  - packages/app/e2e/browser/workspace-archive-shortcut.spec.ts
  - packages/app/e2e/browser/workspace-focus-mode.spec.ts
  - packages/app/e2e/support/fixtures.ts
  - packages/app/e2e/support/helpers/launcher.ts
verifiedBaseSha: c76b63d31da9e2430caacbc808e511dc6cc6ce09
relatedFeatures: []
relatedBugs:
  - 005-macos-local-test-portability-and-flakes
relatedFollowups:
  - 006-validate-bug-005-fixes-on-macos
resolvedBy: null
statusHistory:
  - from: planned
    to: in-progress
    at: 2026-10-13T11:50:25.332Z
  - from: in-progress
    to: ready
    at: 2026-10-13T12:31:15.816Z
  - from: ready
    to: merged
    at: 2026-10-13T12:31:51.712Z
---
# Bug 007: pane-find.spec.ts fails 12 of 12 on macOS after the navigator.platform pin

## Summary

Found while validating bug 005's fixes (followup 006). On macOS every test in `packages/app/e2e/browser/pane-find.spec.ts` fails, including `:446`, which bug 005 meant to fix. Before the bug 005 fix only `:446` failed on macOS, so the other 11 are a regression from commit 894d1d3be.

## Repro steps

Host: macOS 26.6.2 (Darwin 25.6.0, arm64), Node v24.19.0. Reproduced 2 of 2 runs (12 failed each).

```
cd packages/app
npx playwright test --project=browser e2e/browser/pane-find.spec.ts
```

Output excerpt: `findInSource` presses `ControlOrMeta+f` (spec line 24), then `expect(query(page)).toBeFocused()` fails with `waiting for getByRole('textbox', { name: 'Find in pane', exact: true })` / `element(s) not found` (spec line 25). `:401` fails the same way for `ControlOrMeta+Alt+g` (Go to line input never appears). `:446` fails at line 462: `toHaveText("1 of 2")`, received `"2 of 2"`.

## Likely cause (not confirmed by an isolated experiment)

`packages/app/e2e/support/fixtures.ts:159-161` pins `navigator.platform` to `Win32` for every test so shortcut hints render as Ctrl on a Mac host. Playwright resolves `ControlOrMeta` to Meta on a macOS host, but the app now believes it runs on Windows and only claims Ctrl+F. Meta+F never reaches Find. The macOS-describe test (`:446`) sets a Mac user agent but the fixture init script still reports `Win32`, so its Control+F / Meta+F assumptions are inverted.

Eleven other specs in `e2e/browser` also use `ControlOrMeta` (assistant-selection-copy, changes-pane, chat-find, command-center-workspace-management, context-window-meter, file-editing, plugin-modal-body, provider-settings-refresh, sidebar-workspace-pin-shortcut, terminal-find) and are likely affected too; not run here.

## Expected vs. actual

Expected: pane-find passes on macOS as on Linux CI (38/38 on Linux). Actual: 12 of 12 fail on macOS.

## Fix direction

The pin must follow the host (or the specs must press the key that matches the pinned platform), and the macOS describe must also redefine `navigator.platform` to `MacIntel`.

## Tasks

- [x] Reproduce on macOS, pick the fixture or spec fix, and re-run pane-find plus the other `ControlOrMeta` specs on macOS and Linux.

## Verification

`npx playwright test --project=browser e2e/browser/pane-find.spec.ts` passes on macOS and Linux, and the shortcut-hint specs from bug 005 item 5 still pass.
