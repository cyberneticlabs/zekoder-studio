<!-- discovery-stamp: sha=b4f55795dade6da13a4ce90a994a76d37f60e716 globs=[".github/workflows/desktop-release.yml","packages/desktop/electron-builder.yml","packages/desktop/scripts/after-sign.js","packages/desktop/src/features/app-update-service.ts","packages/desktop/src/features/auto-updater.ts","scripts/desktop-release/release-ci.mjs","scripts/ci-workflow.test.mjs"] updatedAt=2026-10-13T10:52:33Z -->
# Desktop code signing

Verified against electron-builder 26.8.1 and electron-updater 6.8.3. Process owner: docs/release.md.

## Policy wiring

- .github/workflows/desktop-release.yml `Declare signing policy...` step writes `SIGNING_POLICY` to GITHUB_ENV (darwin: notarized, win32: signed|unsigned, else none). The build job later reads it (Windows verify step) and passes it to `release-ci.mjs provenance --signing`.
- scripts/desktop-release/release-ci.mjs — `--signing` is a free string written to provenance.json; nothing validates or reads it downstream (prepare-release.mjs, release-data.mjs ignore it). Existing test already uses `unsigned`.
- packages/desktop/electron-builder.yml — `mac.notarize: true`, `hardenedRuntime: true`, entitlements; `-c.mac.*` CLI strings are coerced to booleans by builder's config validation.
- scripts/ci-workflow.test.mjs — string-asserts the workflow shape (registered in ci.yml "Validate CI contracts").

## electron-builder behavior with no Apple identity (app-builder-lib macPackager.js)

- Empty `CSC_LINK` is accepted. No keychain identity + `identity` not null: arm64 (and universal) falls back to an ad-hoc signature; x64 ships unsigned with a warning.
- `-c.mac.identity=null` skips signing entirely, including arm64: never use it for an unsigned release.
- Notarization runs only with APPLE_ID + APPLE_APP_SPECIFIC_PASSWORD + APPLE_TEAM_ID (or API key / keychain profile vars); with none set it skips silently. `notarize: false` skips explicitly.
- Ad-hoc signatures have no Team ID, so hardened-runtime library validation can reject bundled frameworks; unverified on hardware.

## Updater on unsigned macOS

- Catalog check is signature-agnostic: unsigned builds are offered updates.
- electron-updater MacUpdater feeds the zip to Squirrel.Mac (`nativeUpdater.checkForUpdates`), which validates signatures and errors for unsigned or ad-hoc apps.
- packages/desktop/src/features/app-update-service.ts catches it: install returns `Update failed: <msg>` and logs via reportInstallError. No app-side signing awareness, so the UI advertises an update that cannot install.
