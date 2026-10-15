# Package 01 — Tiered config model and repo Config panel

**Branch:** `010-launch-button-defaults-01-tiered-config-repo-panel`
**Worktree:** supervisor-provided. Fresh worktrees have no `node_modules`: run `cd plugins/zekoder && npm ci` first.
**Depends on:** none. **Owns contracts:** `agent-defaults-client-model`, `agent-defaults-editor`,
`agent-defaults-config-surface` (consumer side).

## Context

All paths under `plugins/zekoder/`. Read `docs/paseo-plugin-project-scope.md` before UI edits.

- `shared/config.ts` — `configStatusSchema` (:127), `setConfigRpc` (:160, has `roleDefault`),
  `roleBindingSchema` (:46), `roleControls`/`acceptedModelFor`/`roleBindingProblem` (:80-106; host
  capability facts, keep them), `harnessModelSchema` (:138), `listHarnessModelsRpc` (:147).
- `server/zekoder.ts` `fetchConfig` (:219-228) copies only known keys. `roleBindings` (:214) and
  `startAgent` still read `roleDefaults` — 02 changes them, so keep that field here.
- `server/config.ts` — `setConfig` (:39-56) sends a `roleDefaults` patch with no `scope`;
  `listHarnessModels` (:15-37) holds the model→`HarnessModel` mapper (:22-30).
- `client/config-panel.tsx` — `ConfigPanel` (:105), `save` mutation (:129-141), shared
  `roleHarness` state (:146-147), `renderRoleDefaults` (:266-306) with the harness chip row
  (:281-291), `RoleRow`/`RoleDropdowns`/`RoleTextInputs` (:345-520, already props-driven),
  `Section` (:334), `PLANNING_ROLES` (:44-55).
- `client/dropdown.tsx` `Dropdown`/`Raise`; `client/chip.tsx`; `client/button.tsx`.
- Paseo SDK: `paseo.providers.snapshot({cwd?})` → `entries[{provider, status, enabled, label?,
  models?, modes?, defaultModeId?}]`. `cwd` is optional.
- Wire shape: `../contracts.md` `agent-defaults-config-surface`. Support is detected by
  `sources.agentDefaults` (023 always adds it), not by the presence of `agentDefaults`. The roster
  stays in `roleDefaults.available` on every bundle (providers `claude|codex|omp|opencode`). There
  is no factory tier. 023 rejects a `roleDefaults` patch, so task 3 must not send one.

## Tasks

- [x] 1. **Schemas** — `shared/config.ts`: add the `agent-defaults-client-model` types, schemas,
  `ProviderOption`, `listProvidersRpc` and `isStrictField` exactly as in `../contracts.md`. Extend
  `configStatusSchema` with `agentDefaults`. Replace `roleDefault` in `setConfigRpc` input with
  `agentDefaults?: agentDefaultsPatchSchema`. **Keep** `configStatusSchema.roleDefaults`,
  `roleDefaultsStateSchema` and `RoleDefaultsValues` (02 removes them).
- [x] 2. **Read** — `server/zekoder.ts`: export `toAgentDefaultsState(payload)` (03 reuses it) and
  call it from `fetchConfig`. Define `MACHINE_SCOPE_FLAG = "machineScopeRead"` (read from
  `payload.capabilities`) as the one place the flag name lives. Roster (both bundles) = raw
  `payload.roleDefaults.available` (`harnesses` → `providers`). With `sources.agentDefaults`
  present: `supported: true`, values (`agentDefaults ?? {}`) and sources copied as given,
  `machineScope` = the flag, `activeProfile` from `executionProfiles.active`, plus warnings.
  Otherwise: `supported: false`, `machineScope: false`, empty `values` and empty sources. Never
  read `roleDefaults.values` (zekoder-mcp followup 051 removes it).
- [x] 3. **Write** — `server/config.ts`: export `toSetConfigArgs(patch, scope)` (03 reuses it). It
  maps `set` into a nested `agentDefaults` object and `clear` into `["agentDefaults.<path>"]`, with
  `scope`. `setConfig` adds these args **only** when `input.agentDefaults` is present; workflow and
  telemetry calls stay exactly as today. Before sending, re-read support and reject the patch when
  `supported` is false. Validate role fields with `roleBindingProblem` (model absent → check effort
  only). Re-read with `fetchConfig`.
- [x] 4. **Provider list** — `server/config.ts` `listProviders`: validate `root` when given;
  `paseo.providers.snapshot({cwd: root})`; keep entries that are `enabled` and `status === "ready"`.
  Extract the model mapper into `toHarnessModel()` and reuse it in `listHarnessModels`. Callers
  intersect with `roster.providers`. Register in `index.server.ts`. Errors → `{providers: [], error}`.
- [x] 5. **Editor** — new `client/agent-defaults.tsx` exporting `AgentDefaultsEditor` per the
  `agent-defaults-editor` contract. Move `RoleRow`, `RoleDropdowns`, `RoleTextInputs`, `Section`
  there and adapt them to optional fields (`model?`, `effort?`). Export `Section`; `config-panel.tsx`
  imports it back for its other sections.
  - **Session block** per tab: four `Dropdown`s: provider (available providers), model
    (`inherit (provider default)` + the provider's models), effort (the chosen model's efforts), mode
    (the provider's modes). Unset shows "provider default".
  - Under each set value, a muted line `<value> · <source>`; `profile` shows as `profile (<name>)`
    with "The execution profile overrides this field."
  - A soft field (`isStrictField` false) that the resolved provider doesn't offer shows
    "ignored: set for another provider".
  - A **Reset** chip clears this tier's own field; shown only when the source equals `scope`.
  - Changing the provider sends `set` for the provider plus `clear` for this tier's model, effort
    and mode of that tab, in one patch. Use leaf clear paths only: `clear` and `set` may not
    overlap at any level (prefix counts), so never clear the parent `planning`/`coding`.
  - **Roles block** (when `roleFilter` is set): the provider chip row defaults to the tab's resolved
    provider. Each role field shows its source and saves one field per patch. Keep the free-text
    fallback.
  - Unsupported: all controls disabled; one hint line "Needs a newer zekoder-mcp".
- [x] 6. **Repo panel** — `client/config-panel.tsx`: replace `renderRoleDefaults` and the shared
  `roleHarness` state with `AgentDefaultsEditor scope="repo"`. Planning tab: `tabs={["planning"]}`,
  `roleFilter` = `PLANNING_ROLES`. Coding tab: `tabs={["coding"]}`, the other roles. Add a providers
  query (`listProvidersRpc` with `root`, 60 s stale time). Save through the existing `save` mutation
  with `{agentDefaults: patch}`.
- [x] 7. **Docs** — `README.md` Zekoder settings paragraph (~:95-113): replace the feature-018
  role-defaults text with the tiers (profile > repo > machine, else provider default), per-field
  sources, Reset, and the old-bundle hint. Add `client/agent-defaults.tsx` to the Layout list. Bump
  `package.json` `version` (minor) once for the feature.

## Verification

- `cd plugins/zekoder && npm run typecheck`.
- `paseo plugin reload zekoder` (CLI may be at `/Applications/Paseo.app/Contents/Resources/bin/`),
  then reload the app window.
- Current bundle (0.44.0): Planning and Coding show the hint and disabled controls; the workflow and
  telemetry controls still save.
- New bundle: steps 2–5 of `../get-started.md`.

## Progress

- Status: planned
- Completed tasks: 7/7
- Gate: pending
- Reviewer notes: pending
