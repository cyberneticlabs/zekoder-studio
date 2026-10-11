---
id: 003-agent-timeline-e2e-deterministic-failures
type: bug
title: Agent timeline e2e tests fail deterministically in the fork
status: merged
createdAt: 2026-10-10
openedAt: 2026-10-10T17:00:17.221Z
updatedAt: 2026-10-11T20:46:32.563Z
completedAt: 2026-10-11T20:46:32.563Z
severity: medium
branch: bug-003-agent-timeline-e2e-deterministic-failures
promoted: false
packages: []
mergeMode: local
commit: 273a2b647d5e1f172f6f25607e1000ada6fe0c15
filesTouched:
  - .zekoder/bugs/003-agent-timeline-e2e-deterministic-failures.md
verifiedBaseSha: 8365ddc980c9379b44fa25d86c4600deaf611ab7
relatedFeatures: []
relatedBugs:
  - 002-builtin-plugin-pollutes-e2e-fixtures
  - 001-e2e-paseo-branding-assertions
relatedFollowups: []
resolvedBy: null
statusHistory:
  - from: planned
    to: in-progress
    at: 2026-10-11T20:40:50.703Z
  - from: in-progress
    to: ready
    at: 2026-10-11T20:46:04.251Z
  - from: ready
    to: merged
    at: 2026-10-11T20:46:32.563Z
---
# Bug 003-agent-timeline-e2e-deterministic-failures: Agent timeline e2e tests fail deterministically in the fork

## Summary

Two agent-timeline Playwright specs fail on both attempts in CI after the upstream v0.11.x merge (8e24f0fee); root cause is not yet determined (triage-needed).

## Repro steps

1. Check out `main` at or after 8e24f0fee (CI run: https://github.com/cyberneticlabs/zekoder-studio/actions/runs/38065806335, playwright shard 1/4).
2. From `packages/app`, run the two specs (targeted files only, never the full suite): `e2e/browser/agent-consecutive-turns.spec.ts` (test at line 858) and `e2e/browser/agent-timeline-resume.spec.ts` (test at line 45).
3. Observe both fail on every attempt.

## Expected vs. actual

- **Expected**: both specs pass, as they do on upstream CI at 6ec663342 (the merged upstream tip, green).
- **Actual**:
  - `agent-consecutive-turns.spec.ts:858` "keeps follow-up activity continuous when turn starts before response": `recordDelayedRunningTransition` (defined at line 736) fails at line 802, `expect(elapsedBeforeAuthoritative).toBe(0)` received 1. The value is `page.getByTestId("turn-working-elapsed").count()` read at line 768, so the working-elapsed indicator appears before the authoritative running state.
  - `agent-timeline-resume.spec.ts:45` "an unchanged resume leaves a scrolled-up timeline untouched": the viewport poll in `expectTimelinePresentationUnchanged` (`packages/app/e2e/support/helpers/timeline-pagination.ts`, `expect.poll(... rememberTimelineViewport ...)` at ~line 409) expected scrollHeight 2064, received 2034 (scrollTop 818 equal): a 30px layout difference.

## Root cause

Unconfirmed. Upstream CI was green at the merged tip, so the cause is suspected to be fork-specific. Candidates, none verified:

- Bug 002 (`002-builtin-plugin-pollutes-e2e-fixtures`): the built-in Zekoder plugin's UI or agent start hooks (for example an install-before-agent step delaying agent start) could explain the early/late `turn-working-elapsed` tick and extra timeline height.
- Rebrand layout/font changes altering timeline row heights (30px delta).

Relevant locations (real paths): `packages/app/e2e/browser/agent-consecutive-turns.spec.ts`, `packages/app/e2e/browser/agent-timeline-resume.spec.ts`, `packages/app/e2e/support/helpers/timeline-pagination.ts`. Plugin code lives under `packages/app/src/plugins` (see `.zekoder/kb/discovery/plugins.md`).

## Fix approach

Triage first, then fix once the cause is known:

1. Wait for bug 002's harness fix, then re-run both specs. If they pass, close this as resolved by 002.
2. If still failing, bisect fork commits since merge-base a7f7405c0 (`git bisect` with the two targeted specs) to find the introducing commit.
3. Fix at the cause (plugin/brand code or harness fixture), not by loosening the assertions.

## Tasks

- [x] After bug 002 lands, re-run `packages/app/e2e/browser/agent-consecutive-turns.spec.ts` (test "keeps follow-up activity continuous when turn starts before response") and `packages/app/e2e/browser/agent-timeline-resume.spec.ts` (test "an unchanged resume leaves a scrolled-up timeline untouched"); record the result here.
- [x] If still failing, bisect fork commits since a7f7405c0 to the introducing commit; note it in this doc. (N/A: both specs pass, nothing to bisect.)
- [x] Fix the identified cause (N/A: resolved by bug 002, no code change) (file path(s) determined by the bisect; likely `packages/app/src/plugins/` or brand/layout code, or e2e fixtures under `packages/app/e2e/support/`) <!-- TODO: exact paths after triage -->.

## Triage result

Resolved by bug 002 (`PASEO_DISABLE_BUILTIN_PLUGINS=zekoder` in the e2e worker daemon env). On the batch-3 staging branch (86f4b19b4, which includes the bug 002 harness fix and bug 001 branding fixes), run locally from `packages/app` with `npx playwright test --project=browser <spec> --grep "<title>"`:

- `agent-consecutive-turns.spec.ts` "keeps follow-up activity continuous when turn starts before response": passed 4 of 4 runs (1 single run, then `--repeat-each=3`).
- `agent-timeline-resume.spec.ts` "an unchanged resume leaves a scrolled-up timeline untouched": passed 3 of 3 runs (`--repeat-each=3`).

The built-in Zekoder plugin was the most likely cause (inferred from the fix, not separately proven): it plausibly altered agent-start timing and timeline height (the 30px scrollHeight delta). No bisect or code change needed. CI shard 1/4 on the batch PR is the remaining confirmation.

## Verification

Both specs pass, run as targeted files only (never the full suite locally), and the playwright shard 1/4 passes in CI on the fix branch.
