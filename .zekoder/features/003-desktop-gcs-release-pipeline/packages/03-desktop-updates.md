# 03 — Branded stable and beta automatic updates

Branch: 003-desktop-gcs-release-pipeline-03-desktop-updates
Depends on: 01
Worktree: isolated worktree from supervisor staging after 01 merges; npm ci.

## Context

Read docs/release.md, docs/testing.md and contracts.md. Reuse packages/desktop/src/features/auto-updater.ts, app-update-service.ts and app-update-rollout.ts, existing settings.releaseChannel and update UI. Keep daemon lifecycle and renderer bridge contracts unchanged. No new release-channel UI.
Catalog validation can be a small desktop-local module; share the wire fixture with 01 rather than importing scripts outside desktop tsconfig.

## Tasks

- [ ] Extend auto-updater.ts runtime to fetch the fork catalog before every updater check, validate channel+version+host/prefix, select current OS/architecture target and call autoUpdater.setFeedURL({provider:"generic",url:feedUrl,channel:stable?"latest":"beta"}) for the immutable snapshot. No pointer/target means no update; invalid schema/URLs or network failures report error without contacting upstream.
- [ ] Enable branded packaged updates only after the fork catalog resolver is active. Preserve allowDowngrade=false, existing stable/beta setting, rollout admission, check serialization and install-on-quit revalidation. Stable reads only stable pointer; beta follows beta pointer, including final stable promotion without jumping back from a newer beta series. Keep selected feed pinned through automatic download and validate a newly selected candidate before installation using existing service.
- [ ] Reuse YAML releaseNotes string stamped by 01 for RuntimeUpdateInfo.releaseNotes/update body; catalog exposes releaseNotesUrl for download consumers. Electron YAML version and selected catalog version must match before accepting update.
- [ ] [opportunistic — approved fold of followup 001-restore-auto-updater-service-tests] Restore module-level missing-feed and genuine-network-failure cases in auto-updater.test.ts when enabling updates; retain a test that unpackaged apps never contact updater. Add catalog/architecture/channel, wrong-host, mismatch, partial release and upstream-feed exclusion cases to this existing suite through an injected runtime/transport adapter seam; do not add module mocks (docs/testing.md). User approved fold registration; supervisor co-resolves this followup with the feature.
- [ ] Extend existing app-update-service.test.ts only where needed to verify immutable feed pinning across download and recheck, superseded update rejection and no-downgrade/channel transitions; reuse current runtime test harness.

## Verification

Run only changed auto-updater.test.ts and app-update-service.test.ts independently with --bail=1 redirected output; npm run typecheck; npm run lint -- packages/desktop/src/features. Live notarized macOS, Windows (signed when configured) and AppImage update/install/relaunch checks use existing CI/manual QA across every architecture; deb/rpm/tar.gz are distribution artifacts, document system-package installs require package-manager updates if updater unsupported. Verify no upstream URL requests and retained user config/plugins.

## Progress

- Status: planned
- Completed: none
- Blockers: external dependency 2 and first/next channel releases for install evidence; 02 for production end-to-end.
