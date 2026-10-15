---
id: 008-plugin-source-consolidation
type: feature
title: Consolidate Zekoder plugin source and independent releases into Studio
status: merged
createdAt: 2026-10-15
openedAt: 2026-10-15T00:01:47.631Z
updatedAt: 2026-10-15T15:35:04.399Z
completedAt: 2026-10-15T15:35:04.399Z
promoted: true
dependsOn: []
packages:
  - id: "01"
    name: in-repo-source
    file: packages/01-in-repo-source.md
    branch: 008-plugin-source-consolidation-01-in-repo-source
    dependsOn: []
    status: merged
    commit: 09a00c46041c263b60fa30ceff07f29db6fe0152
    mergeMode: local
    filesTouched:
      - .gitattributes
      - .github/workflows/ci.yml
      - .oxfmtrc.json
      - .zekoder/features/008-plugin-source-consolidation/packages/01-in-repo-source.md
      - .zekoder/followups/008-lint-zekoder-plugin-source.md
      - docs/plugins.md
      - docs/release.md
      - knip.json
      - packages/app/src/zekoder/host-provisioning.test.ts
      - packages/app/src/zekoder/host-provisioning.ts
      - packages/server/src/server/plugins/builtin/updates/tree-checksum.test.ts
      - packages/server/src/server/plugins/builtin/updates/tree-checksum.ts
      - packages/server/src/server/plugins/builtin/updates/wiring.ts
      - packages/server/src/server/plugins/index.posix.test.ts
      - plan.md
      - plugins/zekoder.lock.json
      - plugins/zekoder/README.md
      - plugins/zekoder/client/agent-branch-pills.ts
      - plugins/zekoder/client/agent-defaults.tsx
      - plugins/zekoder/client/coding-health-tab.tsx
      - plugins/zekoder/client/config-panel.tsx
      - plugins/zekoder/client/date-picker.tsx
      - plugins/zekoder/client/doc-viewer.tsx
      - plugins/zekoder/client/dropdown.tsx
      - plugins/zekoder/client/git-panel.tsx
      - plugins/zekoder/client/git-tab.ts
      - plugins/zekoder/client/health-aggregate.ts
      - plugins/zekoder/client/health-charts.tsx
      - plugins/zekoder/client/issue-detail.tsx
      - plugins/zekoder/client/issues-tab.tsx
      - plugins/zekoder/client/machine-defaults-panel.tsx
      - plugins/zekoder/client/panel-location.ts
      - plugins/zekoder/client/provider-onboarding.tsx
      - plugins/zekoder/client/report-settings-panel.tsx
      - plugins/zekoder/client/start-agent-button.tsx
      - plugins/zekoder/client/tab-bar.tsx
      - plugins/zekoder/client/telemetry-panel.tsx
      - plugins/zekoder/client/version-panel.tsx
      - plugins/zekoder/client/zekoder-surface.tsx
      - plugins/zekoder/index.server.ts
      - plugins/zekoder/package.json
      - plugins/zekoder/server/config.ts
      - plugins/zekoder/server/git.ts
      - plugins/zekoder/server/org-health-cli.ts
      - plugins/zekoder/server/report-server.ts
      - plugins/zekoder/server/reports.ts
      - plugins/zekoder/server/role-variants.ts
      - plugins/zekoder/server/telemetry.ts
      - plugins/zekoder/server/unzip.ts
      - plugins/zekoder/server/version.ts
      - plugins/zekoder/server/zekoder.ts
      - plugins/zekoder/shared/config.ts
      - plugins/zekoder/shared/issues.ts
      - plugins/zekoder/shared/plugin-version.ts
      - plugins/zekoder/shared/reports.ts
      - plugins/zekoder/shared/version.ts
      - scripts/builtin-plugins-dist.test.mjs
      - scripts/desktop-release/prepare-release.mjs
      - scripts/desktop-release/release-ci.mjs
      - scripts/desktop-release/release-data.mjs
      - scripts/desktop-release/release-data.test.mjs
      - scripts/desktop-release/test-fixtures.mjs
      - scripts/sync-zekoder-plugin.mjs
      - scripts/sync-zekoder-plugin.test.mjs
      - scripts/zekoder-plugin-tree.mjs
      - scripts/zekoder-plugin-tree.test.mjs
    verifiedBaseSha: 6058a01ee57cae0aeccf1c91b3d0997aa94cc6e0
  - id: "02"
    name: plugin-release
    file: packages/02-plugin-release.md
    branch: 008-plugin-source-consolidation-02-plugin-release
    dependsOn:
      - "01"
    status: merged
    filesTouched:
      - .github/workflows/ci.yml
      - .github/workflows/plugin-release.yml
      - .zekoder/features/008-plugin-source-consolidation/packages/02-plugin-release.md
      - CLAUDE.md
      - docs/plugins.md
      - docs/release.md
      - packages/server/src/server/plugins/builtin/updates/trusted-keys.ts
      - scripts/ci-workflow.test.mjs
      - scripts/plugin-release-keys.json
      - scripts/plugin-release.mjs
      - scripts/plugin-release.test.mjs
    verifiedBaseSha: 09a00c46041c263b60fa30ceff07f29db6fe0152
    commit: 17f2f772541b4f336ede3f7cc2f32df53d7655a3
    mergeMode: local
  - id: "03"
    name: registry-import
    file: packages/03-registry-import.md
    branch: 008-plugin-source-consolidation-03-registry-import
    dependsOn:
      - "01"
    status: merged
    filesTouched:
      - .zekoder/bugs/011-git-panel-not-showing-on-ipad.md
      - .zekoder/bugs/012-machine-settings-need-project.md
      - .zekoder/decisions/002-three-tier-agent-defaults.md
      - .zekoder/features/005-dev-zekoder-plugin-path-override.md
      - .zekoder/features/008-plugin-source-consolidation/packages/03-registry-import.md
      - .zekoder/features/009-paseo-copy-implement-and-promote-idea-buttons.md
      - .zekoder/features/010-launch-button-defaults/Overview.md
      - .zekoder/features/010-launch-button-defaults/checklist.md
      - .zekoder/features/010-launch-button-defaults/contracts.md
      - .zekoder/features/010-launch-button-defaults/external-dependencies.md
      - .zekoder/features/010-launch-button-defaults/get-started.md
      - .zekoder/features/010-launch-button-defaults/packages/01-tiered-config-repo-panel.md
      - .zekoder/features/010-launch-button-defaults/packages/02-tiered-launch.md
      - .zekoder/features/010-launch-button-defaults/packages/03-machine-defaults-tab.md
      - .zekoder/features/011-versionless-role-model-defaults/Overview.md
      - .zekoder/features/011-versionless-role-model-defaults/checklist.md
      - .zekoder/features/011-versionless-role-model-defaults/contracts.md
      - .zekoder/features/011-versionless-role-model-defaults/external-dependencies.md
      - .zekoder/features/011-versionless-role-model-defaults/get-started.md
      - .zekoder/features/011-versionless-role-model-defaults/packages/01-role-family-defaults.md
      - .zekoder/features/012-omp-provider-settings.md
      - .zekoder/features/013-plugin-auto-update-publishing/Overview.md
      - .zekoder/features/013-plugin-auto-update-publishing/checklist.md
      - .zekoder/features/013-plugin-auto-update-publishing/contracts.md
      - .zekoder/features/013-plugin-auto-update-publishing/external-dependencies.md
      - .zekoder/features/013-plugin-auto-update-publishing/get-started.md
      - .zekoder/features/013-plugin-auto-update-publishing/packages/01-release-pipeline.md
      - .zekoder/features/013-plugin-auto-update-publishing/packages/02-version-tab.md
      - .zekoder/features/014-remote-file-explorer/Overview.md
      - .zekoder/features/014-remote-file-explorer/checklist.md
      - .zekoder/features/014-remote-file-explorer/contracts.md
      - .zekoder/features/014-remote-file-explorer/external-dependencies.md
      - .zekoder/features/014-remote-file-explorer/get-started.md
      - .zekoder/features/014-remote-file-explorer/packages/01-boundary.md
      - .zekoder/features/014-remote-file-explorer/packages/02-transfers.md
      - .zekoder/features/014-remote-file-explorer/packages/03-explorer.md
      - .zekoder/followups/002-plugin-signing-key-rotation.md
      - .zekoder/followups/009-replace-unzip-with-node-extraction.md
      - .zekoder/followups/010-publish-paseo-zekoder-to-npm.md
      - .zekoder/ideas/001-branded-zekoder-app-after-synkvault.md
      - .zekoder/vendor-issues/001-zekoder-installer-not-windows-compatible.md
    verifiedBaseSha: 17f2f772541b4f336ede3f7cc2f32df53d7655a3
    commit: 65be10d446223535c066a187d820a81fa07f173b
    mergeMode: local
  - id: "04"
    name: kb-docs
    file: packages/04-kb-docs.md
    branch: 008-plugin-source-consolidation-04-kb-docs
    dependsOn:
      - "02"
      - "03"
    status: merged
    commit: 1591707283419b7a97380ab62114acaea6a9b695
    mergeMode: local
    filesTouched:
      - .zekoder/features/008-plugin-source-consolidation/packages/04-kb-docs.md
      - .zekoder/kb/discovery/plugins.md
      - .zekoder/kb/discovery/zekoder-plugin.md
      - .zekoder/kb/goals.md
      - .zekoder/kb/guardrails.md
      - .zekoder/this.md
      - CLAUDE.md
      - docs/plugins.md
      - docs/release.md
      - docs/zekoder-plugin.md
      - plan.md
    verifiedBaseSha: 9f2afec4f0459a8d377eb3353106830db914b61d
contracts:
  - id: zekoder-plugin-version-source
    type: internal
    kind: store
    owner: "01"
    consumers:
      - "02"
  - id: zekoder-plugin-tree-module
    type: internal
    kind: composable
    owner: "01"
    consumers:
      - "02"
  - id: plugin-release-channel
    type: cross-system
    counterpart: GCS gs://zekoder-releases/plugins/zekoder + GitHub plugin-release environment
    externalDependency: 1
    owner: "02"
    consumers: []
mergeMode: local
relatedFeatures:
  - 001-builtin-zekoder-plugin
  - 003-desktop-gcs-release-pipeline
  - 004-plugin-auto-update
  - 005-dev-zekoder-plugin-path-override
  - 006-host-zekoder-provisioning
relatedBugs: []
relatedFollowups:
  - 002-plugin-signing-key-rotation
statusHistory:
  - from: planned
    to: in-progress
    at: 2026-10-15T15:00:55.940Z
  - from: in-progress
    to: merged
    at: 2026-10-15T15:35:04.399Z
---
# Consolidate Zekoder plugin source and independent releases into Studio — Overview

## User's request (verbatim)

"Move plugin source here. Replace the vendored copy.
Keep plugin updates independent—no desktop rebuild needed.
Merge zekoder issues, ADRs and KB into this repo
Retire the two old repos after replacement releases work."

Clarified: only `cyberneticlabs/zekoder-plugins` comes here and only it is retired. zekoder-mcp and zekoder-skills merge into zekoder-skills separately (out of scope).

## Refined scope

- Snapshot zekoder-plugins `paseo/` at tag `v0.12.0-beta.1` (latest tag; its `main` HEAD `44975ad`) into `plugins/zekoder/`. No history import. Delete `scripts/sync-zekoder-plugin.mjs`, its test and `plugins/zekoder.lock.json`.
- `plugins/zekoder/package.json` (name, version, private, `type: "module"`, `files` only) becomes the one version source, and `computeAllowlistChecksum` (hash of the staged `files` allowlist) the one plugin checksum. They feed the daemon's bundled version (feature 004 `wiring.ts`), the desktop release's plugin provenance, and the plugin release tag check.
- Move `plugin-release.yml` + `scripts/plugin-release.mjs` + keyring here. Tag namespace `zekoder-plugin-vX.Y.Z` / `zekoder-plugin-vX.Y.Z-beta.N`; never matches desktop `v*`. Same GCS manifest, key `zk-plugin-2026-10`, tree checksum, trust model.
- Import zekoder-plugins `.zekoder/` items by renumber + map (provenance note, rewritten relations); merge its KB into this repo's KB; integrate its `docs/` into `docs/`.
- Retirement of zekoder-plugins: human-gated, after a plugin release from here auto-updates an installed desktop and a desktop release built from in-repo source works (external-dependencies.md).

## Out of scope

zekoder-mcp / zekoder-skills; changes to feature 004's update protocol or trust model; npm publishing of `@cyberneticlabs/paseo-zekoder` (followup filed by package 03); key rotation (followup 002); running any release, tag, or workflow dispatch (humans/agents with explicit go-ahead only, per docs/release.md).

## Packages

| # | Package | Branch | Depends on | Summary |
|---|---------|--------|------------|---------|
| 01 | in-repo-source | `008-plugin-source-consolidation-01-in-repo-source` | — | Copy source in, drop sync/lock, repoint every lock consumer (daemon, desktop release provenance, tests, docs/plugins.md), lift lint/format/knip ignores |
| 02 | plugin-release | `008-plugin-source-consolidation-02-plugin-release` | 01 | Port release script, keyring and workflow with the new tag namespace; CI tests; release runbook in docs/release.md |
| 03 | registry-import | `008-plugin-source-consolidation-03-registry-import` | 01 | Import `.zekoder/` items by renumber + map, merge the rotation followups, cancel feature 005, file the npm-publish followup |
| 04 | kb-docs | `008-plugin-source-consolidation-04-kb-docs` | 02, 03 | Merge the KB, reword goals/guardrails pin wording, `docs/zekoder-plugin.md`, repoint feature-023 citations, plan.md |

Dependency graph: `01 → 02`, `01 → 03`, `02 + 03 → 04`. 02 reads 01's version source and tree module; 03 waits for 01 only because both may allocate followup ids; 04 records the final state and needs 03's real ids.

## Related bugs & followups

- followup 002-plugin-signing-key-rotation — **separate**. Needs dual-signing in the release script and its own overlap tests. Package 03 merges zekoder-plugins followup 001 (the CI half of the same rotation) into it instead of importing a duplicate.
- followup 005-distinct-desktop-updater-cache-dir — no overlap.
- feature 005-dev-zekoder-plugin-path-override (planned) — **cancelled by this plan** (user decision): its motivation was editing an external `zekoder-plugins/paseo` checkout. Package 03 cancels it with a pointer to 008.

## Decisions consulted

- decision 001-nix-packaging-upstream-only — accepted, context-only; unrelated.
- No recorded decision covers plugin delivery. Recommend `/zekoder-decision` to record "plugin source lives in Studio; plugin releases use the `zekoder-plugin-v*` tag namespace".

## Open assumptions

- Baseline `v0.12.0-beta.1` (user-accepted): `v0.11.1` predates the release tooling. A stable desktop bundles this beta baseline until the first `zekoder-plugin-v0.12.0` release, which is Gate A (external dependency 2).
- `host-provisioning.ts` keeps its npm pin `0.11.1` (user decision); package 03 files a followup to publish the npm package from the in-repo release workflow.
- The release job does not typecheck: the tag must point at a `main` commit, and CI typechecks every `main` push.
- Plugin workflow vars live as `plugin-release` **environment** vars, because repo vars `GCP_SERVICE_ACCOUNT` / `GCP_WORKLOAD_IDENTITY_PROVIDER` already belong to the desktop release.
- Imported merged items keep `merged` status; if the server refuses a direct terminal status on a new item, package 03 stops and reports.
