---
id: 010-launch-button-defaults
type: feature
title: Provider, model, effort and access-mode defaults for Implement and Promote
status: merged
createdAt: 2026-10-15
openedAt: 2026-10-15T15:15:20.222Z
updatedAt: 2026-10-15T15:21:39.469Z
completedAt: 2026-10-15T15:21:39.469Z
promoted: true
dependsOn: []
packages:
  - id: "01"
    name: tiered-config-repo-panel
    file: packages/01-tiered-config-repo-panel.md
    branch: 010-launch-button-defaults-01-tiered-config-repo-panel
    dependsOn: []
    status: merged
    mergeMode: local
    filesTouched:
      - .zekoder/features/010-launch-button-defaults/packages/01-tiered-config-repo-panel.md
      - plugins/zekoder/README.md
      - plugins/zekoder/client/agent-defaults.tsx
      - plugins/zekoder/client/config-panel.tsx
      - plugins/zekoder/index.server.ts
      - plugins/zekoder/package-lock.json
      - plugins/zekoder/package.json
      - plugins/zekoder/server/config.ts
      - plugins/zekoder/server/zekoder.ts
      - plugins/zekoder/shared/config.ts
  - id: "02"
    name: tiered-launch
    file: packages/02-tiered-launch.md
    branch: 010-launch-button-defaults-02-tiered-launch
    dependsOn:
      - "01"
    status: merged
    mergeMode: local
    filesTouched:
      - .zekoder/features/010-launch-button-defaults/packages/02-tiered-launch.md
      - plugins/zekoder/README.md
      - plugins/zekoder/client/start-agent-button.tsx
      - plugins/zekoder/server/role-variants.ts
      - plugins/zekoder/server/zekoder.ts
      - plugins/zekoder/shared/config.ts
      - plugins/zekoder/shared/issues.ts
  - id: "03"
    name: machine-defaults-tab
    file: packages/03-machine-defaults-tab.md
    branch: 010-launch-button-defaults-03-machine-defaults-tab
    dependsOn:
      - "01"
      - "02"
    status: merged
    mergeMode: local
    filesTouched:
      - .zekoder/features/010-launch-button-defaults/packages/03-machine-defaults-tab.md
      - plugins/zekoder/README.md
      - plugins/zekoder/client/issue-detail.tsx
      - plugins/zekoder/client/issues-tab.tsx
      - plugins/zekoder/client/machine-defaults-panel.tsx
      - plugins/zekoder/client/provider-onboarding.tsx
      - plugins/zekoder/client/start-agent-button.tsx
      - plugins/zekoder/client/zekoder-surface.tsx
      - plugins/zekoder/index.client.tsx
      - plugins/zekoder/index.server.ts
      - plugins/zekoder/server/config.ts
      - plugins/zekoder/shared/config.ts
contracts:
  - id: agent-defaults-client-model
    type: internal
    kind: store
    owner: "01"
    consumers:
      - "02"
      - "03"
  - id: agent-defaults-editor
    type: internal
    kind: component
    owner: "01"
    consumers:
      - "03"
  - id: launch-result
    type: internal
    kind: edge-function
    owner: "02"
    consumers:
      - "03"
  - id: agent-defaults-config-surface
    type: cross-system
    counterpart: cyberneticlabs/zekoder-mcp
    externalDependency: 1
    owner: "01"
    consumers:
      - "02"
      - "03"
mergeMode: local
relatedFeatures:
  - 009-paseo-copy-implement-and-promote-idea-buttons
  - 011-versionless-role-model-defaults
relatedBugs: []
relatedFollowups: []
statusHistory:
  - from: planned
    to: merged
    at: 2026-10-15T15:21:39.469Z
---
> Imported from cyberneticlabs/zekoder-plugins feature 020-launch-button-defaults (feature 008-plugin-source-consolidation).

# Feature 010-launch-button-defaults: Provider, model, effort and access-mode defaults for Implement and Promote

## User's request (verbatim)

Original request:

"Implement button and Promote buttons should have default agents/provider selection as well as model and effort, moreover planning or coding should have default chosen provider (use drop down to avoid confusion). Finally, the effort and access mode (e.g. auto, bypass, etc.) should be set for the new agents created for promote or implement buttons."

Re-plan request (2026-10-04): "re-plan feature 010 according to the ADR 002"

## Refined scope (per ADR 002, amended)

- **One shape, three tiers, no factory tier.** Settings use the shape `{planning, coding: {provider, model?, effort?, mode?}, roles:
  {<provider>: {<role>: {model?, effort?}}}}`.
  - zekoder-mcp resolves each field separately: profile > repo > machine.
  - A field no tier sets is not sent, so the provider's own default applies.
  - The UI shows each value with the tier it came from (its source).
- **Providers**: Paseo enabled + ready, intersected with the harnesses zekoder supports.
- **Repo tier**: the project Zekoder settings, with `scope: "repo"`.
  - The Planning tab holds `planning` and the planning roles.
  - The Coding tab holds `coding` and the other roles.
- **Machine tier**: a new **Defaults** tab on the global Zekoder page, with `scope: "machine"`.
  - It writes through zekoder-mcp only.
  - It needs the zekoder-mcp machine-only read and its capability flag (followup 050 or feature
    022, whichever lands first).
- **Onboarding**: when a launch finds no provider, it shows a small modal.
  - The modal reuses the shared editor and writes the planning and coding providers to the machine tier. It then re-runs the launch.
  - A "Set up providers" banner on the Zekoder page shows until both are set.
  - With 023 but without the flag, there is no modal and no banner. The message points to this project's Settings → Planning or Coding tab.
- **Execution profile**: shown only, as `profile (<name>)`.
  - The `executionSnapshot` special case is removed.
  - There is no refusal rule.
- **Launch**:
  - Implement uses `coding`. Promote uses `planning`. Migrate uses only the planning provider, on that provider's defaults.
  - The session mode is passed as `modeId`.
  - Codex gets `$skill <id>`; other providers get `/skill <id>`.
  - Claude role variants are pre-written only for claude sessions, and only for roles with a set field. Child access mode stays in the agent files.
- **Soft vs strict.** A field from a tier below the tier that set the provider is soft: it is used only if the provider offers it. A field from the same tier or higher is strict. If it doesn't fit, the launch fails and names the value and its source.
- **Removed**:
  - `SESSION_ROLE`, so Implement no longer borrows the supervisor model. This is an accepted ADR consequence.
  - `IMPLEMENT_PROVIDER`, `VARIANT_HARNESS`, the `launchDefaults` layer, and whole-binding fallbacks.
- **Old zekoder-mcp bundle** (no `sources.agentDefaults`):
  - Controls are disabled with the hint "Needs a newer zekoder-mcp".
  - No saved values are shown (the plugin never reads legacy `roleDefaults.values`).
  - Launches use `LEGACY_PROVIDER = "claude"` (old bundle only) on the provider defaults only. No role variants are written.

## Out of scope

- zekoder-mcp and zekoder-skills code (external dependencies 1–2), and data migration.
- A profile editor. Family-name selectors (feature 011). Per-click overrides, other buttons, and the Copy button (feature 009).
- The rest of zekoder-mcp 022's plugin work: a machine MCP client that works with zero Paseo
  projects, machine telemetry consent on the Defaults tab, dropping the repo veto chip, and the
  `telemetry.vetoed` schema fix. This is plugin work, deferred to one recommended followup (to be
  filed). See external dependency 1.

## Packages

| ID | Name | File | Branch | Depends on |
|---|---|---|---|---|
| 01 | Tiered config model and repo panel | `packages/01-tiered-config-repo-panel.md` | `010-launch-button-defaults-01-tiered-config-repo-panel` | — |
| 02 | Launch from the resolved binding | `packages/02-tiered-launch.md` | `010-launch-button-defaults-02-tiered-launch` | 01 |
| 03 | Machine Defaults tab and onboarding | `packages/03-machine-defaults-tab.md` | `010-launch-button-defaults-03-machine-defaults-tab` | 01, 02 |

- 01: schemas, read/write mapping, the provider list, the shared editor, and the repo panel.
- 02: launch resolution, the prompt, the mode, `needs-onboarding`, and removal of the hacks.
- 03: the machine RPCs, the Defaults tab, the banner, and the launch hook.

## Dependency graph

01 → 02 → 03; 03 also depends on 01. 03's launch hook consumes 02's `launch-result`. Three packages
fit under the cap of 4.

## Related bugs & followups

- 011-git-panel-not-showing-on-ipad · separate · no overlap.
- Feature 011-versionless-role-model-defaults · related · **depends on 010 (enforced in its
  `dependsOn`)**. 011 is re-planned on top of 010's plan (family-name selectors in 010's editor,
  resolved at launch). It still depends on 010 and checks the real code before editing.
- Feature 009 (merged) · context only · the Copy button text stays `/zekoder-…`.

Decisions consulted:
- ADR 002 (amended: no factory tier, onboarding, soft/strict rule), 002-three-tier-agent-defaults ·
  binding · followed in full.

## Open assumptions

- The wire shape follows 023 (merged in zekoder-mcp, not yet published) and the machine read of
  050/022. The flag name `capabilities.machineScopeRead` lives
  in one constant.
- The materializer accepts `inherit` with an effort.
