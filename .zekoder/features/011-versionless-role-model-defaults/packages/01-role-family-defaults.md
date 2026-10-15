# Package 01 — Family defaults and launch resolution

**Branch:** `011-versionless-role-model-defaults-01-role-family-defaults`
**Worktree:** supervisor-provided, branched after feature 010 merges. Run `cd plugins/zekoder && npm ci` first.
**Depends on:** feature 010 (all three packages). **Consumes contract:** `model-family-resolver-cli`
(zekoder-skills provides it).

## Context

All paths under `plugins/zekoder/`. Read `docs/paseo-plugin-project-scope.md` before UI edits. These files are
as 010 leaves them; check the real code before you edit.

- `shared/config.ts`: `CLAUDE_TASK_MODELS` (`sonnet|opus|haiku|fable`, already the Claude families),
  `roleControls`, `roleBindingProblem`, 010's `AgentDefaults`, `ProviderOption` (with `models`),
  `isStrictField`.
- `client/agent-defaults.tsx` (010): `AgentDefaultsEditor`, session block model and effort dropdowns,
  roles block `RoleDropdowns`/`RoleTextInputs`. The effort list comes from the chosen model's efforts.
- `server/zekoder.ts` (010): `resolveLaunch(paseo, root, tab, {fieldsFromTab})`. Model: unset or
  `inherit` → provider default; else exact match in Paseo's selectable list; soft → default, strict →
  throw with value and source. Effort is checked on the chosen model.
- `server/role-variants.ts` (010): `materializeRoleDefaults(root, provider, roles)`, `run`
  (promisified `execFile`), `MATERIALIZE_TIMEOUT_MS`, the
  `.zekoder-execution-profiles/materialize-execution-profile.mjs` path. Reuse them for the resolver.
- Resolver CLI: `../contracts.md` `model-family-resolver-cli`.
- **One error string** for an old or missing resolver, used everywhere below:
  `Model <value> (from <source>): Needs a newer zekoder-skills (no --resolve-model).`

## Tasks

- [x] 1. **Family list** — `shared/config.ts`: add `MODEL_FAMILIES: Record<string, readonly string[]>`
  with `claude: CLAUDE_TASK_MODELS` and `codex: ["sol", "astra", "luna", "terra"]`, plus
  `isModelFamily(provider, model)` and `familyOf(provider, modelId)` (the family a native ID belongs
  to, or null: Claude `claude-<family>-…`, Codex `…-<family>`). No other provider has families.
- [x] 2. **Editor options** — `client/agent-defaults.tsx`: in the session block and the roles block,
  list the provider's families first (label `<family> (newest at launch)`), then `inherit`, then exact
  IDs. Claude task roles keep their closed list (`roleControls`). When the model is a family, the effort
  list is the union of efforts over that family's own models (`familyOf` match), with the hint
  "checked at launch". Keep stored unlisted values and the free-text fallback.
- [x] 3. **Resolver call** — `server/role-variants.ts`: add `resolveModelFamily(root, provider, family,
  source): Promise<string>`. Run the script with `--resolve-model <provider> <family>`; return the
  trimmed one-line stdout. Missing script, or stderr with `unknown flag: --resolve-model` → throw a
  `ResolverMissingError` with the one error string above. Other failures → throw with the script's
  stderr. Empty output, or output equal to the family → throw.
- [x] 4. **Session launch** — `server/zekoder.ts` `resolveLaunch`: when `isModelFamily(provider,
  model)`, call `resolveModelFamily` first. `ResolverMissingError` → always throw it, at any tier.
  Any other resolver error, or an ID Paseo does not list: soft → provider default; strict → throw
  "Model <family> (from <source>) could not be used for <provider>: <reason>." Then 010's exact
  match and effort check run on the resolved ID. Never write the resolved ID back to config.
- [x] 5. **Claude role pre-write** — `server/role-variants.ts` `materializeRoleDefaults`: for each role
  whose model is a family, call `resolveModelFamily(root, "claude", family, source)` and pass the resolved ID as the materializer's `<model>`. Any resolver error fails the launch
  (`ResolverMissingError` with the one error string). Exact IDs and `inherit` pass through unchanged. Extend 010's `materializeRoleDefaults` call in
  `startAgent` to also pass `sources.roles?.[provider]`, so each role field's source tier is there
  for the error text.
- [x] 6. **Docs** — `README.md` Zekoder settings and Implement/Promote text: family versus exact ID,
  "newest at launch", the resolver in zekoder-skills, and the "Needs a newer zekoder-skills" error.
- [x] 7. **Gate** — run the fast gate and `../get-started.md`; fix in-scope defects.

## Verification

- `cd plugins/zekoder && npm run typecheck`.
- `paseo plugin reload zekoder` (CLI may be at `/Applications/Paseo.app/Contents/Resources/bin/`),
  then reload the app window.
- Today's zekoder-skills (no `--resolve-model`): steps 1–2 and 5 of `../get-started.md`.
- With external dependency 1: all steps.

## Progress

- Status: implemented, ready for review
- Completed tasks: 7/7
- Gate: pass (npm run typecheck); get-started steps 1-7 need manual Paseo app check; steps 3-4, 6-7 also need zekoder-skills --resolve-model
- Reviewer notes: pending
