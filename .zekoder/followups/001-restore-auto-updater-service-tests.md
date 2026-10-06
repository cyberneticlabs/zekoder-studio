---
id: 001-restore-auto-updater-service-tests
type: followup
title: Restore module-level auto-updater tests once branded auto-update is enabled
status: planned
createdAt: 2026-10-06
openedAt: 2026-10-06T11:15:54.289Z
updatedAt: 2026-10-06T13:33:17.654Z
origin: zekoder-coding-agent
filedFromTask: 002-zekoder-rebrand-03-brand-surfaces
branch: followup-001-restore-auto-updater-service-tests
promoted: false
packages: []
relatedFeatures:
  - 002-zekoder-rebrand
relatedBugs: []
relatedFollowups: []
resolvedBy: 003-desktop-gcs-release-pipeline
statusHistory: []
---

## Context

Feature 002-zekoder-rebrand (package 03) gates auto-update off with `BRANDED_AUTO_UPDATE_ENABLED = false` in `packages/desktop/src/features/auto-updater.ts`. The two `checkForAppUpdate` cases in `auto-updater.test.ts` drove the module-level service through a mocked `electron-updater`: an unpublished channel manifest (`ERR_UPDATER_CHANNEL_FILE_NOT_FOUND`) reports no update with no error, and a genuine failure ("network down") surfaces `errorMessage` and logs. With the gate off the service short-circuits, so they were replaced by one test asserting the updater is never contacted.

## Work

When a fork-owned update feed exists and the gate flips to `true` (or becomes configuration), restore those two cases, and add a test that the gate-off path never contacts the updater.

## Why deferred

Needs the update feed decision (release audit). `app-update-service.test.ts` does not cover the channel-manifest-missing error mapping.
