---
id: 005-distinct-desktop-updater-cache-dir
type: followup
title: Use a Zekoder-specific electron-updater cache dir
status: planned
createdAt: 2026-10-11
openedAt: 2026-10-11T20:22:24.583Z
updatedAt: 2026-10-11T20:22:54.605Z
origin: zekoder-debt-agent
filedFromTask: null
branch: followup-005-distinct-desktop-updater-cache-dir
promoted: false
packages: []
relatedFeatures:
  - 003-desktop-gcs-release-pipeline
relatedBugs: []
relatedFollowups: []
resolvedBy: null
statusHistory: []
---
# Followup 005-distinct-desktop-updater-cache-dir: Use a Zekoder-specific electron-updater cache dir

## Summary

The packaged Zekoder app-update.yml carries `updaterCacheDirName: '@getpaseodesktop-updater'`, identical to upstream Paseo, so both installs can share one electron-updater download cache.

## Why it's out of scope now

Observed during review of feature 003-desktop-gcs-release-pipeline (merged b72611bd8) and not filed then. It is separate from the release-pipeline work, small, and touches only desktop build config.

## Proposed approach

electron-builder derives `updaterCacheDirName` in `appInfo.updaterCacheDirName` (`node_modules/app-builder-lib/out/appInfo.js`) as `sanitizedName.toLowerCase() + "-updater"`, where `name` is the `name` in `packages/desktop/package.json` (`@getpaseo/desktop`), not `productName`. `packages/desktop/electron-builder.yml` has no key to set it directly. So the fix is to make the packaged app metadata name Zekoder-specific, e.g. via `extraMetadata.name` in `packages/desktop/electron-builder.yml` (for example `zekoder-desktop`, giving `zekoder-desktop-updater`). Alternative: rename the package, which is far more invasive (workspace imports, `@getpaseo/*` filters).

Risks to check during implementation (approximate, confirm during planning): `extraMetadata.name` also changes the name Electron reads from the packaged package.json, which can move `app.getName()` / userData path defaults. Confirm userData is already pinned by productName or an explicit path in `packages/desktop/src/main.ts` (approximate), and that this does not strand existing Zekoder installs' data or break the update from the previous cache dir (a stale old cache dir is harmless).

## Tasks

- [ ] Verify how the packaged name is consumed: `packages/desktop/src/main.ts`, `packages/desktop/src/features/auto-updater.ts`, `packages/desktop/src/features/catalog-app-update-runtime.ts` (userData and cache path assumptions).
- [ ] Set a Zekoder-specific packaged name (e.g. `extraMetadata.name`) in `packages/desktop/electron-builder.yml` so the generated `updaterCacheDirName` is not `@getpaseodesktop-updater`.
- [ ] Add a test in `packages/desktop/src/daemon/desktop-packaging.test.ts` that reads `electron-builder.yml` and asserts the configured name yields a cache dir name that differs from upstream's `@getpaseodesktop-updater` and is Zekoder-branded.
- [ ] Check `.github/workflows/desktop-packages.yml` does not override the name via `-c.extraMetadata`.

## Verification

- `npx vitest run packages/desktop/src/daemon/desktop-packaging.test.ts --bail=1` passes.
- A local unpacked build (`electron-builder --dir`) produces `resources/app-update.yml` whose `updaterCacheDirName` is not `@getpaseodesktop-updater`.
- `npm run typecheck` and `npm run lint` pass.
- Confirm Zekoder userData location is unchanged after the rename.
