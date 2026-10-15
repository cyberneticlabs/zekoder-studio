---
id: 011-versionless-role-model-defaults
type: feature
title: Select model families for session and role defaults
status: merged
createdAt: 2026-10-15
openedAt: 2026-10-15T15:15:22.950Z
updatedAt: 2026-10-15T15:22:13.140Z
completedAt: 2026-10-15T15:22:13.140Z
promoted: true
dependsOn:
  - 010-launch-button-defaults
packages:
  - id: "01"
    name: role-family-defaults
    file: packages/01-role-family-defaults.md
    branch: 011-versionless-role-model-defaults-01-role-family-defaults
    dependsOn: []
    status: merged
    mergeMode: local
    filesTouched:
      - .zekoder/features/011-versionless-role-model-defaults/packages/01-role-family-defaults.md
      - plugins/zekoder/README.md
      - plugins/zekoder/client/agent-defaults.tsx
      - plugins/zekoder/server/role-variants.ts
      - plugins/zekoder/server/zekoder.ts
      - plugins/zekoder/shared/config.ts
contracts:
  - id: model-family-resolver-cli
    type: cross-system
    counterpart: cyberneticlabs/zekoder-skills
    externalDependency: 1
    owner: "01"
    consumers: []
mergeMode: local
relatedFeatures:
  - 010-launch-button-defaults
relatedBugs: []
relatedFollowups: []
statusHistory:
  - from: planned
    to: merged
    at: 2026-10-15T15:22:13.140Z
---
> Imported from cyberneticlabs/zekoder-plugins feature 021-versionless-role-model-defaults (feature 008-plugin-source-consolidation).

# Select model families for session and role defaults

## User's request (verbatim)

> do we really need to dictate the model version for setting default models for providers in the system?
> e.g. for claude we can just nominate opus or sonnet, ..etc and for codex we can nominate sol, astra ..etc withouy being specific e.g. sonnet 5.5, does this really makes a difference? doing so will avoid updating defaults with every new release
>
> plan for this in this repo and create new opus agent in in zekoder-skills project to inform it about the changes also required in their repo for a fix at their side as well

Re-plan request (2026-10-05): "ensure plans 20 and 21 matches the new planned contracts in mcp and skills projects"

## Refined scope (built on feature 010)

- **Family names as defaults.** In 010's `AgentDefaultsEditor`, the model dropdown also offers family
  names: Claude `opus`, `sonnet`, `haiku`, `fable`; Codex `sol`, `astra`, `luna`, `terra`.
  - It works in the Planning and Coding session blocks and in the roles block.
  - The machine Defaults tab gets it for free (it reuses the editor).
  - Exact model IDs and `inherit` still work.
- **Stored as given.** The family name is stored in `agentDefaults` as the user picked it. zekoder-mcp
  stores it with no translation (mcp ADR 004 point 10, feature 023).
- **Session launch resolves it.** When Implement or Promote launches with a family model, the plugin
  asks the zekoder-skills resolver (`materialize-execution-profile.mjs --resolve-model`) for the native
  ID, before Paseo creates the agent. The plugin never picks a version itself. Migrate uses provider
  defaults (010), so it never resolves.
- **Old or missing resolver → always fail.** If the script is missing, or it says
  `error: unknown flag: --resolve-model`, a launch with any family set fails at ANY tier. The message
  is `Model <value> (from <source>): Needs a newer zekoder-skills (no --resolve-model).` Never guess.
- **Soft vs strict (010 rule)** applies only when the resolver ran and gave no usable match (it
  returned an error, found no match, or returned an ID Paseo does not list): soft → skipped quietly
  (provider default); strict → the launch fails and names the value, its source tier and the reason.
- **Child roles.** The plugin only stores the family. For Codex and other sessions, zekoder-skills
  resolves it at spawn (skills ADR 007). For claude sessions, 010's role pre-write first calls the
  same resolver and passes the resolved ID to the materializer, so the variant file name matches the
  one skills writes in-session. The old-resolver rule above applies here too.

## Out of scope

- zekoder-skills and zekoder-mcp code (external dependency 1).
- A new storage schema, snapshots (removed by ADR 002), and OMP/OpenCode families (none exist).
- Family resolution inside the plugin, or a version list in the plugin.

## Packages

| ID | Name | File | Branch | Depends on |
|---|---|---|---|---|
| 01 | Family defaults and launch resolution | `packages/01-role-family-defaults.md` | `011-versionless-role-model-defaults-01-role-family-defaults` | — |

One package: the family list, the editor options, the resolver call, the launch step, and the
Claude role pre-write step. They are
small and touch the same few files.

## Dependency graph

Feature 010 must merge first (feature `dependsOn`). Package 01 can merge before external dependency 1;
until then any launch with a family set fails with "Needs a newer zekoder-skills".

## Related bugs & followups

- 011-git-panel-not-showing-on-ipad · separate · no file overlap.
- Feature 010-launch-button-defaults · dependency · 011 edits 010's editor and `resolveLaunch`.

## Decisions consulted

- Local ADR 002-three-tier-agent-defaults (amended) · binding · followed: no factory, one resolver for
  Claude and Codex families, soft/strict rule, no snapshots.
- zekoder-skills ADR 006-codex-model-family-resolution (text ref) · binding on the resolver · followed:
  live catalog, newest first, stop on doubt, never a bare family. Its snapshot clause no longer applies.
- zekoder-skills ADR 007-three-tier-agent-defaults (text ref) · binding · followed: one resolver in
  skills; children read `agentDefaults.roles[<session provider>]`.
- zekoder-mcp ADR 004 point 10 / feature 023 (text ref) · context · MCP stores names as given.

## Open assumptions

- `--resolve-model` does not exist yet in zekoder-skills (checked 2026-10-05). The CLI shape in
  `contracts.md` is the proposed interface; skills must add it (external dependency 1).
- For Claude, skills must choose its own catalog source. Claude Code has no `debug models` command.
  The resolver must return a versioned ID that Paseo lists (for example `claude-opus-5-5`), never the
  bare alias.
