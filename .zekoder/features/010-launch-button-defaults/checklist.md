# Checklist — 010-launch-button-defaults

## Feature-level gates

- [ ] `cd plugins/zekoder && npm run typecheck` passes on the integrated branch.
- [ ] No import from zekoder-mcp source; all config reads and writes go through `callTool`.
- [ ] The plugin never writes `~/.zekoder-mcp/config.json` or `.zekoder/config.json` directly.
- [ ] No new dependencies. No factory values anywhere in the plugin.
- [ ] No hardcoded provider outside the commented old-bundle `LEGACY_PROVIDER`.
- [ ] `SESSION_ROLE`, `IMPLEMENT_PROVIDER`, `VARIANT_HARNESS` and the `executionSnapshot` branch are gone.
- [ ] Old bundle: every agent-default control is disabled with "Needs a newer zekoder-mcp"; launches still work.
- [ ] `README.md` matches the behavior; `plugins/zekoder/package.json` version bumped once.
- [ ] Walkthrough step 1 passes; steps 2–12 pass once external dependency 1 ships.

## 01 — Tiered config model and repo Config panel

- [ ] Schemas, `AgentTab`, `ProviderOption` and `isStrictField` match `contracts.md` exactly.
- [ ] `setConfig` sends `scope`/`clear`/`agentDefaults` only with an `agentDefaults` patch.
- [ ] Every set value carries its source; unset shows "provider default"; `profile` shows its name.
- [ ] Reset clears only the repo field; changing provider clears the repo model/effort/mode in one patch, with leaf clear paths that never overlap a `set` path.
- [ ] Legacy `roleDefaults` schema still present, so the untouched launch code typechecks.
- [ ] Support detected via `sources.agentDefaults`; roster read from `roleDefaults.available`; flag name only in `MACHINE_SCOPE_FLAG`.
- [ ] Dropdowns sit under `Raise`/`Section`; layout works at compact width.

## 02 — Launch from the resolved binding

- [ ] Implement uses `coding`; Promote uses `planning`; Migrate uses only the planning provider.
- [ ] No provider on a supported bundle → `needs-onboarding`, not an error.
- [ ] Soft fields fall back silently; strict fields fail with the value and its source.
- [ ] `modeId` and `thinkingOptionId` are passed only when resolved.
- [ ] Codex gets `$skill`, others `/skill`; the Copy button text is unchanged.
- [ ] Role variants are written only for claude sessions and only for roles with a set field.
- [ ] No `roleDefaults.values` read anywhere; the followup-051 grep over `plugins/zekoder/` returns nothing.

## 03 — Machine Defaults tab and onboarding

- [ ] The tab lives on the global Zekoder page; no root is persisted; the transport project is named.
- [ ] `scope: "machine"` is sent only after the capability flag is seen on a plain read.
- [ ] Banner shows only while a machine planning or coding provider is unset on a supported bundle.
- [ ] Onboarding reuses `AgentDefaultsEditor`; Done re-runs the launch.
- [ ] Without the machine flag, launch shows the "Zekoder settings → Planning/Coding tab" message, no editor, no banner.
- [ ] Machine RPCs prefer the given `root` and stop at the first matching project.
- [ ] No Zekoder project open → clear empty state.
