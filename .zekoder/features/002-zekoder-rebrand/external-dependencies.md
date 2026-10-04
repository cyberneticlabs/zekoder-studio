# External dependencies — 002-zekoder-rebrand

None block any package.

Non-blocking follow-ups for the owners, outside this feature:
1. **zekoder.net paths** (type: website content; owner: Cybernetic Labs marketing). `brandUrl()` keeps the
   upstream paths: `/changelog`, `/download`, `/docs`, `/docs/{skills,configuration,security,cli,worktrees,schedules,metadata-generation}`,
   `/docs/plugins/reference`. Until those exist on zekoder.net, the in-app links 404. Blocks nothing in the repo.
2. **Release identity** (type: store/CI config; owner: release maintainers; separate audit): new App Store
   Connect app and `ascAppId`, Play listing, EAS project/owner, fastlane `app_identifier`, signing, electron-builder
   `publish` and the desktop update feed. Until then the branded build is local/dev installable only, and
   desktop auto-update stays disabled (03 task 6b).
3. **Firebase apps** (type: service config; owner: release maintainers). Existing `google-services.*.json` and
   `GoogleService-Info.*.plist` (`packages/app/.secrets/` or `GOOGLE_SERVICES_FILE_*` env) are registered for
   `sh.paseo` / `sh.paseo.debug`; an Android build with `net.zekoder.app` fails on package mismatch while they are
   present. Push notifications need new Firebase apps for `net.zekoder.app` and `net.zekoder.app.debug`. Until
   then developers delete the stale `.secrets` files (03 documents this in docs/android.md) and build without push.
   Blocks no package.
