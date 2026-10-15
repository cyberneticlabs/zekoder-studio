---
id: 002-three-tier-agent-defaults
type: decision
title: Three-tier defaults for provider, model, effort and access mode
status: accepted
createdAt: 2026-10-15
openedAt: 2026-10-15T15:15:38.507Z
updatedAt: 2026-10-15T15:20:56.582Z
completedAt: 2026-10-15T15:20:56.582Z
tags: []
relatedFeatures:
  - 010-launch-button-defaults
  - 011-versionless-role-model-defaults
relatedBugs: []
relatedFollowups: []
supersedes: []
supersededBy: []
statusHistory:
  - from: proposed
    to: accepted
    at: 2026-10-15T15:20:56.582Z
---
> Imported from cyberneticlabs/zekoder-plugins decision 001-three-tier-agent-defaults (feature 008-plugin-source-consolidation).

# Decision 002-three-tier-agent-defaults: Three-tier defaults for provider, model, effort and access mode

> **Not queued for autonomous implementation.** This is a decision record (ADR) — knowledge the
> planner consults, not work a zekoder-coding-agent executes.

## Context

Defaults for agent provider, model, effort and access mode are set in 6 or more overlapping places today:

1. Frozen `executionSnapshot` (feature 017) on an item.
2. Repo `roleDefaults[harness][role]` `{model, effort?}` in `.zekoder/config.json`. Edited from the Paseo Config panel.
3. Planned machine `roleDefaults` (zekoder-mcp feature 023 / decision 003).
4. Agent file pins (`model: sonnet`) in 7 zekoder-skills `agents/*.md` files.
5. No pin: the agent follows the parent session (planner, reviewers, supervisor).
6. Parent session model chosen by this plugin. Implement borrows the zekoder-supervisor-agent role binding (`plugins/zekoder/server/zekoder.ts`, `SESSION_ROLE`, about lines 41 and 138-143). Promote and Migrate use the provider default. The provider is hardcoded to `claude` (`VARIANT_HARNESS` in `plugins/zekoder/server/role-variants.ts:11`).
7. Planned `launchDefaults` key (plugin feature 010 and mcp feature 023). It adds one more provider/model/effort/mode layer.

This causes conflicts:

- A repo cannot restore the agent-file pin when a machine binding exists.
- Two knobs pick the Implement session model.
- Whole-binding merge drops effort.
- The snapshot silently overrides the provider choice.
- Codex family resolution (zekoder-skills decision 006) contradicts `runtime/role-defaults.md` ("no provider translation").

User words: "This is way too much, let's go through this into three tiers only."

## Decision

Three tiers only. No factory seed (amended 2026-10-04, see below). Priority from low to high:

- **Tier 1, Machine**: `~/.zekoder-mcp/config.json`. Managed by the Zekoder Paseo plugin UI. It is written THROUGH zekoder-mcp (`zekoder_set_config` with `scope: "machine"`), never by direct file writes. One validator.
- **Tier 2, Repo**: `.zekoder/config.json`. Owned by zekoder-skills and zekoder-mcp. Edited from the plugin Config panel (scope "repo").
- **Tier 3, Execution profile**: pins provider, model, effort and mode. ONE active profile per repo. It is not frozen per item. It replaces today's per-item `executionSnapshot` special case.

Same shape at every tier:

```
{
  planning: { provider, model?, effort?, mode? },
  coding:   { provider, model?, effort?, mode? },
  roles:    { <provider>: { <role>: { model?, effort? } } }
}
```

- `planning` = session started by Promote and plan flows.
- `coding` = session started by Implement.
- Every field is optional.

Resolution: per field, profile > repo > machine. A field unset at every tier uses the provider's own default. Merge is per field, not per whole binding. `inherit` means follow the parent session. Clearing a field falls to the next lower tier. The UI shows each resolved value with its source tier.

Rules:

- Children always run in the session's provider. `provider` exists only on `planning` and `coding`. `roles` is read only for that provider.
- Child access mode (agent-file `permissionMode`, for example `bypassPermissions` on coding and supervisor) stays in agent files. Tiers set session mode only.
- Codex and Claude family names (opus, sonnet, sol, luna, ...) are resolved in one single resolver.
- **No factory tier.** Choices depend on the providers that are available (Paseo enabled and ready, and supported by zekoder). There are no shipped default values. The hardcoded `claude` and the agent-file `model: sonnet` pins still go away.
- **Onboarding.** When no tier sets a provider, the Zekoder Paseo plugin onboards the user. A launch (Implement, Promote, Migrate) opens onboarding instead of failing. The Zekoder page shows a "Set up providers" banner until it is done. Onboarding writes the chosen providers and their defaults to the machine tier, through zekoder-mcp.
- **Soft vs strict fields.** Take the tier that set `provider`. A `model`, `effort` or `mode` from a LOWER tier is soft: it is used only if the provider offers it, else skipped quietly (provider default). One from the SAME or a HIGHER tier is strict: if the provider lacks it, the launch fails and the error names the value and its source tier.

### Amendment 2026-10-04

During the re-plan of feature 010 the user removed the factory seed, added onboarding, and approved the soft/strict rule. Text above is updated in place. zekoder-mcp and zekoder-skills should follow the same rules.

Supersedes the same-day edit 1b6b8b2 (factory owned by this plugin); the user chose no factory tier.

Cross-repo (text only, not relations): zekoder-mcp feature 023-launch-defaults-layered-config, feature 022-central-config-defaults, decision 003-layered-machine-repo-config. zekoder-skills decision 006-codex-model-family-resolution, feature 017-adaptive-execution-profiles, feature 018-per-harness-role-defaults, and `runtime/role-defaults.md`. Equivalent ADRs will be filed in zekoder-skills and zekoder-mcp.

In this repo, plans 010-launch-button-defaults and 011-versionless-role-model-defaults need re-planning.

## Consequences

Good:

- One predictable order. Every value has a visible source.
- The supervisor-binding hack and the hardcoded provider go away.

Bad:

- Needs coordinated changes in three repos: zekoder-mcp (schema and scope), zekoder-skills (resolver and agent-file pin removal), plugin (UI and launch).
- Migration: existing `roleDefaults` and `executionProfiles` / `executionSnapshot` data must be mapped to the new key.
- One active profile per repo: changing it affects later launches of every item. Runs are less repeatable than per-item frozen snapshots. Already-running sessions keep their binding.
- Session-only access mode: users cannot change child agent permissions from config.

## Alternatives considered

- **Factory seed** (shipped constants in zekoder-skills, or in the plugin). Removed 2026-10-04: defaults should come from the providers the user really has, set at onboarding.
- **Keep stacking layers** (machine roleDefaults + launchDefaults + snapshot + pins). This is the current plan. Rejected: too many layers and the conflicts above.
- **Plugin writes the machine file directly.** Faster, but two writers and two validators, so drift risk. Rejected.
- **Profile chosen per item and frozen.** More repeatable, but the user chose the simpler one-active-profile-per-repo. Rejected.
- **Access mode as a per-role tier field.** Risk of weakening or widening child permissions by mistake. Rejected.
