# External dependencies — 011-versionless-role-model-defaults

Text references only, no registry relations to other repos. Package 01 can merge before this lands.
Until then, any launch with a family set fails with "Needs a newer zekoder-skills".

## 1. zekoder-skills: `--resolve-model` CLI and family resolution for children

- **Type**: other-repo change · **Owner**: `cyberneticlabs/zekoder-skills` maintainers
- **Blocks packages**: none for merge; 01 for end-to-end verification
- **Related contract**: `model-family-resolver-cli`
- **Details** (follows skills ADR 006 and ADR 007):
  - Add the `--resolve-model <provider> <family> [--effort <e>]` mode to
    `scripts/materialize-execution-profile.mjs`, with the stdout and exit codes in `contracts.md`.
    Checked 2026-10-05: it does not exist yet. The installer copies the script to
    `<project>/.zekoder-execution-profiles/`, which is where the plugin calls it.
  - Codex: live `codex debug models`, selectable entries only, newest version first, stop on any doubt
    (ADR 006). If `codex` is not on the PATH of the process that runs the script (the Paseo daemon,
    for the plugin), fail with a clear `error: codex CLI not found on PATH` message.
  - Claude: also return a versioned ID (ADR 007 "one single resolver"). Skills picks the catalog
    source; the output must be an ID Paseo can launch (Paseo lists versioned IDs such as
    `claude-opus-5-5`; a bare `opus` appears only when Claude `settings.json` sets it).
  - Child roles: resolve a family from `agentDefaults.roles[<session provider>]` at spawn or
    materialization. Remove the "No provider translation" line in `runtime/role-defaults.md`.
  - **Claude role variants (pinned)**: the variant file is
    `<role>--role-default-<sha256({runtime, model, effort})[:8]>.md`. The plugin resolves a family
    with `--resolve-model claude <family>` and passes the resolved ID to
    `claude <source> <role> role-default <root> <model> [--effort e]`. Skills must do the same
    in-session: resolve first, then materialize and hash the resolved ID. Otherwise the file names
    differ and Claude Code, which loads agents only at session start, does not find the variant.
  - The snapshot clause of ADR 006 no longer applies (ADR 007).
- **zekoder-mcp**: no change needed. It stores model names as given and only checks for nonempty
  strings (mcp ADR 004 point 10, feature 023, merged on main as 0.47.0, not yet published).
