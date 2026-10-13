---
id: 006-macos-undiagnosed-e2e-failures
type: bug
title: "Undiagnosed macOS-only Playwright failures: PR-resolving button, scroll smoothness, terminal tab title"
status: merged
createdAt: 2026-10-12
openedAt: 2026-10-12T20:39:18.213Z
updatedAt: 2026-10-13T10:40:08.770Z
completedAt: 2026-10-13T10:40:08.770Z
severity: low
branch: bug-006-macos-undiagnosed-e2e-failures
promoted: false
packages: []
mergeMode: local
commit: d3f38b3be18d86725d8a62a8569a37cd68dfcb68
filesTouched:
  - .zekoder/bugs/006-macos-undiagnosed-e2e-failures.md
  - packages/app/e2e/browser/agent-timeline-scroll-smoothness.spec.ts
  - packages/app/e2e/support/helpers/new-workspace.ts
  - packages/app/e2e/support/helpers/timeline-scroll-smoothness.ts
  - packages/server/src/terminal/terminal-worker-process.ts
  - packages/server/src/terminal/terminal-worker-protocol.ts
  - packages/server/src/terminal/worker-terminal-manager.test.ts
  - packages/server/src/terminal/worker-terminal-manager.ts
verifiedBaseSha: 33486bb02da01ec6a5c43edb1fb6ff624f043486
relatedFeatures: []
relatedBugs:
  - 005-macos-local-test-portability-and-flakes
relatedFollowups: []
resolvedBy: null
statusHistory:
  - from: planned
    to: merged
    at: 2026-10-13T10:40:08.770Z
---
# Bug 006: Undiagnosed macOS-only Playwright failures

## Summary

Split from bug 005. These app Playwright failures were seen on macOS (arm64) and need diagnosis on a Mac; no cause is known and none could be reproduced on Linux.

## Repro steps

In `packages/app`, `npx playwright test --project=browser <spec>`:

1. `e2e/browser/new-workspace.spec.ts:981` and `:1039`: the create button is not disabled while the PR resolves.
2. `e2e/browser/agent-timeline-scroll-smoothness.spec.ts:137`: `visible text must not reverse direction`; a row resized from 560 to 225 after an image load (3 of 3 runs).
3. `e2e/browser/terminal-tab-title-loading.spec.ts:58`: after reload the tab shows a `/private/var/...` cwd instead of `My named terminal`. The fixture already realpaths its temp dirs (`resolveTempRoot`), so this is not a fixture realpath issue; suspect the macOS shell emitting a cwd title that overrides the renamed title after restore.

## Expected vs. actual

Expected: specs pass on macOS as on Linux CI. Actual: the failures above.

## Root cause

All three reproduced on macOS arm64 and are now fixed.

1. `new-workspace.spec.ts:981` and `:1039` (test bug). `pasteGithubPrUrl` pressed `Control+V`, which does not paste in Chromium on macOS, so no PR URL was pasted, nothing resolved, and the create button stayed enabled. The helper now presses `ControlOrMeta+V`.
2. `agent-timeline-scroll-smoothness.spec.ts:137` slow cadence (test detector bug). The 3:2 placeholder of a delayed image collapses to its real 4:1 height (560 to 225) in the same frame a wheel step brings the reading line into that row. The row is anchored by its top, so the text below it rises by the collapse, the mirror of the growth case that `findScrollJumps` already tolerates (`enteredRowGrowth`). The detector ignored shrinkage, so it flagged a 175 px reversal. It now allows `enteredRowShrink` the same way, with a detector unit test built from the recorded frames. Product anchoring matches browser behaviour and is unchanged.
3. `terminal-tab-title-loading.spec.ts:58` (product bug, all platforms). `worker-terminal-manager` `setTitle` updated only the parent mirror and never told the terminal worker. The worker session stayed in auto title mode, so the next shell title escape (macOS zsh emits the cwd, with `/private/var/...`) overwrote the user's manual name, visible after a reload re-listed terminals. The parent now forwards a `setTitle` worker request, which switches the worker session to manual mode.

## Tasks

- [x] Reproduce each on macOS, find the cause, and fix, gate, or accept it.

## Verification

The three specs pass on macOS; Linux CI stays green.
