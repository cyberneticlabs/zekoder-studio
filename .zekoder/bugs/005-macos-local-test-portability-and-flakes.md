---
id: 005-macos-local-test-portability-and-flakes
type: bug
title: Several unit and e2e tests fail or flake when run on a macOS dev machine
status: planned
createdAt: 2026-10-11
openedAt: 2026-10-11T22:07:47.582Z
updatedAt: 2026-10-11T22:07:47.582Z
severity: low
branch: bug-005-macos-local-test-portability-and-flakes
promoted: false
packages: []
relatedFeatures: []
relatedBugs: []
relatedFollowups:
  - 004-full-local-test-run-before-push
resolvedBy: null
statusHistory: []
---
# Bug 005-macos-local-test-portability-and-flakes: Several unit and e2e tests fail or flake when run on a macOS dev machine

## Summary

Running the CI job commands locally on macOS (arm64, Node 24.19.0, Darwin 25.6.0) in followup 004 leaves a set of failures that are host-platform or host-tool assumptions in the tests, plus two timing flakes. Linux CI is the reference environment, so none of these are confirmed regressions; this item lets someone decide per test whether to fix, gate, or accept.

## Repro steps

Run from the repo root on macOS. Logs are from followup 004 (`/tmp/zk004-*.txt`, may be gone later; the commands reproduce them).

Deterministic on macOS (3 of 3 isolated reruns unless noted):

1. `cd packages/server && npx vitest run src/server/workspace-service-port-allocator.test.ts`: `passes service and workspace context to portScript` expects `/var/folders/...` but receives `/private/var/folders/...` (macOS `/var` is a symlink to `/private/var`; the test compares `tmpdir()` path with the script's `process.cwd()` realpath). Test line `workspace-service-port-allocator.test.ts:63`.
2. `E2E_DESKTOP_RUNTIME=1 npx playwright test --config=playwright.config.ts --project=desktop e2e/keyboard-shortcut-unassign.spec.ts` in `packages/desktop`: the `win32` case fails because the renderer shows macOS glyphs (`^⇧⌫`) instead of `Ctrl+Shift+⌫`; the spec fakes the platform but the host shortcut renderer follows the real host.
3. `PASEO_LOCAL_SPEECH_AUTO_DOWNLOAD=0 npx tsx packages/cli/tests/15-provider.test.ts`: `codex model list should include at least one codex-optimized model`. CI pins `@openai/codex@0.105.0`; the dev machine had codex-cli 0.160.0 whose model IDs include none containing `codex`. The assertion couples the test to the installed codex catalogue.
4. `packages/desktop` `npm run test:e2e:browser-tabs`: `before-capture: hidden browser produced 120 animation frames` on macOS. CI runs this under xvfb on Linux; see `docs/browser-capture-harness.md` on compositor surfaces.
5. `packages/app` Playwright (`npx playwright test --project=browser <spec>`), still failing after providing `opencode` on PATH and a clean npm user config: `keyboard-chord-modifier-step.spec.ts` (2 tests), `new-workspace-entry.spec.ts:140` (Ctrl+P), `pane-find.spec.ts:446`, `plugin-sidebar-items.spec.ts:244`, `sidebar-nav-settings.spec.ts:34` and `:82` (expect `Ctrl+O` / `Ctrl+N` hints, macOS renders `⌘`), `terminal-tab-title-loading.spec.ts:58` (tab shows `/private/var/...` cwd instead of `My named terminal`), `new-workspace.spec.ts:981` and `:1039` (create button not disabled while the PR resolves; cause not diagnosed). Also `agent-timeline-scroll-smoothness.spec.ts:137` (3 of 3 runs: `visible text must not reverse direction`, a row resized from 560 to 225 after an image load; cause not diagnosed and not tied to the Zekoder changes).

Flaky (pass sometimes in isolation):

6. `packages/server/src/server/workspace-git-service.observation.integration.test.ts` `recursive observation updates tracked state and prunes ignored storms`: passed in one full run and 2 of 3 isolated runs; fails with `activeWatcherCount` 1 instead of 2.
7. `packages/app/src/terminal/runtime/terminal-find.browser.test.ts` `preserves inspection through multiple real parser turns of queued output`: failed once in the full app run (`samples.length` 1, wanted more than 1, a 350 ms sampling window), passed 1 of 2 isolated reruns.

## Expected vs. actual

- **Expected**: the CI-equivalent commands pass on a developer machine, or the test self-skips with a stated reason when the host cannot satisfy it.
- **Actual**: the failures above.

## Root cause

Items 1, 2, 3, 5 (shortcut, terminal title) and 4 are host-dependent assumptions (macOS realpath, host shortcut glyphs, installed codex version, compositor). Items 6 and 7 are timing-sensitive. `new-workspace.spec.ts` PR tests and the scroll smoothness test were not diagnosed. All unverified beyond the observations stated.

## Fix approach

Triage per test: realpath the temp dir in item 1; resolve the displayed shortcut from the faked platform in items 2 and 5; derive item 3 from the actual catalogue or pin codex in a documented dev setup; skip macOS for item 4 with a reason; widen or condition-wait the sampling in items 6 and 7. Diagnose the undiagnosed ones in item 5 first.

## Tasks

- [ ] Triage each numbered item above and fix, gate, or accept it; split items into their own bugs as they turn out to have different causes.

## Verification

The commands in the repro steps pass on macOS, and Linux CI stays green.
