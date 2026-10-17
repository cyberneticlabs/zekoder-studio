---
id: 013-eas-fork-identity
type: followup
title: Move EAS owner and project ID off upstream before enabling EAS
status: planned
createdAt: 2026-10-16
openedAt: 2026-10-16T15:50:17.706Z
updatedAt: 2026-10-17T09:43:29.604Z
origin: zekoder-planner-agent
filedFromTask: null
branch: followup-013-eas-fork-identity
promoted: false
packages: []
relatedFeatures: []
relatedBugs: []
relatedFollowups:
  - 015-expo-app-store-accounts
resolvedBy: null
statusHistory: []
---
# Followup 013-eas-fork-identity: Move EAS owner and project ID off upstream before enabling EAS

## Summary

`packages/app` still points EAS at upstream Paseo's Expo account, project and App Store Connect app; move all of it to a Cybernetic Labs Expo account/project and make the fork's EAS workflows runnable when enabled.

## Why it's out of scope now

Nothing publishes from the fork today: `.github/workflows/android-apk-release.yml` is gated to `getpaseo/paseo`, and the EAS GitHub app that triggers `packages/app/.eas/workflows/*` is installed on upstream only. Mobile (iOS and Android) release is deferred, so the identity swap is blocked on creating the Expo project and store records, which only the user can do. It must land before anyone runs `eas build`, `eas submit` or `eas update` from this fork.

## Proposed approach

Replace every upstream EAS identity with Zekoder's, using ids the user supplies (do not invent any), then update gating and docs.

Touch points found (all paths repo-relative, confirmed to exist):

- `packages/app/app.config.js` lines 195-199: `extra.eas.projectId` = upstream's `0e7f65ce-...` and top-level `owner: "getpaseo"`. No `updates.url` and no `runtimeVersion` are set (no `expo-updates`), so there is nothing to change there; do not add OTA updates in this item.
- `packages/app/eas.json`: `submit.production.ios.ascAppId` = upstream's `6758887924` (App Store Connect app). `submit.production.android` has only `track`/`releaseStatus` (no service-account key path), nothing upstream-specific. Build profiles (`development`, `production`, `production-apk`) are identity-free.
- `packages/app/.eas/workflows/release-mobile.yml`, `release-ios-beta.yml`, `resubmit-ios-review.yml`: tag-triggered EAS workflows (`v*`). `release-ios-beta.yml` line 24 names the TestFlight group `Paseo Beta` (rename if the Zekoder group differs). These run only where the EAS GitHub app is connected, so they are inert in the fork until the new Expo project is linked to `cyberneticlabs/zekoder-studio`.
- `.github/workflows/android-apk-release.yml`: lines 25 and 69 gate on `github.repository == 'getpaseo/paseo'`; line 99-112 uses `secrets.EXPO_TOKEN` and `npx eas build`. Update the gate to the fork repo (or an enable variable such as `vars.EAS_ENABLED`) so it can run when the user turns it on. Keep it off by default; Android is deferred.
- `docs/release.md` ("Mobile builds (EAS)" at ~line 560, and line 501) and `docs/android.md` ("Cloud build + submit (EAS)" at ~line 206): both say EAS is triggered by the upstream EAS GitHub app. Rewrite to the Zekoder Expo project and the fork repo, per the docs rules in `CLAUDE.md` (integrate, do not append).
- `packages/app/app.config.test.ts`: only asserts Android camera manifest entries; it has no owner/projectId expectations. Do not weaken it. Optionally add one assertion that `exp.owner` and `exp.extra.eas.projectId` are not the upstream values.

Blocked by followup `015-expo-app-store-accounts`, which owns the account and store setup and records the values below.

Open questions / prerequisites for the user (blocking; leave as placeholders until answered):

1. Expo account/organization slug to use as `owner` (Cybernetic Labs).
2. New EAS `projectId` (create with `eas init` under that owner) and confirm the app `slug` in `app.config.js` still matches.
3. App Store Connect app id for `net.zekoder.app` (replaces `ascAppId`), plus Apple team/credentials in the new Expo project.
4. Play Console app and service-account key for EAS submit (can wait; Android deferred).
5. Whether the EAS GitHub app is installed on `cyberneticlabs/zekoder-studio`, and whether `EXPO_TOKEN` exists as a repo secret.
6. TestFlight group name for `release-ios-beta.yml`.

Related note, out of scope (user deferred Android): Android e2e scripts `packages/app/e2e/mobile/agent-device/*.ad` still use package id `sh.paseo.debug` instead of `net.zekoder.app.debug`. Track separately.

## Tasks

- [ ] `packages/app/app.config.js`: set `owner` and `extra.eas.projectId` to the Zekoder values from open questions 1-2. <!-- TODO: ids unknown; needs user input -->
- [ ] `packages/app/eas.json`: set `submit.production.ios.ascAppId` to the Zekoder App Store Connect id (question 3). <!-- TODO: id unknown -->
- [ ] `.github/workflows/android-apk-release.yml`: replace both `getpaseo/paseo` gates (lines 25, 69) with the fork repo or an opt-in `vars.EAS_ENABLED` check; keep `EXPO_TOKEN` as the secret name.
- [ ] `packages/app/.eas/workflows/release-ios-beta.yml`: update the TestFlight group name if it differs (question 6).
- [ ] `docs/release.md` and `docs/android.md`: rewrite the EAS sections and release.md line 501 to describe the Zekoder Expo project, the fork repo and the enable prerequisites (GitHub app, `EXPO_TOKEN`).
- [ ] `packages/app/app.config.test.ts`: optionally add the owner/projectId not-upstream assertion described above.

## Verification

- `rg "getpaseo|0e7f65ce|6758887924" packages/app/app.config.js packages/app/eas.json packages/app/.eas .github/workflows/android-apk-release.yml` returns nothing.
- From `packages/app`: `npx vitest run app.config.test.ts --bail=1` passes.
- `npm run typecheck`, `npm run lint` and `npm run format:files -- <changed files>` pass.
- With the user's account, `npx eas project:info` (in `packages/app`) shows the Zekoder owner and project.
