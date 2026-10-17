---
id: 015-expo-app-store-accounts
type: followup
title: Set up Expo, App Store Connect and Play Console accounts for Zekoder mobile
status: planned
createdAt: 2026-10-17
openedAt: 2026-10-17T09:42:36.452Z
updatedAt: 2026-10-17T09:43:26.430Z
origin: zekoder-planner-agent
filedFromTask: null
branch: followup-015-expo-app-store-accounts
promoted: false
packages: []
relatedFeatures: []
relatedBugs: []
relatedFollowups:
  - 013-eas-fork-identity
resolvedBy: null
statusHistory: []
---
# Followup 015-expo-app-store-accounts: Set up Expo, Apple and Google store accounts for Zekoder mobile

## Summary

Human/account work: create the Cybernetic Labs Expo org, EAS project and Apple/Google store records, and record the resulting ids for followup 013 (which owns the code changes).

## Why it's out of scope now

Nothing publishes from the fork today and mobile release (iOS and Android) is deferred. These steps need the owner's logins, legal entity data (D-U-N-S) and payment, so no agent can do them. 013 (`013-eas-fork-identity`) is blocked until the values below exist. Owner: Cybernetic Labs Ltd, contact help@zekoder.com.

## Proposed approach

Work the checklist in order, filling the "Values to hand to 013" table. Then give the table to 013's coding agent. No code changes here.

Confirmed in `packages/app/app.config.js`: bundle/package ids `net.zekoder.app` (production, line 72) and `net.zekoder.app.debug` (development, line 84); `slug` is still upstream's `voice-mobile` (line 102); `extra.eas.projectId` (line 196) and `owner: "getpaseo"` (line 199) are upstream's. `packages/app/eas.json` line 39 holds upstream's `ascAppId`.

## Tasks

- [ ] 1. Expo organization (e.g. `cyberneticlabs`) on expo.dev; add team members; optionally a robot user for CI. Returns `owner`.
- [ ] 2. EAS project. Decide the new `slug` first (keep `voice-mobile` or rename, e.g. `zekoder`). Then create the project on expo.dev, or run `npx eas init` in `packages/app` after pointing `owner` at the org and removing the old `projectId`. Returns `extra.eas.projectId` and final `slug`.
- [ ] 3. Apple Developer Program enrollment as an organization (Cybernetic Labs Ltd; needs a D-U-N-S number; can take days). Register bundle ids `net.zekoder.app` and `net.zekoder.app.debug`. Returns the Apple Team ID.
- [ ] 4. App Store Connect: My Apps, New App for `net.zekoder.app` (choose a SKU). App Information shows the numeric Apple ID, which goes to `packages/app/eas.json` `submit.production.ios.ascAppId`. Create an App Store Connect API key for `eas submit` and store it via `eas credentials`. Let the first `eas build -p ios` create the distribution certificate and provisioning profile. Returns `ascAppId`.
- [ ] 5. TestFlight external group (e.g. "Zekoder Beta"). Replaces "Paseo Beta" at `packages/app/.eas/workflows/release-ios-beta.yml:24`. Returns the group name.
- [ ] 6. DEFERRED (Android on hold; does not block iOS). Play Console app `net.zekoder.app`; Google Cloud service account JSON with release rights uploaded to EAS; upload the first AAB manually.
- [ ] 7. Set the `EXPO_TOKEN` repo secret on cyberneticlabs/zekoder-studio (`gh secret set EXPO_TOKEN`). Used by `.github/workflows/android-apk-release.yml`.
- [ ] 8. Decide the EAS GitHub app link. GOTCHA: `packages/app/.eas/workflows/release-mobile.yml` triggers on every stable `v*` tag (excluding -rc/-beta) and builds and submits iOS and Android (Play track production, releaseStatus completed per `eas.json`); `release-ios-beta.yml` triggers on `v*-beta.*`. Zekoder desktop releases use the same `vX.Y.Z` / `vX.Y.Z-beta.N` tags (`docs/release.md`), so linking the app would ship a mobile release on every desktop tag. Choose: (a) keep unlinked and build/submit manually, or (b) have 013 move the mobile workflows to a separate tag pattern (e.g. `mobile-v*`) before linking. Record the choice for 013.
- [ ] 9. Store listing basics: App Privacy questionnaire, privacy policy URL, support URL (zekoder.net / zekoder.com), export compliance answers, screenshots and description. Brief; not needed by 013.

### Values to hand to 013

| Value | Goes to | Result |
| --- | --- | --- |
| Expo owner (org slug) | `packages/app/app.config.js` `owner` | |
| App `slug` (keep `voice-mobile` or new) | `packages/app/app.config.js` `slug` | |
| EAS projectId | `packages/app/app.config.js` `extra.eas.projectId` | |
| Apple Team ID | EAS credentials (reference) | |
| App Store Connect Apple ID | `packages/app/eas.json` `submit.production.ios.ascAppId` | |
| TestFlight group name | `packages/app/.eas/workflows/release-ios-beta.yml:24` | |
| EXPO_TOKEN secret set (yes/no) | repo secret on cyberneticlabs/zekoder-studio | |
| EAS GitHub app decision (unlinked / separate tag pattern) | 013 workflows and `docs/release.md` | |
| Play Console / service account (deferred) | EAS submit (Android) | |

## Verification

- Every non-deferred cell in the table above is filled.
- `gh secret list -R cyberneticlabs/zekoder-studio` shows `EXPO_TOKEN`.
- After 013 lands the values, `npx eas project:info` in `packages/app` shows the Zekoder owner and project.
