---
id: 010-observation-integration-watcher-count-flake-persists-on-macos
type: bug
title: workspace-git-service observation integration test still flakes (activeWatcherCount 1 vs 2) on macOS, 1 of 15 runs
status: planned
createdAt: 2026-10-13
openedAt: 2026-10-13T11:13:16.066Z
updatedAt: 2026-10-13T11:13:16.066Z
severity: low
branch: bug-010-observation-integration-watcher-count-flake-persists-on-macos
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
# Bug 010: observation integration test still flakes on macOS (activeWatcherCount)

## Summary

Found while validating bug 005 item 6 (followup 006). `recursive observation updates tracked state and prunes ignored storms` in `packages/server/src/server/workspace-git-service.observation.integration.test.ts` still fails intermittently with the same symptom bug 005 described.

## Repro steps

Host: macOS 26.6.2 (Darwin 25.6.0, arm64), Node v24.19.0, vitest 4.1.6.

```
cd packages/server
npx vitest run src/server/workspace-git-service.observation.integration.test.ts
```

15 isolated runs, 1 failed (run 4), 14 passed. Output excerpt:

```
× recursive observation updates tracked state and prunes ignored storms 25013ms
AssertionError: expected 1 to be 2 // Object.is equality
 ❯ vi.waitFor.timeout ...observation.integration.test.ts:213:34
    expect(activeWatcherCount).toBe(2);
```

The 25 s duration is the waitFor timeout, so the second watcher never appeared in that run (not just a late one).

## Expected vs. actual

Expected: passes every run. Actual: about 1 in 15 runs fails (about 7 percent).

## Tasks

- [ ] Find why the second recursive watcher is sometimes never registered on macOS (FSEvents setup race vs. test expectation) and fix the test or the product code.

## Verification

At least 30 consecutive isolated macOS runs pass.
