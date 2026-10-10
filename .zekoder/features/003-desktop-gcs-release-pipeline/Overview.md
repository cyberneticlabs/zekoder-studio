---
id: 003-desktop-gcs-release-pipeline
type: feature
title: Tag-triggered Zekoder desktop releases through GCS
status: merged
createdAt: 2026-10-06
openedAt: 2026-10-06T13:20:54.855Z
updatedAt: 2026-10-10T16:37:42.242Z
completedAt: 2026-10-10T16:37:42.242Z
promoted: true
dependsOn: []
packages:
  - id: "01"
    name: release-data
    file: packages/01-release-data.md
    branch: 003-desktop-gcs-release-pipeline-01-release-data
    dependsOn: []
    status: merged
    commit: 8636a2ff2d72b0b2cd2a2034cd7ef4b64ba3e682
    mergeMode: local
    filesTouched:
      - .github/workflows/ci.yml
      - .zekoder/features/003-desktop-gcs-release-pipeline/packages/01-release-data.md
      - scripts/desktop-release/prepare-release.mjs
      - scripts/desktop-release/publish-release.mjs
      - scripts/desktop-release/release-data.mjs
      - scripts/desktop-release/release-data.test.mjs
      - scripts/desktop-release/test-fixtures.mjs
      - scripts/github-release.mjs
      - scripts/release-version-utils.test.mjs
      - scripts/sync-release-notes-from-changelog.test.mjs
      - scripts/validate-desktop-manifests.mjs
      - scripts/validate-desktop-manifests.test.mjs
    verifiedBaseSha: 87892862d6043e6f6baae0b68d14a253d6d566e0
  - id: "02"
    name: release-pipeline
    file: packages/02-release-pipeline.md
    branch: 003-desktop-gcs-release-pipeline-02-release-pipeline
    dependsOn:
      - "01"
    status: merged
    commit: aa7cdbe3c89d2dc4fa3f0a427cacd2c4eb7992ea
    mergeMode: local
    filesTouched:
      - .github/workflows/android-apk-release.yml
      - .github/workflows/ci.yml
      - .github/workflows/deploy-app.yml
      - .github/workflows/desktop-release.yml
      - .github/workflows/desktop-rollout.yml
      - .github/workflows/docker.yml
      - .github/workflows/release-notes-sync.yml
      - .zekoder/features/003-desktop-gcs-release-pipeline/packages/02-release-pipeline.md
      - .zekoder/followups/003-guard-deploy-website-release-event.md
      - CLAUDE.md
      - docs/release.md
      - packages/desktop/electron-builder.yml
      - scripts/ci-workflow.test.mjs
      - scripts/desktop-release/prepare-release.mjs
      - scripts/desktop-release/release-ci.mjs
      - scripts/desktop-release/release-ci.test.mjs
    verifiedBaseSha: 8636a2ff2d72b0b2cd2a2034cd7ef4b64ba3e682
  - id: "03"
    name: desktop-updates
    file: packages/03-desktop-updates.md
    branch: 003-desktop-gcs-release-pipeline-03-desktop-updates
    dependsOn:
      - "01"
    status: merged
    commit: 82f4188add408fa911201b3bc989fa6c4d8c1314
    mergeMode: local
    filesTouched:
      - .zekoder/features/003-desktop-gcs-release-pipeline/packages/03-desktop-updates.md
      - packages/desktop/src/features/__fixtures__/desktop-release-catalog.wire.json
      - packages/desktop/src/features/app-update-service.test.ts
      - packages/desktop/src/features/auto-updater.test.ts
      - packages/desktop/src/features/auto-updater.ts
      - packages/desktop/src/features/catalog-app-update-runtime.ts
      - packages/desktop/src/features/desktop-release-catalog.ts
      - packages/desktop/src/features/test-utils/branded-update-harness.ts
      - packages/desktop/src/features/test-utils/fake-electron-updater.ts
      - scripts/desktop-release/release-data.test.mjs
    verifiedBaseSha: 1a4dee7fd8c16410dc7345c8f6b969fe7c7c0c0a
contracts:
  - id: desktop-release-catalog
    type: internal
    kind: store
    owner: "01"
    consumers:
      - "02"
      - "03"
  - id: gcs-desktop-distribution
    type: cross-system
    counterpart: GCP project zekoder-484012 / bucket zekoder-releases
    externalDependency: 1
    owner: "01"
    consumers:
      - "02"
mergeMode: local
relatedFeatures: []
relatedBugs: []
relatedFollowups:
  - 001-restore-auto-updater-service-tests
statusHistory:
  - from: planned
    to: in-progress
    at: 2026-10-10T16:03:15.755Z
  - from: in-progress
    to: merged
    at: 2026-10-10T16:37:42.242Z
---

# Tag-triggered Zekoder desktop releases

## User's request (verbatim)

setup a pipeline to build and publish the desktop apps to gcp storage buckets, ask project: zekdoer-skills on the best track to publish there as it is already doing and which paths to use, the target is to build the apps tagged witht he version already in the tage itself so v0.1.0 translates to Zekoder 0.1.0. This will be used as the release channel so we will need a sort of manifest file to maintain.

only tags should trigger the release sequence

/zekoder-plan

## Refined scope

Desktop installers, GCS distribution and automatic updates for existing macOS arm64/x64, Windows x64/arm64 and Linux x64. Canonical vX.Y.Z releases stable; vX.Y.Z-beta.N releases beta. Tag is authoritative: v0.1.0 packages Zekoder 0.1.0, independently of upstream workspace version.
Publish immutable target snapshots under gs://zekoder-releases/desktop/releases/TAG/ and atomically update desktop/releases/manifest.json last. Beta users receive final stable when newer; stable never receives beta.
Additional user requirement: manifest links immutable Markdown release notes derived from GitHub Release; notes always describe new features, feature updates and broad bug categories (security/performance), never technical commit dumps. Persistent agent-only tagging instructions own the approved preparation/tag process.
Only version-tag push starts distribution. GitHub draft notes are prepared before the tag; GitHub Release events do not trigger builds. Failed tag jobs rerun the same exact source.
Consulted zekoder-skills: accepted ADR 009 confirms public EU bucket/project zekoder-484012; its releases/ namespace and manifest remain untouched. Existing WIF only trusts skills, so desktop needs its own identity.

## Out of scope

Mobile/web/npm/relay releases, new architectures, new update UI, login/daemon/protocol changes, cloud provisioning during planning, automatic downgrade, Windows signing service project.

## Packages

| ID  | Name                               | File                            | Branch                                               | Depends on |
| --- | ---------------------------------- | ------------------------------- | ---------------------------------------------------- | ---------- |
| 01  | Release data/publication tools     | packages/01-release-data.md     | 003-desktop-gcs-release-pipeline-01-release-data     | —          |
| 02  | CI/build and agent tagging process | packages/02-release-pipeline.md | 003-desktop-gcs-release-pipeline-02-release-pipeline | 01         |
| 03  | Desktop automatic updates          | packages/03-desktop-updates.md  | 003-desktop-gcs-release-pipeline-03-desktop-updates  | 01         |

## Dependency graph

01 → 02 and 03. The latter run independently; end-to-end verification needs both.

## Related bugs & followups

- 001-restore-auto-updater-service-tests: approved fold-in; restore existing runtime cases in 03 as branded updates enable. resolvedBy points to this feature; supervisor co-resolves the followup.
- Merged 002-zekoder-rebrand provides branded identifiers and updater disable gate; merged 001-builtin-zekoder-plugin provides exact plugin lock provenance. Context only, no open dependency.

## Decisions consulted

No relevant local ADR. Cross-project accepted 009-gcs-release-pipeline-as-built is followed for bucket, OIDC, artifact-first/manifest-last publication and namespace separation; its dev channel is not reused.

## Open assumptions

- User approved manifest-selected immutable generic feeds; retain existing service/rollout/install behavior through the narrow runtime integration.
- Current Windows unsigned policy is preserved unless owned credentials are supplied; macOS requires owned signing/notarization. No upstream certificate assumption.
- Retain existing stable rollout duration (36 hours), instant beta and manual-check bypass by reusing stamp/admission helpers; manual rollout mutation is retired for fork immutable snapshots.
- Exact upstream source comes from latest conventional upstream-sync merge's second parent (currently a7f7405c04acda76f0d2c4cfd0290621753dd4bc); fail clearly if convention is absent.
- Beta pointer includes newer final stable; no release bytes/tags overwritten and no automatic downgrade. GitHub draft finalization follows catalog publication and is retryable.
