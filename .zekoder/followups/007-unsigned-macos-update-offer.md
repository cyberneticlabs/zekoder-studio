---
id: 007-unsigned-macos-update-offer
type: followup
title: Suppress or explain the update offer on unsigned macOS builds
status: planned
createdAt: 2026-10-13
openedAt: 2026-10-13T11:41:37.254Z
updatedAt: 2026-10-13T11:41:54.878Z
origin: zekoder-planner-agent
filedFromTask: null
branch: followup-007-unsigned-macos-update-offer
promoted: false
packages: []
relatedFeatures:
  - 007-unsigned-macos-release-policy
relatedBugs: []
relatedFollowups: []
resolvedBy: null
statusHistory: []
---
# Followup 007-unsigned-macos-update-offer: Suppress or explain the update offer on unsigned macOS builds

## Summary

When the running macOS app has no Developer ID signature (feature 007's `unsigned` policy), stop advertising an update it cannot install: suppress the offer, explain it, or point to a manual download.

## Why it's out of scope now

Feature 007 is a release-workflow and docs change; the user scoped it to docs only for updater behavior. Discovery there found the gap:

- The catalog check is signature-agnostic, so an unsigned macOS build gets `hasUpdate: true` from `packages/desktop/src/features/app-update-service.ts` (`checkForAppUpdate`).
- electron-updater's `MacUpdater` then passes the downloaded zip to Squirrel.Mac (`nativeUpdater.checkForUpdates`), which validates signatures and errors for an unsigned or ad-hoc app.
- `app-update-service.ts` (`installCachedUpdate` catch block) returns `Update failed: <message>` and calls `reportInstallError`, which `packages/desktop/src/features/auto-updater.ts` only logs. Nothing in the app knows the running build is unsigned.

Nothing crashes, but users on unsigned builds are offered updates that always fail. The exact Squirrel.Mac error text was not confirmed (no macOS machine).

## Proposed approach

Pick one with the user before building; the smallest first:

1. In `packages/desktop/src/features/auto-updater.ts` (`getAppUpdateService`), detect an unsigned or ad-hoc running app on darwin (for example `codesign -dv` reporting `Signature=adhoc` or no Team ID) and, for that case, report `hasUpdate` with a message pointing to the manual download instead of attempting the install. Keep the detection injectable like the other deps so `app-update-service.test.ts` and `auto-updater.test.ts` cover it with fakes.
2. Alternatively surface the failure text as a clear "download the new version manually" message where `installCachedUpdate` builds `Update failed: ...`.

Do not change the update contracts in `app-update-service.ts` / `app-update-rollout.ts` beyond what the chosen option needs, and keep the no-downgrade policy (`allowDowngrade = false`, set in `packages/desktop/src/features/catalog-app-update-runtime.ts`).

## Tasks

- [ ] Confirm on a real macOS arm64 and x64 unsigned build what Squirrel.Mac returns, and record it here.
- [ ] Choose option 1 or 2 with the user.
- [ ] Implement in `packages/desktop/src/features/auto-updater.ts` and/or `packages/desktop/src/features/app-update-service.ts`, with fakes-based tests in the matching `*.test.ts` files.
- [ ] Update the "Unsigned macOS builds" section of `docs/release.md` to describe the new behavior.

## Verification

- `npx vitest run packages/desktop/src/features/app-update-service.test.ts --bail=1` and `auto-updater.test.ts`, output to a file.
- On an unsigned macOS build: the app no longer shows an update that fails to install, or shows a clear manual-download message.
- `npm run typecheck` and `npm run lint` on the changed files.
