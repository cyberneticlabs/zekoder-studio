# Package 02 — Launch from the resolved planning/coding binding

**Branch:** `010-launch-button-defaults-02-tiered-launch`
**Worktree:** supervisor-provided, branched after 01 merges. Run `cd plugins/zekoder && npm ci` first.
**Depends on:** 01. **Owns contract:** `launch-result`. **Consumes:** `agent-defaults-client-model`,
`agent-defaults-config-surface`.

## Context

All paths under `plugins/zekoder/`.

- `server/zekoder.ts`:
  - `IMPLEMENT_PROVIDER` (:39) and `SESSION_ROLE` (:41) — remove (ADR 002).
  - `implementIssue` (:123-144): the `executionSnapshot` branch (:134-137) and the supervisor-binding
    session (:138-143) — remove both.
  - `promoteIdea` (:151-162), `migrateWorkspace` (:165-171).
  - `startAgent` (:178-211): one provider, exact-ID model match against `listModels`, effort check
    against `thinkingOptions`, `agents.create({config: {provider: "<p>/<model>", thinkingOptionId?}})`.
    No `modeId` today.
  - `roleBindings` (:214-216) reads legacy `roleDefaults.values.claude`.
- `server/role-variants.ts`: `VARIANT_HARNESS = "claude"` (:11), `materializeRoleDefaults`
  (:24-49). It pre-writes `.claude/agents/<role>--role-default-<hash>.md`, because Claude Code loads
  agents only at session start. That is a Claude host fact, so the pre-write stays for claude
  sessions only. Other providers skip it; zekoder-skills applies their roles at spawn.
- `shared/issues.ts`: `implementCommand` (:111), `promoteCommand` (:128), `MIGRATE_COMMAND` (:140),
  and the three launch RPCs (:116, :133, :148). The Copy button and `needsMigration` use the command
  helpers. Keep the helpers unchanged.
- Launch callers: `client/start-agent-button.tsx` (`StartAgentButton`, `start()` → result, then
  `navigation.openAgent`), `client/issue-detail.tsx` (Implement and Promote, :102-123),
  `client/issues-tab.tsx` (Migrate, :209-217).
- Paseo SDK: `paseo.providers.listModes(provider, {cwd})` → `{modes?: [{id, label}], error?}`.
  `PaseoAgentConfig` has `modeId` and `thinkingOptionId`.
- `fetchConfig(root).agentDefaults` (from 01): `values`, `sources`, `supported`.

## Tasks

- [x] 1. **Prompt per provider** — `shared/issues.ts`: add `skillPrompt(provider: string, skill:
  string, arg?: string): string`. Codex → `$<skill>[ <arg>]`; every other provider →
  `/<skill>[ <arg>]`. Fix the "Starts a Claude agent" comments (:115, :132).
- [x] 2. **Result shape** — `shared/issues.ts`: change the three launch RPC outputs to the
  `launch-result` union in `../contracts.md`. `StartAgentButton` opens the agent only on
  `status: "started"`; on `needs-onboarding` it shows the plain text "No <tab> provider is set yet."
  (03 replaces this). Update the callers in `issue-detail.tsx` and `issues-tab.tsx` to compile.
- [x] 3. **Resolve the binding** — `server/zekoder.ts`: new `resolveLaunch(paseo, root, tab, {fieldsFromTab})`.
  - Provider = `values[tab].provider`. Unset: if `supported` is false, use `LEGACY_PROVIDER =
    "claude"` (comment: old-bundle path only). Otherwise return `{status: "needs-onboarding", tab}`.
  - Soft/strict: a field is strict when `isStrictField(fieldSource, providerSource)` is true.
  - Model: unset or `inherit` → the provider default (`isDefault`, else first selectable). Otherwise
    exact-match a selectable ID. Missing: soft → provider default; strict → throw "Model <m> (from
    <source>) is not available for <provider>."
  - Effort: when set, it must be in the chosen model's `thinkingOptions`. Soft → drop; strict → throw
    with the source. Unset → omit.
  - Mode: when set, it must be in `listModes(provider, {cwd: root})`. Soft → drop; strict → throw.
    Unset → omit (provider default).
  - `fieldsFromTab: false` (Migrate) uses only the provider; model, effort and mode stay the
    provider's own defaults.
- [x] 4. **Launch** — `startAgent(paseo, root, title, skill, arg, tab, fieldsFromTab)`: call
  `resolveLaunch`; return early on `needs-onboarding`. If the provider is claude, call
  `materializeRoleDefaults(root, provider, values.roles?.[provider] ?? {})`. Then
  `agents.create({config: {provider: "<p>/<model>", thinkingOptionId?, modeId?}, title, prompt:
  skillPrompt(provider, skill, arg)})` and return `{status: "started", …}`. Implement → `coding`;
  Promote → `planning`; Migrate → `planning` provider only.
- [x] 5. **Remove the hacks** — delete `IMPLEMENT_PROVIDER`, `SESSION_ROLE`, `roleBindings`, the
  `executionSnapshot` branch and the `session` parameter. No snapshot refusal rule. Remove the now
  unused `configStatusSchema.roleDefaults` field, `roleDefaultsStateSchema` and `RoleDefaultsValues`
  from `shared/config.ts` (01 kept them) and their copy in `fetchConfig`. Keep reading only the raw
  `payload.roleDefaults.available` inside `toAgentDefaultsState` (the roster). After this package,
  `grep -rnE "fields.*executionSnapshot|roleDefaults\.values|experiments\.executionProfiles|executionProfiles: false|telemetry\.disabled" paseo`
  must return nothing (zekoder-mcp followup 051 start condition).
- [x] 6. **Role variants** — `server/role-variants.ts`: remove `VARIANT_HARNESS`; take `provider` as a
  parameter and pass it as the materializer's harness argument. Accept `RoleFields`:
  - Only roles with an explicitly set field are written. A role with no set field is skipped: it runs
    on its agent file and the session, and no variant is written.
  - Effort-only role → pass `inherit` as the model plus `--effort`.
  - Missing `.zekoder-execution-profiles/` → keep today's error ("re-run the zekoder-skills
    installer"). It is raised only when at least one role field is set; with none set, nothing runs.
  - Keep `cleanupRoleVariants`.
- [x] 7. **Docs** — `README.md` Implement / Promote / Role-default bullets (:21-36): the resolved
  binding, provider-specific prompt (`$` for codex), mode applied, onboarding when no provider is set,
  Migrate on the planning provider's defaults, no snapshot special case, old-bundle behavior (claude
  on provider defaults; no supervisor model pin any more).

## Verification

- `cd plugins/zekoder && npm run typecheck`.
- Reload the plugin. Current bundle: Implement and Promote start claude on the provider default model
  with the `/zekoder-…` prompt; no role variants are written (old bundles show no saved values).
- New bundle: steps 6–9 of `../get-started.md`.

## Progress

- Status: ready for review
- Completed tasks: 7/7
- Gate: npm run typecheck pass
- Reviewer notes: pending
