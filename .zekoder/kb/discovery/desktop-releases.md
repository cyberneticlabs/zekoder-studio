# Desktop releases

Shipped by feature 003-desktop-gcs-release-pipeline. Process owner: docs/release.md (Zekoder desktop releases section); CLAUDE.md links the agent-only tagging rules.

## Pipeline

- .github/workflows/desktop-release.yml — push tags `v*` only (no dispatch, no desktop-* tags). Jobs: preflight -> release-notes (contents write, reads private draft) -> build (5-row matrix, build+smoke only) -> publish (contents read + id-token write, GCP OIDC) -> finalize (contents write, after catalog lists tag). Per-tag concurrency, never cancelled; CAS on catalog handles cross-tag races.
- scripts/desktop-release/release-ci.mjs — CI subcommands: preflight, verify-tag, set-version, fetch-notes, verify-packaged, provenance, finalize.
- scripts/desktop-release/release-data.mjs — strict stable/beta tag grammar, 5-target matrix, catalog validation, semantic channel merge. Keep separate from permissive scripts/release-version-utils.mjs.
- scripts/desktop-release/prepare-release.mjs — build outputs + GitHub Release body -> immutable per-target YAML snapshots, release-notes.md, catalog candidate. `--published-at` must stay fixed per tag across reruns (CI uses tagger date). `--release-json` for jobs that cannot read drafts.
- scripts/desktop-release/publish-release.mjs — GCS JSON API, ifGenerationMatch=0 for immutable objects, byte-exact replay allowed, catalog CAS-merged last. Token from GCS_ACCESS_TOKEN.
- Layout: gs://zekoder-releases/desktop/releases/TAG/PLATFORM/ARCH/ plus desktop/releases/manifest.json (max-age 60). Skills-owned releases/ untouched.
- packages/desktop/electron-builder.yml — generic provider at the desktop/releases/ root; CI passes --publish never, -c.publish.channel, per-row output dir. AppImage basename Zekoder-x64.AppImage stays stable.
- Upstream publishers guarded to `github.repository == 'getpaseo/paseo'`: deploy-app, android-apk-release, release-notes-sync, docker publish, desktop-rollout. deploy-website release-event trigger still open (followup 003-guard-deploy-website-release-event).
- scripts/github-release.mjs — drafts matched by exact tag_name across pages; duplicates error unless --cleanup-duplicates.
- Tests: scripts/desktop-release/*.test.mjs (node:test), registered in ci.yml "Validate CI contracts" step (that job installs root+protocol deps for js-yaml). scripts/ci-workflow.test.mjs asserts trigger/permissions/guards.

## Runtime

- packages/desktop/src/features/desktop-release-catalog.ts — pure catalog reader: schema, tag/version/channel, URL prefix pinning, OS/arch target selection. 404 = no update.
- catalog-app-update-runtime.ts — sets electron-updater generic feed to the immutable snapshot before every check; never sets `autoUpdater.channel` (its setter flips allowDowngrade). Rejects YAML/catalog version mismatch via isUserWithinRollout.
- auto-updater.ts — createBrandedAppUpdateService wires real updater + HTTP transport; branded updates enabled for packaged apps.
- Tests use injected fakes in src/features/test-utils/ (no module mocks); shared wire fixture src/features/__fixtures__/desktop-release-catalog.wire.json, also validated by release-data.test.mjs.
- app-update-service.ts / app-update-rollout.ts unchanged contracts: serialized checks, 36h stable rollout, instant beta, quit-time revalidation, allowDowngrade=false.

## External dependencies (not provisioned at ship time)

- Dedicated WIF provider + desktop service account (vars ZEKODER_RELEASE_BUCKET, GCP_WORKLOAD_IDENTITY_PROVIDER, GCP_SERVICE_ACCOUNT).
- Apple signing/notarization secrets (macOS preflight fails without them); Windows unsigned unless WINDOWS_CSC_LINK set.
- Matching GitHub draft Release with high-level notes before tagging.
