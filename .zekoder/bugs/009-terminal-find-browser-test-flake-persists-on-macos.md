---
id: 009-terminal-find-browser-test-flake-persists-on-macos
type: bug
title: terminal-find browser test "multiple real parser turns" still fails 4 of 12 runs on macOS after bug 005 fix
status: merged
createdAt: 2026-10-13
openedAt: 2026-10-13T11:13:14.339Z
updatedAt: 2026-10-13T22:02:45.444Z
completedAt: 2026-10-13T22:02:45.444Z
severity: low
branch: bug-009-terminal-find-browser-test-flake-persists-on-macos
promoted: false
packages: []
mergeMode: local
commit: a3c5483733ba4abf696cb8625ef855abe3243a4b
filesTouched:
  - .zekoder/bugs/009-terminal-find-browser-test-flake-persists-on-macos.md
  - packages/app/src/terminal/runtime/terminal-find.browser.test.ts
verifiedBaseSha: 4aa4cc42e31552432cb6714b1882deeab590d6a7
relatedFeatures: []
relatedBugs:
  - 005-macos-local-test-portability-and-flakes
relatedFollowups:
  - 006-validate-bug-005-fixes-on-macos
resolvedBy: null
statusHistory:
  - from: planned
    to: merged
    at: 2026-10-13T22:02:45.444Z
---
# Bug 009: terminal-find "multiple real parser turns" test still flakes on macOS

## Summary

Found while validating bug 005 item 7 (followup 006). The test `preserves inspection through multiple real parser turns of queued output` in `packages/app/src/terminal/runtime/terminal-find.browser.test.ts` still fails after the condition-wait fix (it now uses `vi.waitFor` with a 5 s timeout).

## Repro steps

Host: macOS 26.6.2 (Darwin 25.6.0, arm64), Node v24.19.0, vitest 4.1.7 browser project (chromium).

```
cd packages/app
npx vitest run --project browser src/terminal/runtime/terminal-find.browser.test.ts
```

12 consecutive runs: runs 1 to 4 failed, runs 5 to 12 passed (4 of 12 failed). Each failure is the same test (8 of 9 other tests pass):

```
AssertionError: expected 1 to be greater than 1
 > vi.waitFor.timeout src/terminal/runtime/terminal-find.browser.test.ts:162
    expect(samples.length).toBeGreaterThan(1);
```

The failing runs took about 7.7 s for that test, so the 5 s waitFor expired with only one `onWriteParsed` sample. The failures were the first runs of the session, which suggests a cold start (browser or transform cache) matters.

## Expected vs. actual

Expected: passes every run. Actual: fails 4 of 12.

## Tasks

- [x] Determine why only one parser turn is observed (the queued writes may be coalesced into a single parse on a slow first run) and make the test assert the behavior without depending on the number of turns, or force multiple turns deterministically.

## Verification

12 or more consecutive macOS runs pass, including a first run after a cold start.
