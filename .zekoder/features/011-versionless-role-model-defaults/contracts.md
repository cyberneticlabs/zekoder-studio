# Contracts — 011-versionless-role-model-defaults

No internal contract: one package. 010's `agent-defaults-client-model`, `agent-defaults-editor` and
`launch-result` are reused as they are; no field is added.

## model-family-resolver-cli

- **Type**: cross-system · **Counterpart**: `cyberneticlabs/zekoder-skills` (ADR 006, ADR 007)
- **External dependency**: 1
- **Owner**: zekoder-skills provides this CLI. **Consumer**: package 01 calls it. (The registry field
  `owner` takes a package id, so it says `01`: read it as "the package that depends on this
  contract", not the side that builds it.)
- **Status**: proposed. `--resolve-model` is not in `scripts/materialize-execution-profile.mjs` yet.
- **Call** (the plugin runs it from the project root, timeout 30 s):

  ```
  node <root>/.zekoder-execution-profiles/materialize-execution-profile.mjs \
    --resolve-model <provider> <family>
  ```

  - `<provider>`: `claude` or `codex`. `<family>`: `opus|sonnet|haiku|fable` (claude) or
    `sol|astra|luna|terra` (codex).
  - Optional `--effort <e>` exists for skills' own task-role spawns (ADR 006: pick newest first, then
    check effort). The plugin does not send it; it checks effort itself (010 soft/strict rule).
  - The plugin calls it only for a family name. Exact IDs and `inherit` never go to the resolver.
- **Success**: exit code 0. stdout is one line: the versioned native model ID (for example
  `claude-opus-5-5`, `gpt-6-sol`). Never the bare family. No other stdout.
- **Failure**: exit code not 0. stderr starts `error: ` and gives the reason (catalog failed, `codex`
  not found on PATH, no match, tied or unparseable top version, unknown family). The plugin shows it
  as given.
- **Old script**: today's script rejects the flag with `error: unknown flag: --resolve-model` and exit
  1. A missing script or that text always fails the launch (any tier) with
  `Model <value> (from <source>): Needs a newer zekoder-skills (no --resolve-model).`
- **Claude role variants**: the variant file is `<role>--role-default-<sha256({runtime, model,
  effort})[:8]>.md`. Before the plugin's pre-write, it resolves a family with this CLI and passes the
  resolved ID as `<model>` to the materializer. Skills must do the same in-session: resolve first, then
  hash the resolved ID. Same family + same catalog → same file name on both sides.
- **Rules**: same input and same catalog → same output. The resolver reads the live provider catalog;
  it never falls back to an older version, another family, or a default model.
