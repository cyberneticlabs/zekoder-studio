---
id: 004-antigravity-signal-process-eperm-macos
type: bug
title: Antigravity signalProcess throws EPERM on macOS after the child already exited
status: planned
createdAt: 2026-10-11
openedAt: 2026-10-11T22:07:44.963Z
updatedAt: 2026-10-11T22:07:44.963Z
severity: low
branch: bug-004-antigravity-signal-process-eperm-macos
promoted: false
packages: []
relatedFeatures: []
relatedBugs: []
relatedFollowups:
  - 004-full-local-test-run-before-push
resolvedBy: null
statusHistory: []
---
# Bug 004-antigravity-signal-process-eperm-macos: Antigravity signalProcess throws EPERM on macOS after the child already exited

## Summary

`signalProcess` in the Antigravity provider treats only `ESRCH` as "process already gone". On macOS, signalling the process group of an exited-but-unreaped child returns `EPERM`, which is rethrown and surfaces as `kill EPERM` in the user-facing error.

## Repro steps

1. On a macOS machine, from the repo root: `cd plugins && npx vitest run antigravity-provider/server/provider.test.ts`.
2. Observe `reports startup auth without waiting for init forever` fail. Reproduced 3 of 3 runs in followup 004 (log: `/tmp/zk004-builtin-plugins.txt`).

## Expected vs. actual

- **Expected**: the failed startup reports `Run \`agy\` and sign in` in the `request.failed` error.
- **Actual**: the error message is `kill EPERM`.

## Root cause

`plugins/antigravity-provider/server/internal/signals.ts` (`signalProcess`): the `catch` rethrows every error except `ESRCH`. The fixture `plugins/antigravity-provider/test/agy.mjs` exits immediately for `AGY_TEST_STARTUP=auth`, so the provider then signals a dead process group. macOS returns `EPERM` for that case; Linux returns `ESRCH`, so Linux CI is green. Not confirmed against the macOS kernel docs; the platform split is inferred from the local failure plus green Linux CI.

## Fix approach

Treat `EPERM` the same as `ESRCH` for an already-exited group in `signalProcess` (darwin only, with a comment), and keep the existing test as the regression check.

## Tasks

- [ ] Handle `EPERM` for exited process groups in `plugins/antigravity-provider/server/internal/signals.ts` and run `antigravity-provider/server/provider.test.ts` on macOS.

## Verification

`cd plugins && npx vitest run antigravity-provider/server/provider.test.ts` passes on macOS and Linux.
