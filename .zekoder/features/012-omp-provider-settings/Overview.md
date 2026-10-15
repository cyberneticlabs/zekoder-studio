---
id: 012-omp-provider-settings
type: feature
title: OMP provider configuration with preview and safe saves
status: planned
createdAt: 2026-10-15
openedAt: 2026-10-15T15:15:23.846Z
updatedAt: 2026-10-15T18:12:21.783Z
promoted: true
dependsOn: []
packages:
  - id: "01"
    name: providers
    file: packages/01-providers.md
    branch: 012-omp-provider-settings-01-providers
    dependsOn: []
    status: planned
contracts: []
relatedFeatures:
  - 008-plugin-source-consolidation
relatedBugs:
  - 012-machine-settings-need-project
relatedFollowups: []
statusHistory: []
---
# OMP provider configuration with preview and safe saves

Imported from cyberneticlabs/zekoder-plugins feature 022; completed against this monorepo. Supersedes the imported execution instructions.

## User request

“A Paseo plugin UI to manage OMP provider settings in ~/.omp/agent/models.yml. OMP only for now. Design an adapter interface so other harnesses (Claude settings.json, Codex config.toml, opencode json) can be added later.”
“Edit scope: full edit. Add/remove providers. Edit baseUrl, api, apiKey. Add/remove model ids. Keep unknown keys (e.g. discovery) as they are.”
“Test connection: yes, test + import. Call <baseUrl>/models with the key, show OK/error, and let the user add the model ids it finds.”
“Machine-wide: must work with NO project open.”
“Location: Machine settings.”
“Tab: new tab (Providers), within it show drop down to switch between provides since each has its won config set”
“apiKey can be an env-var name or command, not only a literal key.”
“Test with stored key: only same URL.”

Placement was confirmed on the global Zekoder page, rather than the project Config panel.

## Refined scope

Add Providers after Telemetry on the global Zekoder surface. A harness dropdown lists registered adapters (OMP only); the OMP editor manages provider names, baseUrl, api, apiKey and model ids on the connected daemon machine. No workspace or zekoder-mcp call is required.
Keep comments, ordering, discovery, unknown api values, unknown fields and model metadata through YAML Document edits. Preserve existing keys when the user leaves the key field blank; an explicit Remove key action deletes apiKey. Read responses never disclose literal keys.
Test/import makes a bounded GET to the explicitly configured baseUrl plus /models, imports selected ids without duplicates, and never executes command keys. Stored secrets may be used only for the unchanged stored URL, with redirects rejected.
Writes retain permissions and symlinks, make a backup, detect external changes and show conflicts without silently discarding unsaved edits. A read-only sanitized Preview precedes explicit Save: show the daemon-resolved target, provider/model changes and key action only. Reads/preview never create files, directories, backups or temps; edits invalidate preview, and Save uses the exact reviewed operations/revision then re-reads state.
Show source/authority notes: this edits the connected daemon's selected OMP models config, not a verified effective profile or running session. Documented daemon-visible home/profile overrides may resolve the OMP target; ambiguous custom launchers/profiles are reported without silently claiming this default file belongs to them. Editing the default config needs no installed/enabled/authenticated OMP.

## Out of scope

Other adapters, provider rename, discovery editing, OMP reload automation, global defaults changes and new host filesystem APIs. Do not modify protocol wire schemas or the main daemon on 6767.

## Implementation and approval boundary

Full tier, one implementation package: preserving YAML requires a narrow server host-module extension across the plugin/compiler boundary. yaml 2.9.1 already belongs to packages/server; do not install a plugin dependency or add a new bundle pipeline.
**Architecture approved by the user on 2026-10-15:** allow server plugin code to import the existing yaml host module by extending compiler allowlisting and host runtime injection, following the existing zod seam. Keep yaml unavailable in client/shared code. The user approved this design and committing/landing the plan; implementation has not been requested.
No cross-package execution contract is needed because the host seam and its only consumer land together.

| Package | Branch | Depends on | Responsibility |
| --- | --- | --- | --- |
| 01-providers | 012-omp-provider-settings-01-providers | None | YAML host seam, OMP adapter/RPC/editor and verification |

Dependency graph: 01-providers only. External service availability affects optional user Test actions, not implementation.

## Related work considered

- Decision 002-three-tier-agent-defaults — binding: machine defaults go through zekoder-mcp. Followed; this edits OMP's own models.yml only.
- Bug 012-machine-settings-need-project — resolved history, separate; current machine telemetry/defaults have a no-project transport. Retain relation, no fold.
- Feature 008-plugin-source-consolidation — completed import provenance; no execution dependency.
- Remote agentshome plan025-harness-access-permissions — inspected uncommitted source, not imported/merged or an execution dependency. Adopt only daemon-resolved targets, source/authority labels, sanitized preview, stale-draft/query isolation and preservation tests. Its four-harness permissions editor, policy formats, new parsers and project scopes stay separate. No dangling local feature025 relation is registered.
- No open bugs or followups overlap. Open followups 002-plugin-signing-key-rotation, 005-distinct-desktop-updater-cache-dir and 010-publish-paseo-zekoder-to-npm stay separate.
