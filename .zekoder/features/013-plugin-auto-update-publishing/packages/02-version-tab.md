# Package 02 — Version tab plugin card

- **Branch**: `013-plugin-auto-update-publishing-02-version-tab`
- **Depends on**: 01 (imports `PLUGIN_VERSION`)
- **Contracts**: consumes `plugin-version-constant` and `builtin-plugin-update-status` (Studio 004 owns and implements it; see `../contracts.md`)

## Worktree setup

```bash
git worktree add ../worktrees/023-02 -b 013-plugin-auto-update-publishing-02-version-tab main   # after 01 is merged
cd ../worktrees/023-02/paseo && npm ci && npm run typecheck
```

Read `docs/paseo-plugin-project-scope.md` and `docs/paseo-plugin-explorer-panel.md` first.

## Context

- The Version tab exists: `plugins/zekoder/client/zekoder-surface.tsx:51,60` mounts `VersionPanel` (`plugins/zekoder/client/version-panel.tsx`), host-scoped, no project needed. Today it shows only the zekoder skills/MCP install. **Do not change** `versionStatusSchema`, its RPCs or the skills update logic; add a separate card.
- RPC pattern: `defineRpc` in `plugins/zekoder/shared/version.ts:70`, `server.handle(...)` in `plugins/zekoder/index.server.ts:50`, handler `(input, { paseo })`, client `useRpc` + react-query (`VERSION_POLL_MS`).
- `@getpaseo/plugin` 0.9.2 `PaseoApi` has no `pluginUpdates`. Use a local structural type and feature-detect: `const api = (paseo as unknown as { pluginUpdates?: { status?: (pluginId: string) => Promise<unknown> } }).pluginUpdates; typeof api?.status === "function"`. No dependency bump.
- Status shape is Studio's flat, confirmed `BuiltinPluginUpdateStatus` (contracts). Required: `pluginId`, `runningVersion`, `source`; everything else optional. Codes are open strings. Local type names may mirror the `BuiltinPluginUpdate*` prefix.
- The plugin **never** restarts anything: no restart button, no restart RPC, no restart feature-detect. Channel comes from the desktop app; only display `channel`.
- UI idioms to reuse from `version-panel.tsx`: card style (`surface1`, border, radius 8), muted 12px text, `statusDanger`/`statusWarning`, `new Date(iso).toLocaleString()`, `Button`. No new primitives.

## Tasks

- [ ] 1. `plugins/zekoder/shared/version.ts`: add `builtinPluginUpdateStatusSchema` — zod, **tolerant**, `.passthrough()`: required `pluginId`, `runningVersion`, `source` (all `z.string()`, unknown source shown as text); `.nullish()` for `stagedVersion`, `restartRequired` (bool), `fallbackReason` (string), `lastCheckAt`, `lastError {code: string, message: string, at: string}`, `bundledVersion`, `latestAvailable`, `channel` (string), `enabled` (bool). Add `pluginVersionViewSchema = { pluginVersion: string, host: "reports" | "absent" | "error", status: builtinPluginUpdateStatusSchema | null, restartRequired: boolean, error: string | null }` and `pluginVersionRpc = defineRpc({ name: "zekoder.version.plugin", ... })`.
- [ ] 2. `plugins/zekoder/server/version.ts`: `pluginVersionStatus(_input, { paseo })` → feature-detect `status`; absent, or result `null`/`undefined` → `host: "absent"`. Call `api.status("zekoder")` (plain string, Studio's signature). Studio returns `BuiltinPluginUpdateStatus[]`; tolerate a single object too. If an array, pick `pluginId === "zekoder"` (none → `absent`); `safeParse`; throw or parse failure → `host: "error"` with `errorText(...)` (`plugins/zekoder/shared/errors.ts`). `restartRequired` = `status.restartRequired` if boolean (Studio's final flag, includes rollback to bundled), else fallback `!!stagedVersion && stagedVersion !== runningVersion`. Never throws.
- [ ] 3. `plugins/zekoder/index.server.ts`: `server.handle(pluginVersionRpc, pluginVersionStatus)` next to the other version handlers.
- [ ] 4. `plugins/zekoder/client/version-panel.tsx`: add a `PluginVersionCard` at the top of `VersionPanel`, polling `pluginVersionRpc` every `VERSION_POLL_MS`. Rows:
  - "Zekoder plugin": `status.runningVersion` (else `pluginVersion`) + source label `Bundled` / `Downloaded` / `Unknown`.
  - `host: "absent"` → muted "Unknown — host does not report plugin updates. Running the installed copy."
  - `status.enabled === false` → muted "Updates are managed by the desktop app"
  - When reported: channel (display only), "Bundled version", "Latest available", "Last check" (`lastCheckAt`, else "never") — each only when present.
  - `restartRequired` → `statusWarning` "Restart the daemon to apply (Settings → Host → Restart daemon)". Text only, no button.
  - `lastError` → `statusDanger` `<code>: <message>` with time; `fallbackReason` → `statusWarning` "Using bundled copy: <reason>" (`previously-failed` → "Using bundled copy: v<x> failed to start before; waiting for a newer version" when known, raw text otherwise); `host: "error"` → `statusDanger` with `error`.
- [ ] 5. `plugins/zekoder/README.md`: Version tab section (~:91-125) describes the plugin card, the unknown / desktop-managed states and the restart hint (plugin never restarts; channel comes from the desktop app); file map notes `shared/plugin-version.ts`.

## Verification

- `cd plugins/zekoder && npm run typecheck` passes.
- `paseo plugin reload zekoder` in plain Paseo (no `pluginUpdates`): Version tab shows "Zekoder plugin 0.12.0 · Unknown" and "Unknown — host does not report plugin updates"; skills section unchanged; no console error.
- Temporary local stub (not committed) for `pluginUpdates.status(pluginId)` in `pluginVersionStatus` (assert it receives the string `"zekoder"`):
  - (a) full status, `source:"downloaded"`, `lastError`, `latestAvailable` → all rows render.
  - (b) `enabled:false` → "Updates are managed by the desktop app".
  - (c) `restartRequired:true` (with `stagedVersion:"0.13.0"`, and again with no `stagedVersion`, `source:"downloaded"`, rollback after revoke) → "Restart the daemon to apply (Settings → Host → Restart daemon)"; no button. `restartRequired:false` with `stagedVersion` ≠ `runningVersion` → no row (flag wins).
  - (d) no `restartRequired`, `stagedVersion` ≠ `runningVersion` → restart row derived; equal → no row.
  - (e) `fallbackReason:"previously-failed"`, and an unknown code `"foo-bar"` + extra field → shown verbatim, no error.
  - (f) array `[ {pluginId:"other", ...}, {pluginId:"zekoder", ...} ]` (Studio's real shape) → picks zekoder, renders; single object → renders; `{}` → `host: "error"`, no crash; `null` → Unknown line.
  - Remove the stub before commit (`git diff` shows none).

## Progress

- [ ] Tasks done · [ ] Verification done · [ ] Ready for review
