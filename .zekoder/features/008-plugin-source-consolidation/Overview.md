---
id: 008-plugin-source-consolidation
type: feature
title: Consolidate Zekoder plugin source and independent releases into Studio
status: planned
createdAt: 2026-10-15
openedAt: 2026-10-15T00:01:47.631Z
updatedAt: 2026-10-15T08:05:02.821Z
promoted: true
dependsOn: []
packages:
  - id: "01"
    name: in-repo-source
    file: packages/01-in-repo-source.md
    branch: 008-plugin-source-consolidation-01-in-repo-source
    dependsOn: []
    status: planned
  - id: "02"
    name: plugin-release
    file: packages/02-plugin-release.md
    branch: 008-plugin-source-consolidation-02-plugin-release
    dependsOn:
      - "01"
    status: planned
  - id: "03"
    name: registry-import
    file: packages/03-registry-import.md
    branch: 008-plugin-source-consolidation-03-registry-import
    dependsOn:
      - "01"
    status: planned
  - id: "04"
    name: kb-docs
    file: packages/04-kb-docs.md
    branch: 008-plugin-source-consolidation-04-kb-docs
    dependsOn:
      - "02"
      - "03"
    status: planned
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
relatedFeatures:
  - 001-builtin-zekoder-plugin
  - 003-desktop-gcs-release-pipeline
  - 004-plugin-auto-update
  - 005-dev-zekoder-plugin-path-override
  - 006-host-zekoder-provisioning
relatedBugs: []
relatedFollowups:
  - 002-plugin-signing-key-rotation
statusHistory: []
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
