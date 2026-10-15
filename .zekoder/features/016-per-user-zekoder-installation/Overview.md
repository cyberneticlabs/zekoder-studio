---
id: 016-per-user-zekoder-installation
type: feature
title: Per-user Zekoder installation and updates
status: planned
createdAt: 2026-10-15
openedAt: 2026-10-15T17:20:16.222Z
updatedAt: 2026-10-15T17:22:44.272Z
promoted: true
dependsOn: []
packages:
  - id: "01"
    name: shared-runtime
    file: packages/01-shared-runtime.md
    branch: 016-per-user-zekoder-installation-01-shared-runtime
    dependsOn: []
    status: planned
contracts:
  - id: user-install-v1
    type: cross-system
    counterpart: cyberneticlabs/zekoder-skills
    externalDependency: 1
    owner: "01"
    consumers: []
relatedFeatures:
  - 008-plugin-source-consolidation
  - 011-versionless-role-model-defaults
relatedBugs: []
relatedFollowups: []
statusHistory: []
---
# Per-user Zekoder installation and updates

## Source and user request

Recovered read-only from agentshome's uncommitted former plugin branch plan-026-per-user-zekoder-installation. Original feature026 is imported here as feature016; remote files remain untouched. The reviewed skills companion is a handoff on remote branch plan-user-install at /tmp/zekoder-skills-plan-user-install/PLAN-HANDOFF.md, not a registered or implemented feature.

> currently zekoder skills are installed per repo, this is inefficient, why not to install it per machine? is there any reason?
> plan whatever required here, start a new gpt-6.1 sol aget in a new workspace in the skills project to handover its plan part for filing

The requested separate skills handoff already exists; this plan does not launch another external agent.

## Scope and acceptance

Install canonical tooling once per OS user on the connected daemon machine. With zero projects, Version reports verified shared/per-harness status and can install/update/retry one shared job. Projects/worktrees retain their plans, KB, identity, config tiers and generated role variants; fresh worktrees consume shared canonical tooling without copying it.
Offer explicit preview/apply migration for a selected known project/worktree only. Preserve modified/unowned files and report shadows/conflicts/reload requirements; historical version stamps never prove readiness.
Keep the active cache location and explicit project MCP/env override precedence. MCP, machine calls, org-health and model/role helpers consume the same verified active runtime where no explicit override exists. Failed activation restores prior payload, wiring and ownership. Generic create hooks remain bounded/fail-open; plugin-controlled launches block with actionable readiness errors.

## Out of scope

Installer/native discovery implementation, MCP source/schema changes, arbitrary disk scans, automatic migration/deletion, system-wide multi-user installation, version pinning, release-channel redesign, plugin self-update redesign, or moving generated variants to user scope. No product implementation in this planning task.

## Package and dependencies

| Package | Branch | Depends on | Scope |
| --- | --- | --- | --- |
| 01-shared-runtime | 016-per-user-zekoder-installation-01-shared-runtime | External dependencies 1 and 2 | Plugin schema/server/client integration atomically |

MCP compatible emitted helper commands -> skills user-install-v1 release -> package01 verified integration -> plugin release.
**Blocked for execution:** neither external deliverable is implemented in inspected sibling sources; companion skills work is an unregistered reviewed handoff. Do not queue package01 as executable until both dependency release artifacts and their evidence are supplied. Stub-based design work is not completion.

## Architecture assumptions requiring approval

The user approved this plan and the coordinated user-install-v1/shared installation/migration architecture on 2026-10-15. Implementation was not requested; external release delivery and skills-owner confirmation below remain prerequisites. Installer owns transactional active-cache/harness-wiring activation under its shared lock; the plugin stages candidates without replacing active paths. The candidate executable's own release root supplies sourceRoot; existing cache environment resolves activation destination (contract). Confirm this exact convention with the skills owner before execution; do not invent CLI flags.
MCP must expose compatible shared helper commands before legacy runtime links may be removed. Repo-local role variants remain separate from canonical shared sources.

## Related work

- Decision002-three-tier-agent-defaults is binding: profile > repo > machine config, machine writes through MCP. Installation ownership stays separate; followed.
- Feature008-plugin-source-consolidation is completed provenance. Feature011-versionless-role-model-defaults documents existing family resolver; preserve it.
- Feature012 OMP settings and skipped feature014 explorer stay separate; no implementation dependency or changes here.
- Open followups002 signing-key rotation,005 desktop updater cache and010 npm publishing do not overlap this package's files/verification. No folds/resolvedBy.
- Source feature025 has no established imported counterpart; do not invent a dependency.
