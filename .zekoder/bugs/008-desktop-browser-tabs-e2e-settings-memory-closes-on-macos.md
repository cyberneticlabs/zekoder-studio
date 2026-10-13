---
id: 008-desktop-browser-tabs-e2e-settings-memory-closes-on-macos
type: bug
title: "Desktop browser-tabs e2e fails on macOS: page closes during settings memory regression, hidden-frame skip never reached"
status: planned
createdAt: 2026-10-13
openedAt: 2026-10-13T11:13:12.407Z
updatedAt: 2026-10-13T11:13:12.407Z
severity: low
branch: bug-008-desktop-browser-tabs-e2e-settings-memory-closes-on-macos
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
# Bug 008: Desktop browser-tabs e2e fails on macOS before reaching the hidden-frame case

## Summary

Found while validating bug 005 item 4 (followup 006). `npm run test:e2e:browser-tabs` in `packages/desktop` fails on macOS in `runSettingsMemoryRegression` with `cdpSession.send: Target page, context or browser has been closed`. The run never reaches the hidden-frame case at `packages/desktop/e2e/browser-tabs.e2e.mjs:893`, so the darwin skip added by bug 005 could not be observed. Bug 005's own log reached the hidden-frame case, so the settings-memory step passed or was absent then.

## Repro steps

Host: macOS 26.6.2 (Darwin 25.6.0, arm64), Node v24.19.0. Reproduced 3 of 3 runs.

```
cd packages/desktop
npm run test:e2e:browser-tabs
```

Output excerpt:

```
Browser desktop browser E2E failed. Artifacts: /var/folders/.../paseo-desktop-browser-e2e-artifacts-U21J4f
cdpSession.send: Target page, context or browser has been closed
    at countDetachedSettingsPanes (e2e/settings-memory.electron.mjs:86:33)
    at async collectDetachedSettingsPanes (e2e/settings-memory.electron.mjs:113:21)
    at async runSettingsMemoryRegression (e2e/settings-memory.electron.mjs:138:34)
    at async main (e2e/browser-tabs.e2e.mjs:1214:28)
```

`desktop.log` shows no crash or renderer-gone line; the page closes during `HeapProfiler.collectGarbage` / `Runtime.queryObjects` after the warm rotation.

## Expected vs. actual

Expected: the settings memory step completes, the hidden-frame case prints `skip: hidden-browser screenshot case is compositor-specific and not run on macOS`, and the script exits 0. Actual: exit 1 at the settings memory step.

## Tasks

- [ ] Find why the Electron page/target closes under CDP heap collection on macOS (renderer crash, GC probe, or the cdp session), then re-run and confirm the hidden-frame skip message.

## Verification

`npm run test:e2e:browser-tabs` in `packages/desktop` exits 0 on macOS and prints the hidden-frame skip reason.
