---
id: 012-omp-provider-settings
type: feature
title: OMP provider settings panel
status: planned
createdAt: 2026-10-15
openedAt: 2026-10-15T15:15:23.846Z
updatedAt: 2026-10-15T15:20:57.472Z
branch: feature-012-omp-provider-settings
promoted: false
dependsOn: []
packages: []
contracts: []
relatedFeatures: []
relatedBugs:
  - 012-machine-settings-need-project
relatedFollowups: []
statusHistory: []
---
> Imported from cyberneticlabs/zekoder-plugins feature 022-omp-provider-settings (feature 008-plugin-source-consolidation). Needs re-plan against zekoder-studio before execution.

# Feature 022-omp-provider-settings: OMP provider settings panel

> **Light-tier plan.** One area, one branch, one document — no `packages/` folder, and no separate
> contracts or external-dependencies docs. (Doc is ~120 lines, above the ~100 target: the read/write
> safety rules below are load-bearing.)

## User's request (verbatim)

Title: "OMP provider settings panel". Clarification answers (verbatim):

> A Paseo plugin UI to manage OMP provider settings in ~/.omp/agent/models.yml. OMP only for now.
> Design an adapter interface so other harnesses (Claude settings.json, Codex config.toml, opencode
> json) can be added later.
> Edit scope: full edit. Add/remove providers. Edit baseUrl, api, apiKey. Add/remove model ids. Keep
> unknown keys (e.g. discovery) as they are.
> Test connection: yes, test + import. Call <baseUrl>/models with the key, show OK/error, and let the
> user add the model ids it finds.
> Placement: new "Providers" tab in the settings panel (next to Basic/Planning/Coding,
> paseo/client/config-panel.tsx). Machine-wide: must work with NO project open.
> Location: Machine settings.
> Tab: "new tab (Providers), within it show drop down to switch between provides since each has its
> won config set"
> apiKey can be an env-var name or command, not only a literal key.
> Test with stored key: only same URL.

**Placement moved (user confirmed):** `config-panel.tsx` is a workspace panel and needs a project, so
the tab goes on the machine-wide Zekoder page (`paseo/client/zekoder-surface.tsx`), next to
Defaults/Telemetry.

## Refined scope

- Zekoder page tab **Providers**. Top: a harness dropdown, filled from the server's adapter registry
  (today only "OMP"). Below: the selected harness's editor. Works with zero projects (no MCP call).
- OMP editor, full edit of `providers.<name>`: add/remove providers; edit `baseUrl`, `api`, `apiKey`;
  add/remove `models[].id`. Everything else is kept: comments, key order, `discovery`, unknown keys,
  unknown `api` values, model items with extra keys.
- apiKey forms (OMP `resolveConfigValue`, `pi-coding-agent/src/config/resolve-config-value.ts`):
  starts with `!` = shell command; else the value is used as an env-var name if that env var is set;
  else literal. Commands and env-var names are shown as-is; only literal keys are masked.
- Test: `GET <baseUrl>/models`, show OK/error, offer found ids as one-tap "add model".
- Safe write (`.bak`, temp + rename, mode kept, symlink-safe), mtime conflict check, restart note.

## Out of scope

- Claude / Codex / opencode adapters (only the interface; dropdown lists them once registered).
- Renaming an existing provider (remove + add). Editing `discovery` or other unknown keys.
- Taking OMP's `config.yml.lock` (mtime check is the guard). Running `!command` keys during Test.
- Bug 002-machine-settings-need-project. Re-syncing the `apps/plugins/zekoder` copy.

## Approach

- **Dependency (human-review gate):** `yaml` `^2.9.1` (Document API keeps comments/order). Today only
  transitive (`react-native > metro-config > yaml@2.9.1`). Add it in the same `package.json` section as `zod`.
- **`paseo/shared/providers.ts`** (new), style of `shared/telemetry.ts`:
  - `harnessSchema = z.string()`; `zekoder.providers.harnesses {}` -> `{harnesses: {id, label}[]}`.
  - Key shape: `ApiKeyView = null | {kind: "literal", mask} | {kind: "env", name} | {kind: "command", command}`.
    Detection: `!` prefix -> command; matches `^[A-Za-z_][A-Za-z0-9_]*$` and is ALL-CAPS -> env (display-only heuristic;
    OMP's real rule is 'env var with that name is set', which the plugin can't see; literal keys are
    rarely all-caps identifiers); else literal. Mask = `••••` + last 4 chars (`••••` only if length ≤ 8).
  - Lenient read: `ProviderEntry {name, baseUrl?: string, api?: string, key: ApiKeyView, models: string[]}`.
    Every provider in the file is returned; non-string fields come back `undefined` and are never rewritten.
  - `ProvidersState {harness, path, exists, mtimeMs: number | null, providers}` (`null` = no file).
  - `zekoder.providers.get {harness}` -> state.
  - `zekoder.providers.set {harness, expectedMtimeMs: number | null, upserts: {name, baseUrl?, api?,
    apiKey?, models}[], removed: string[]}` -> `{status: "saved" | "conflict", state}`. `apiKey` absent = keep.
  - `zekoder.providers.test {harness, name?, baseUrl, apiKey?}` -> `{ok, error?, modelIds: string[]}`.
- **`paseo/server/providers.ts`** (new): `interface HarnessAdapter { id; label; path(); read();
  write(input); test(input) }`; `ADAPTERS: Record<string, HarnessAdapter>` with one OMP adapter
  (`join(homedir(), ".omp/agent/models.yml")`); unknown harness id -> error.
  - Read: `parseDocument`; `stat` -> `mtimeMs`; no file -> `exists: false`, `mtimeMs: null`, empty list.
  - Write, conflict first: current mtime (or `null` if absent) ≠ `expectedMtimeMs` -> `conflict` +
    fresh state, no write. Covers "file changed" and "file appeared since read".
  - Edit the same Document: `deleteIn(["providers", n])` only for `removed` names that exist; for each
    upsert, `setIn` a scalar only when it differs from the stored value (inline comments stay); models:
    keep existing seq items whose `id` stays and any item without a string `id`, drop removed ids,
    append `{id}` for new; `apiKey` only if given. Providers not named in `upserts`/`removed` untouched.
  - Save: `target = await realpath(path)` (if it exists; symlink-safe); `mkdir -p` dir; `copyFile` ->
    `<target>.bak`; write `<target>.tmp-<pid>` with original `stat.mode` (`0o600` for a new file);
    `rename` over `target` (pattern `paseo/server/version.ts:267-276`).
  - Test: URL = `baseUrl` with trailing `/` stripped + `/models`. Key: typed `apiKey`, else the stored
    key of `name` ONLY if the request `baseUrl` equals the stored `baseUrl`; otherwise error "Type the
    key to test a new URL". Stored env form -> `process.env[name]` of the Paseo daemon (error if unset);
    stored command form -> error "Command keys cannot be tested; type the key". `Authorization: Bearer`,
    `AbortSignal.timeout(10_000)`; parse `{data: [{id}]}`; error text never contains the key.
  - Register the four handlers in `paseo/index.server.ts` next to `getTelemetryRpc`.
- **`paseo/client/providers-panel.tsx`** (new): `ProvidersPanel({theme})`, react-query like
  `telemetry-panel.tsx`; reuse `Dropdown` (`client/dropdown.tsx`), `Section` (`agent-defaults.tsx`),
  `Chip`, `Button`, `inputStyle`. Harness dropdown on top. One card per provider: name (editable only
  when new), baseUrl, api chips `openai-completions` / `openai-responses` (an unknown value shows as a
  selected extra chip and is sent back unchanged), key field (placeholder = mask / env name / command;
  empty = keep), model chips with remove, add-model input, Test + found ids as add chips. Remove marks
  the name in `removed`. Save -> conflict: reload form + warning; success: "OMP may need a restart".
- **`paseo/client/zekoder-surface.tsx`**: add tab `{id: "providers", label: "Providers"}` after Telemetry.
- **`paseo/README.md`**: short "Providers" section + Layout list entries.

## Related work considered

- Bug **002-machine-settings-need-project** — related, separate. No MCP call here, so the tab works
  with zero projects without that fix. Not folded (different files, own verification).
- Decision **001-three-tier-agent-defaults** (accepted) — forbids direct plugin writes to
  `~/.zekoder-mcp/config.json`. Not touched: `models.yml` is OMP's own file. Followed.
- Features 020/021 (merged) — Zekoder agent defaults; context only.

## Tasks

- [ ] **Human review first:** add `yaml` `^2.9.1` to `paseo/package.json` (same section as `zod`); `npm install` updates `paseo/package-lock.json`.
- [ ] Create `paseo/shared/providers.ts` (lenient schemas, key view, four RPCs).
- [ ] Create `paseo/server/providers.ts` (adapter interface + registry, OMP adapter: read/detect/mask, conflict check, safe write, test) and register handlers in `paseo/index.server.ts`.
- [ ] Create `paseo/client/providers-panel.tsx` (harness dropdown, editor, test + import, save, conflict warning, restart note).
- [ ] Add the Providers tab in `paseo/client/zekoder-surface.tsx`.
- [ ] Update `paseo/README.md` (Providers section, Layout list).
- [ ] Run `cd paseo && npm run typecheck`.

## Verification

- `cd paseo && npm run typecheck` passes.
- `paseo plugin reload zekoder` + reload the app window. With no project open: Zekoder page ->
  Providers; dropdown shows "OMP"; providers from `~/.omp/agent/models.yml` listed.
- Literal keys show masked; an env-var name and a `!command` key show as-is.
- Edit `baseUrl`, add a model, save: comments, key order and `discovery` kept; `models.yml.bak`
  exists; file mode unchanged; untouched providers byte-identical; restart note shows.
- A provider with an unknown `api` value survives a save unchanged.
- Save without typing a key: stored `apiKey` unchanged. Type a new key: it is written.
- Change the file elsewhere (or create it after an empty read), then save: conflict warning, form
  reloads, file not overwritten.
- `models.yml` as a symlink: save writes the link target; the link stays.
- Test with stored key and same URL: OK + ids; one tap adds an id. Changed URL without a typed key:
  "Type the key" error. Bad URL/key: error shown, no key in text.
- No `models.yml`: empty state; adding a provider creates the file with mode `0600`.
