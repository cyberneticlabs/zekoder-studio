---
id: 006-macos-undiagnosed-e2e-failures
type: bug
title: "Undiagnosed macOS-only Playwright failures: PR-resolving button, scroll smoothness, terminal tab title"
status: planned
createdAt: 2026-10-12
openedAt: 2026-10-12T20:39:18.213Z
updatedAt: 2026-10-12T20:39:18.213Z
severity: low
branch: bug-006-macos-undiagnosed-e2e-failures
promoted: false
packages: []
relatedFeatures: []
relatedBugs:
  - 005-macos-local-test-portability-and-flakes
relatedFollowups: []
resolvedBy: null
statusHistory: []
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

Unknown.

## Tasks

- [ ] Reproduce each on macOS, find the cause, and fix, gate, or accept it.

## Verification

The three specs pass on macOS; Linux CI stays green.
