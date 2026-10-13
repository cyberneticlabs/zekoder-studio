# Desktop code signing

Verified against electron-builder 26.8.1 and electron-updater 6.8.3. Process owner: docs/release.md.

## Policy wiring

- .github/workflows/desktop-release.yml `Declare signing policy...` step writes `SIGNING_POLICY` to GITHUB_ENV. darwin (feature 007): all five APPLE_* secrets -> notarized; none -> unsigned plus `BUILDER_SIGNING_FLAGS=-c.mac.notarize=false -c.mac.hardenedRuntime=false`; some -> fail naming the missing ones. win32: signed|unsigned. Else none.
- The build step appends `${BUILDER_SIGNING_FLAGS:-}` unquoted (empty for every policy but macOS unsigned). The macOS codesign/stapler/spctl verify step runs only when `SIGNING_POLICY == 'notarized'`.
- scripts/desktop-release/release-ci.mjs — `--signing` is a free string written to provenance.json; nothing validates or reads it downstream (prepare-release.mjs, release-data.mjs ignore it).
- packages/desktop/electron-builder.yml — `mac.notarize: true`, `hardenedRuntime: true`, entitlements; `-c.mac.*` CLI strings are coerced to booleans by builder's config validation.
- scripts/ci-workflow.test.mjs — string-asserts the workflow shape, including the darwin-scoped unsigned policy (registered in ci.yml "Validate CI contracts").

## electron-builder behavior with no Apple identity (app-builder-lib macPackager.js)

- Empty `CSC_LINK` is accepted. No keychain identity + `identity` not null: arm64 (and universal) falls back to an ad-hoc signature; x64 ships unsigned with a warning.
- `-c.mac.identity=null` skips signing entirely, including arm64: never use it for an unsigned release.
- Notarization runs only with APPLE_ID + APPLE_APP_SPECIFIC_PASSWORD + APPLE_TEAM_ID (or API key / keychain profile vars); with none set it skips silently. `notarize: false` skips explicitly.
- Ad-hoc signatures have no Team ID, so hardened-runtime library validation can reject bundled frameworks; the unsigned leg turns hardened runtime off. Unverified on hardware until a real unsigned tag run.

## Updater on unsigned macOS

- Catalog check is signature-agnostic: unsigned builds are offered updates.
- electron-updater MacUpdater feeds the zip to Squirrel.Mac (`nativeUpdater.checkForUpdates`), which validates signatures and errors for unsigned or ad-hoc apps.
- packages/desktop/src/features/app-update-service.ts catches it: install returns `Update failed: <msg>` and logs via reportInstallError. No app-side signing awareness yet (followup 007-unsigned-macos-update-offer).
