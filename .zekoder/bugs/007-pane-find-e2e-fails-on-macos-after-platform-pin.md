---
id: 007-pane-find-e2e-fails-on-macos-after-platform-pin
type: bug
title: "pane-find.spec.ts fails 12 of 12 on macOS: fixture pins navigator.platform to Win32 but specs press ControlOrMeta"
status: planned
createdAt: 2026-10-13
openedAt: 2026-10-13T11:13:10.626Z
updatedAt: 2026-10-13T11:13:10.626Z
severity: medium
branch: bug-007-pane-find-e2e-fails-on-macos-after-platform-pin
promoted: false
packages: []
relatedFeatures: []
relatedBugs:
  - 005-macos-local-test-portability-and-flakes
relatedFollowups:
  - 006-validate-bug-005-fixes-on-macos
resolvedBy: null
statusHistory: []
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

- [ ] Reproduce on macOS, pick the fixture or spec fix, and re-run pane-find plus the other `ControlOrMeta` specs on macOS and Linux.

## Verification

`npx playwright test --project=browser e2e/browser/pane-find.spec.ts` passes on macOS and Linux, and the shortcut-hint specs from bug 005 item 5 still pass.
