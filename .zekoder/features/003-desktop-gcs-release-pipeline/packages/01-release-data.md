# 01 — Release data and publication tools

Branch: 003-desktop-gcs-release-pipeline-01-release-data
Depends on: none
Worktree: create an isolated implementation worktree from the supervisor staging branch; install with npm ci.

## Context

Read docs/release.md, docs/testing.md and contracts.md. Reuse scripts/release-version-utils.mjs, scripts/github-release.mjs and existing .mjs node:test conventions; keep strict desktop validation separate from permissive upstream tag helpers. New tools remain under scripts/desktop-release/; package 02 owns builder/workflow wiring, package 03 owns Electron runtime.

## Tasks

- [ ] Implement scripts/desktop-release/release-data.mjs with strict stable/beta tag parsing, tag-derived version, catalog validation, matrix completeness, plugin lock/provenance and upstream merge-parent provenance/semantic channel merging per desktop-release-catalog. Extend scripts/release-version-utils.test.mjs for strict desktop cases.
- [ ] Implement scripts/desktop-release/prepare-release.mjs CLI to consume downloaded build outputs and matching GitHub Release body fetched through scripts/github-release.mjs; adapt that helper to locate drafts by exact tag_name with pagination, reject ambiguous matches, remove hardcoded Paseo title/first-100 assumptions and return canonical html_url. Extend existing helper tests for tagged drafts, pagination and ambiguity; validate high-level nonempty notes, source commit, upstream ancestor and plugin lock. Reuse merge-mac-manifest/stamp-rollout/validate-desktop-manifests helpers as applicable, extending exact-version validation. Stamp GitHub body into YAML releaseNotes and emit immutable per-target YAML snapshots, release-notes.md and catalog candidate. Never generate notes from commits or overwrite upstream artifacts.
- [ ] Implement scripts/desktop-release/publish-release.mjs using authenticated GCS generation-precondition API calls (reuse runner credentials/access token, no persistent keys). Check stored object bytes for exact replay, upload absent objects, confirm complete snapshots, then CAS-merge catalog last with bounded conflict retry and clear failure.
- [ ] Add focused cases in scripts/desktop-release/release-data.test.mjs for all matrix rows, tag/channel isolation, beta numeric ordering, old tags, missing notes/targets, immutable mismatch, exact replay, partial upload and CAS conflict preserving unrelated releases/channels. Register new node:test suites in existing .github/workflows/ci.yml contract job (owned by this package). Use local HTTP transport fixture for publisher requests/preconditions; no live cloud writes in unit tests.

## Verification

Run each changed test file alone with node --test FILE (redirect output); npm run typecheck; npm run lint -- scripts/desktop-release scripts/release-version-utils.test.mjs. Full suites run only CI. Feed fixtures must retain correct SHA512/relative references and manifest SHA256+size of stored bytes.

## Progress

- Status: planned
- Completed: none
- Blockers: external dependency 1 for live integration; dependency 3 for valid production inputs.
