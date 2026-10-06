<!-- discovery-stamp: sha=1b6694c1f4fe6164bb0a7b1c3791c265a6f54aad globs=["packages/desktop/**","scripts/*release*","scripts/*manifest*","scripts/*rollout*",".github/workflows/**","plugins/zekoder.lock.json","docs/release.md","plan.md"] updatedAt=2026-10-06T13:29:57Z -->

# Desktop releases

- .github/workflows/desktop-release.yml — current macOS arm64/x64, Linux x64, Windows x64/arm64; manual dispatch/alternate tags; GitHub publication. Finalizer must not publish partial matrix.
- packages/desktop/electron-builder.yml — Zekoder IDs/artifacts but upstream GitHub publisher. mac DMG+ZIP, Windows NSIS+ZIP, Linux AppImage+deb+rpm+tar.gz.
- AppImage basename Zekoder-x64.AppImage must remain stable for in-place updater and CLI links; immutable version directory can encode version.
- mac workflow has signing/notarization inputs; Windows has no signing configuration.
- scripts/release-version-utils.mjs — broad upstream tag parser; strict desktop validation belongs at desktop entry point.
- scripts/merge-mac-manifest.mjs, stamp-rollout.mjs, validate-desktop-manifests.mjs — reuse metadata generation, rollout stamp, Darwin floor validation.
- scripts/github-release.mjs — full GitHub release body lookup; Paseo title fallback must be audited for branded draft notes.
- scripts/\*test.mjs use node:test; .github/workflows/ci.yml contract job is existing home for new script tests.
- packages/desktop/src/features/auto-updater.ts — branded update gate false; existing runtime wraps electron-updater.
- GenericProvider requires YAML (latest/beta, -mac/-linux suffix), not JSON pointer. setFeedURL can select immutable platform/arch snapshot before check; beta requires explicit stable promotion behavior.
- app-update-service.ts — serialized checks, injected runtime, rollout, download and install revalidation; releaseNotes must be string for UI body.
- app-update-rollout.ts — preserve stable rollout, beta instant, manual intent bypass.
- Existing auto-updater.test.ts/app-update-service.test.ts/app-update-rollout.test.ts plus e2e/updates.spec.ts own focused update coverage.
- .github/workflows/release-notes-sync.yml — unguarded inherited tag/main/manual GitHub notes mutations.
- deploy-app.yml and android-apk-release.yml — unguarded inherited fork-tag Cloudflare/mobile publishing; desktop-rollout.yml manually edits GitHub updater metadata.
- docker.yml — tag publication enabled in fork unless explicitly guarded; preserve ordinary CI builds.
- plugins/zekoder.lock.json — exact plugin ref/commit/version/checksum source; current upstream sync commit 76761c78b second parent a7f7405c04acda76f0d2c4cfd0290621753dd4bc.
- Cross-project consultation: skills ADR009 records public gs://zekoder-releases, project zekoder-484012, skills-only WIF trust. Desktop prefix recommended desktop/releases/; existing skills releases/ is separate.
- docs/release.md owns agent preparation/go-ahead, channel semantics and publishing/recovery facts; agent-only desktop tagging procedure must integrate there rather than invoke upstream npm publishing scripts.
