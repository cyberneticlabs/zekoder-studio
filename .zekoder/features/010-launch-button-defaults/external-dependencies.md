# External dependencies — 010-launch-button-defaults

These are text cross-references only, with no registry relations to other repos. Every package can merge before
these land. Until then, the plugin degrades to "Needs a newer zekoder-mcp" and today's claude launch. Walkthrough
steps 2–12 in `get-started.md` need dependency 1. Dependency 2 changes nothing in the plugin's
interfaces.

## 1. zekoder-mcp: `agentDefaults`, `scope`, `clear`, and the machine-only read

- **Type**: other-repo change · **Owner**: `cyberneticlabs/zekoder-mcp` maintainers
- **Blocks packages**: none for merge; 01, 02 and 03 for end-to-end verification
- **Related contract**: `agent-defaults-config-surface`
- **Details**:
  - Feature 023-launch-defaults-layered-config (decisions 003 and 004) is merged on zekoder-mcp
    `main` (`@zekoder/mcp` 0.47.0, commit `dc5f2bd`). It is not yet in the published bundle (the
    cache still has 0.44.0). It adds:
    - resolved `agentDefaults` with per-field `sources` (profile > repo > machine)
    - the new `executionProfiles {profiles, active?}` shape (the roster stays in `roleDefaults.available`)
    - `scope: "repo" | "machine"` and `clear` paths (clear and patch may not overlap at any level)
    - provider keys limited to `claude|codex|omp|opencode`; `locked` errors carry `retryAfterMs`
    - `roleDefaults` rejected on `zekoder_set_config`; migration 0012 moves old data to the new key

    The plugin reads whatever shape it returns and does no migration.
  - **Machine-only read**: two zekoder-mcp items define `zekoder_get_config {scope: "machine"}`:
    followup `050-machine-only-agent-defaults-read` (`{ok, scope, agentDefaults, machineConfigPath,
    warnings?}`; still an uncommitted draft in zekoder-mcp) and feature 022 contract
    `machine-config-surface` (no `cwd`; `{ok, scope, machineConfigPath, workflow?, agentDefaults?,
    executionProfiles?, supportedHarnessAgents?, telemetry, warnings?}`; no capability flag today).
    The plugin reads only `agentDefaults`, `machineConfigPath` and `warnings`, and ignores the rest.
    The plugin needs a capability flag on the plain `{cwd}` read (suggested
    `capabilities.machineScopeRead`, read through `MACHINE_SCOPE_FLAG`). **Whichever of 050 or 022
    lands first must add that flag.** Package 03 sends `scope: "machine"` only after it sees the
    flag. Without the flag, the Defaults tab and onboarding stay disabled. There is no fallback that
    filters the resolved read.
  - With 023 but without the flag, the plugin still works: no onboarding editor, and launches with
    no provider point the user to the repo Settings tabs.
  - **Interim transport.** Package 03 borrows the first open Zekoder project that reports the flag
    as its transport `cwd`. This is the interim approach for 010 only.
  - **022 external dependency 1 parts that 010 does NOT do.** zekoder-mcp 022 asks the plugin for:
    a Defaults tab that works with zero Paseo projects (its own machine MCP client: process cwd
    `ZEKODER_MCP_HOME` or `~/.zekoder-mcp`, no tool `cwd`, never `assertZekoderProject`), machine
    telemetry consent on that tab, and dropping the repo veto chip. All three go to one
    **recommended followup (to be filed)**, together with the `telemetry.vetoed` fix below. That
    followup replaces package 03's borrowed `cwd`. 022 external dependency 1 should be amended to
    say this work arrives in that followup, not in 010.
  - **No factory (text conflict to fix in zekoder-mcp).** The plugin ships no factory values (plugin
    ADR 002, amended). An absent `agentDefaults` field means: the provider's own default for a tab
    field, and the agent's own default (or `inherit`) for a role field. The wire stays the same
    (absent stays absent), so no code change is needed. But these zekoder-mcp texts still say the
    plugin fills absent fields from its factory, and need an amendment to match (not done yet):
    - ADR 004 (tiers "factory < machine < …", "an absent field means factory").
    - 023 `contracts.md` `agent-defaults-config-surface` ("the consumer fills absent fields from its
      own factory", "an absent leaf means 'factory' (consumer-owned)").
    - 023 external dependency 1 ("Paseo plugin owns factory values").
    - 022 `contracts.md` `machine-config-surface` ("absent field means use the plugin factory").
    - 022 external dependency 1 ("The plugin owns factory agent settings").
    - Also stale: followup 050 still calls 023 "(draft)"; 023 is merged.
  - **Risk: `telemetry.vetoed` removed by 022.** 022 removes `vetoed` from get_config `telemetry`,
    and makes the `telemetry` input on `zekoder_set_config` a quiet no-op. The plugin's
    `shared/config.ts` `telemetryStateSchema` requires `vetoed: z.boolean()` (used in
    `client/config-panel.tsx` :126, :139). After 022, every config read fails to parse, and the repo
    telemetry toggle does nothing. Not part of this feature: it goes to the same recommended
    followup (to be filed) as the 022 work above. It must land before 022 ships.
  - **Followup 051 (retire legacy compat).** 010 no longer blocks it. The plugin never reads
    `roleDefaults.values`. After package 02, the plugin must not match
    `fields.*executionSnapshot|roleDefaults\.values|experiments\.executionProfiles|executionProfiles: false|telemetry\.disabled`.
    It keeps reading `roleDefaults.available` (the roster, not compat; 051 keeps it).
  - **Risk: `roleDefaults` rejected by 023.** Once 0.47.0 is published, today's plugin role-default
    save (`server/config.ts` `setConfig`, a `roleDefaults` patch) fails with `validation-failed`.
    Package 01 replaces that write, so ship 01 soon after the bundle is published.

## 2. zekoder-skills: one resolver, pin removal, session-provider roles

- **Type**: other-repo change · **Owner**: `cyberneticlabs/zekoder-skills` maintainers
- **Blocks packages**: none
- **Related contract**: none (no plugin interface changes)
- **Details**: follows zekoder-skills decision `007-three-tier-agent-defaults`:
  - One single resolver reads the already-resolved `agentDefaults.roles[<session provider>]` from
    `zekoder_get_config`. It does not merge tiers.
  - The materializer takes the resolved binding as its input.
  - Claude and Codex family names (opus, sonnet, sol, …) are resolved in that one resolver (rule
    from decision 006). The `--resolve-model` CLI mode is proposed by feature 011 (contract
    `model-family-resolver-cli`) and is not yet in zekoder-skills.
  - Remove the agent-file `model:` pins. Per-item `executionSnapshot` goes away.
  - **No factory.** ADR 007 says the pins move into the plugin's factory `roles` and leaves a TODO
    on "how factory values reach the skills resolver". This settles it: they don't, because the
    plugin ships no factory. A role absent from `agentDefaults.roles` runs on the agent's own default
    (or `inherit`). ADR 007 needs an amendment to match (text reference only).
  - Keep `.zekoder-execution-profiles/materialize-execution-profile.mjs` accepting
    `claude <source> <role> role-default <root> <model|inherit> [--effort e]`. That includes
    `inherit` with an effort, which package 02 task 6 relies on.
