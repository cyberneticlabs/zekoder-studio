# Get started — 010-launch-button-defaults

## Prerequisites

- `cd plugins/zekoder && npm ci` (fresh worktrees have no `node_modules`).
- Paseo with claude and codex providers enabled.
- Paseo CLI: `paseo` on PATH, or `/Applications/Paseo.app/Contents/Resources/bin/paseo`.
- Steps 2–9 and 12 need a zekoder-mcp bundle with feature 023; steps 10–11 also need the
  machine-scope flag from followup 050 or feature 022 (external dependency 1). Step 1 runs on today's bundle (0.44.0).

## Run

```
cd plugins/zekoder && npm run typecheck
paseo plugin reload zekoder        # then reload the Paseo app window (client bundle)
```

## Manual walkthrough

1. **Old bundle.** Open Zekoder settings → Planning and Coding, and the Zekoder page → Defaults →
   every agent-default control is disabled with "Needs a newer zekoder-mcp"; no "Set up providers"
   banner. Press Implement on a planned item → a claude agent starts on the provider default model
   with `/zekoder-implement <id>`.
2. **Nothing set.** New bundle, empty tiers → each Planning/Coding field shows "provider default"; the
   Zekoder page shows the "Set up providers" banner.
3. **Repo write.** Coding tab: set provider codex, then a model, an effort and mode `full-access` →
   each shows `· repo`; the lists match codex; `.zekoder/config.json` holds `agentDefaults.coding`.
4. **Reset.** Reset the Coding model → it falls back to the machine value (with its label) or to
   "provider default".
5. **Roles.** Coding tab roles block (provider claude): set `zekoder-coding-agent` model and effort →
   `· repo`; Reset each field on its own.
6. **Implement.** With step 3 saved, press Implement → a codex agent with that model, effort and mode,
   first prompt `$zekoder-implement <id>`. Migrate starts on the planning provider with its own
   defaults.
7. **Promote.** Planning: provider claude, mode `acceptEdits` → Promote starts claude in
   `acceptEdits` with `/zekoder-promote <id>`; claude role variants exist only for roles with a set
   field.
8. **Soft vs strict.** Machine Coding model = a codex model, repo Coding provider = claude → Implement
   starts claude on its default model, and the panel marks the model "ignored: set for another
   provider". Then make a strict field the host lacks. The dropdown lists only host models, so set it
   from an agent session: `zekoder_set_config {scope: "repo", agentDefaults: {coding: {model:
   "no-such-model"}}}`. Or copy a model ID that exists only on another host. Implement fails, and
   the error names the model and `repo`.
9. **Profile.** With an active execution profile that sets `coding.mode` → the Coding tab shows
   `profile (<name>)` and the override hint; Implement uses that mode. An old item with an
   `executionSnapshot` launches like any other item.
10. **Machine tab.** Zekoder page → Defaults: the footer names the transport project. Set Planning
    provider codex → the repo Planning tab shows `codex · machine` unless the repo sets it;
    `~/.zekoder-mcp/config.json` changed (written by zekoder-mcp). Reset clears it. With no Zekoder
    project open → "Open a Zekoder project in Paseo first."
11. **Onboarding.** Clear every planning/coding provider (machine and repo). Press Promote → the
    onboarding modal opens; pick planning and coding providers, press Done → the agent starts. The
    banner disappears; the Defaults tab shows both providers with `· machine`.
12. **023 without the flag.** Bundle with 023 but no `capabilities.machineScopeRead`, no provider set
    anywhere → no banner; the Defaults tab is disabled with "Needs a newer zekoder-mcp". Press
    Implement → no editor opens; the message says to set the provider in this project's Zekoder
    settings → Coding tab. Set it there → Implement starts.

## Integration-test mapping

No test suite exists (the only gate is typecheck), so these steps stay manual.

| Step | Package | What it proves |
|---|---|---|
| 1 | 01, 02, 03 | Old-bundle degrade |
| 2–5 | 01 | Repo tier, sources, Reset, roles |
| 6–9 | 02 | Launch resolution, prompt, mode, soft/strict, profile, Migrate |
| 10–12 | 03 | Machine tier through zekoder-mcp, banner, onboarding, 023-only message |
