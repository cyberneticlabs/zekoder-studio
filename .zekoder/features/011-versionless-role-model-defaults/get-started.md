# Get started — 011-versionless-role-model-defaults

## Prerequisites

- Feature 010 merged; a zekoder-mcp bundle with `agentDefaults` (feature 023).
- Paseo with claude and codex providers enabled and ready; a Zekoder project open.
- The `codex` CLI on the PATH of the Paseo daemon (the resolver runs `codex debug models`).
- Steps 3–4 and 6–7 need zekoder-skills with `--resolve-model` (external dependency 1).

## Run commands

```bash
cd plugins/zekoder
npm ci
npm run typecheck
paseo plugin reload zekoder
```

## Manual walkthrough

1. Project Settings → Coding tab, provider `codex`. Open the model dropdown → `sol`, `astra`, `luna`,
   `terra` show first, then `inherit`, then exact IDs. Pick `sol` → the effort list shows only efforts
   of `gpt-*-sol` models. Reopen → `sol · repo` shows.
2. Planning tab, provider `claude`, model `opus`; in the roles block set one role to `sonnet` → both
   save as family names. The machine Defaults tab shows the same family options.
3. Implement an item (coding = codex `sol`) → the agent starts on the newest listed `gpt-*-sol` model.
   Config still shows `sol`.
4. Promote an idea (planning = claude `opus`, one role `sonnet`) → the agent starts on a versioned Opus
   ID such as `claude-opus-5-5`, and `.claude/agents/` gets a role-default variant written for the
   resolved Sonnet ID.
5. With today's zekoder-skills (no `--resolve-model`): set `opus` at any tier (repo or machine) →
   Promote fails with `Model opus (from <tier>): Needs a newer zekoder-skills (no --resolve-model).`
   The same happens with only a role set to a family.
6. With the new resolver, set the provider at repo tier and a machine-tier family the resolver cannot
   match → the launch starts on the provider default (soft field skipped). Set the same family at repo
   tier → the launch fails and names the value, source and reason.
7. Set a strict effort the resolved model does not offer → the launch fails and names the effort and
   its source. The resolver never picks an older model to fit the effort.

## Integration-test mapping

| Walkthrough step | Automated test |
|---|---|
| 1–2 | needs manual Paseo UI check |
| 3–7 | needs manual Paseo launch check; resolver logic tested in zekoder-skills (dependency 1) |
