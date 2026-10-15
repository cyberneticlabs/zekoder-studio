---
id: 013-plugin-auto-update-publishing
type: feature
title: Plugin auto-update publishing (signed GCS releases + Version tab)
status: merged
createdAt: 2026-10-15
openedAt: 2026-10-15T15:15:26.845Z
updatedAt: 2026-10-15T15:22:16.751Z
completedAt: 2026-10-15T15:22:16.751Z
promoted: true
dependsOn: []
packages:
  - id: "01"
    name: release-pipeline
    file: packages/01-release-pipeline.md
    branch: 013-plugin-auto-update-publishing-01-release-pipeline
    dependsOn: []
    status: merged
    mergeMode: local
    filesTouched:
      - .github/workflows/plugin-release.yml
      - CLAUDE.md
      - README.md
      - docs/plugin-release.md
      - plugins/zekoder/package-lock.json
      - plugins/zekoder/package.json
      - plugins/zekoder/shared/plugin-version.ts
      - scripts/plugin-release-keys.json
      - scripts/plugin-release.mjs
  - id: "02"
    name: version-tab
    file: packages/02-version-tab.md
    branch: 013-plugin-auto-update-publishing-02-version-tab
    dependsOn:
      - "01"
    status: merged
    mergeMode: local
    filesTouched:
      - plugins/zekoder/README.md
      - plugins/zekoder/client/version-panel.tsx
      - plugins/zekoder/index.server.ts
      - plugins/zekoder/server/version.ts
      - plugins/zekoder/shared/version.ts
contracts:
  - id: plugin-release-channel
    type: cross-system
    counterpart: cyberneticlabs/zekoder-studio feature 004-plugin-auto-update
    externalDependency: 3
    owner: "01"
    consumers: []
  - id: builtin-plugin-update-status
    type: cross-system
    counterpart: cyberneticlabs/zekoder-studio feature 004-plugin-auto-update (owner + implementer)
    externalDependency: 4
    owner: external
    consumers:
      - "02"
  - id: plugin-version-constant
    type: internal
    kind: store
    owner: "01"
    consumers:
      - "02"
mergeMode: local
relatedFeatures: []
relatedBugs: []
relatedFollowups:
  - 002-plugin-signing-key-rotation
statusHistory:
  - from: planned
    to: merged
    at: 2026-10-15T15:22:16.751Z
---
> Imported from cyberneticlabs/zekoder-plugins feature 023-plugin-auto-update-publishing (feature 008-plugin-source-consolidation).

# Plugin auto-update publishing (signed GCS releases + Version tab) — Overview

## User's request (verbatim)

> Plan a new FEATURE in this repo (the Zekoder plugin source repository, now `plugins/zekoder/` in this repo): the plugin source side of "Zekoder plugin auto-update without rebuilding the Zekoder Studio desktop app".
>
> Context: Zekoder Studio (cyberneticlabs/zekoder-studio) ships `plugins/zekoder/` as a non-removable BUILT-IN, vendored at tag v0.11.1 (commit 380f37b0) via scripts/sync-zekoder-plugin.mjs with lock plugins/zekoder.lock.json {repo, ref, commit, version, checksum}. Any plugin change needs a full app rebuild. Studio plans the daemon side as its feature 004-plugin-auto-update. Studio feature 003 plans GCS desktop releases (gs://zekoder-releases, project zekoder-484012, desktop/releases/manifest.json, channels stable + beta; beta also gets newer stable; stable never gets beta). Skills/MCP releases use releases/manifest.json in the same bucket — that namespace must stay untouched.
>
> Decisions made: update takes effect on the NEXT daemon start (never hot-swapped). Plugin channel matches the app channel. Plugin stays locked; bundled copy is always the fallback. Studio owns overlay loader, signature verification, compat gate, fallback, rollback honoring, locked status, status RPC. THIS REPO owns: (1) build + sign + publish pipeline, immutable artifacts in GCS under their own namespace, triggered by version tags only; (2) signed plugin manifest: per-channel latest, artifact URL, sha256, compatible host range, revoked list; Ed25519; key custody + rotation documented; never commit secrets; (3) compat metadata in the plugin itself; (4) Version tab UI: running plugin version, source (bundled vs downloaded), last check time and errors, read from a Studio daemon status RPC.
> Out of scope: daemon loader/verification code (Studio), desktop app updates (Studio 003), skills/MCP release flow changes.
> Cross-repo: manifest schema, artifact layout, signature format and GCS paths are a shared contract with Studio 004; this repo is the OWNER.

Clarifications: plan tier full. Signing key lives in a CI secret and CI signs automatically on tag (replaces "offline-held key"; encrypted offline backup held by humans). Channels stable + beta with Studio 003 rules. Never touch `releases/manifest.json`. Version tab degrades to bundled/unknown when the host has no status RPC. Package cap 4.

## Refined scope

- Tag `vX.Y.Z` → stable, `vX.Y.Z-beta.N` → beta (Studio 003 regex). Tag must equal `plugins/zekoder/package.json` version and `PLUGIN_VERSION`, on a commit in `main`.
- CI builds a `.tar.gz` of exactly the `plugins/zekoder/package.json` `files` allowlist (same tree Studio vendors), uploads it immutably to `gs://zekoder-releases/plugins/zekoder/releases/vX.Y.Z/`, then rewrites the signed envelope `plugins/zekoder/manifest.json` last (generation-match CAS).
- Signature: raw Ed25519 (Node `crypto`, no new deps) over the exact payload bytes, inside a single-object JSON envelope with `signatures[{keyId}]` (kept over Studio's detached `.sig`: one object = atomic update, no cache skew). One key, signed automatically in CI; no dual-sign (rotation runbook: followup `002-plugin-signing-key-rotation`). Public keyring (raw base64 32-byte keys, Studio's format) in `scripts/plugin-release-keys.json`.
- Manifest `sequence` +1 per write; Studio rejects a lower one (`sequence-replay`). Publish retries on generation-match conflict by re-reading and recomputing; re-runs are idempotent.
- Key guard: GitHub tag ruleset limits `v*` tags to named maintainers. No reviewer gate on signing (accepted risk).
- Revocation: manual `workflow_dispatch` re-signs the manifest with a version added to `revoked`.
- Compat: `plugins/zekoder/paseo-plugin.json` `requirements.paseo` is copied into each release entry as `requires.paseo` (Studio's name) and compared against the Paseo **daemon** version.
- Status API: Studio 004 owns it (contract `builtin-plugin-update-status`, Studio types `BuiltinPluginUpdate*`; flat shape, `paseo.pluginUpdates.status("zekoder")` returning `BuiltinPluginUpdateStatus[]`, wire `plugin.updates.get_status.request/.response`). Studio updates only when the desktop app launches the daemon; a downloaded version that fails to start is retried once on the next start, then held (`previously-failed`) until a newer version ships; no auto-restart.
- Channel (stable/beta) comes from the desktop app, not a plugin setting; the plugin only displays `channel`.
- Version tab card feature-detects it, parses tolerantly; shows Unknown (absent), "Updates are managed by the desktop app" (`enabled:false`), and "Restart the daemon to apply (Settings → Host → Restart daemon)" when `restartRequired`. The plugin never restarts anything; no restart button.

## Out of scope

Studio loader, verification, compat gate, fallback, rollback honoring, status API implementation (Studio 004). Desktop updates (Studio 003). Any change to `releases/` or the skills/MCP flow or `plugins/zekoder/server/version.ts` skills logic. A "check now" / "update now" / restart action for the plugin (the user restarts the daemon from Studio's Host settings). Lint/test suites.

## Packages

| ID | Name | File | Branch | Depends on |
|---|---|---|---|---|
| 01 | Release pipeline (script, workflow, keyring, docs) | packages/01-release-pipeline.md | 013-plugin-auto-update-publishing-01-release-pipeline | — |
| 02 | Version tab plugin card | packages/02-version-tab.md | 013-plugin-auto-update-publishing-02-version-tab | 01 |

## Dependency graph

01 → 02. 02 imports `PLUGIN_VERSION` that 01 creates (contract `plugin-version-constant`). Live publication also needs external dependencies 1 and 2; end-to-end auto-update needs Studio 004 (dependencies 3 and 4).

## Related bugs & followups

- 012-machine-settings-need-project · separate · touches machine-scoped Defaults/Telemetry tabs; the Version tab is host-scoped and works without a project. No overlap.
- 012-omp-provider-settings · separate · different panel, no shared files beyond the surface; no action.
- 002-plugin-signing-key-rotation (followup) · separate · signing-key rotation runbook and dual-sign, filed from this plan; not folded.

Decisions consulted: 002-three-tier-agent-defaults · context-only (accepted, about agent launch defaults) · not affected. Cross-repo context: zekoder-skills ADR 009-gcs-release-pipeline-as-built (accepted there) — this plan follows its bucket, OIDC/WIF, artifact-first/manifest-last and never-overwrite patterns, and keeps its `releases/` namespace untouched.

## Open assumptions

- Resolved: compat base is the daemon version (user decision; matches Studio 004 draft).
- Studio 004 must adopt the envelope (not `.sig`), revoked objects and the `size-mismatch`/`tree-checksum-mismatch` codes, verifying `artifact.size` and `treeChecksum` (dep 3). The status contract `builtin-plugin-update-status` is final and confirmed by Studio (dep 4): no open requests there.
- Version goes to 0.12.0. Tag `v0.11.1` exists but is not on `main` (main says 0.11.0); next release must be greater than 0.11.1.
- Accepted risk (user choice): fully automatic signing; whoever can push a `v*` tag or change the workflow on `main` gets a signature. Mitigations: tag ruleset, Environment limited to `v*` tags and `main`, monotonic `sequence`, compromise response. The ancestor-of-`main` check is a safety check, not a security control.
- Key rotation is not built; format hooks only. Tracked in followup `002-plugin-signing-key-rotation`.
