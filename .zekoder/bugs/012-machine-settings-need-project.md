---
id: 012-machine-settings-need-project
type: bug
title: Machine-scoped Defaults and Telemetry tabs unusable with no Zekoder project open
status: merged
createdAt: 2026-10-15
openedAt: 2026-10-15T15:15:33.996Z
updatedAt: 2026-10-15T15:20:51.005Z
completedAt: 2026-10-15T15:20:51.005Z
severity: medium
branch: bug-012-machine-settings-need-project
promoted: false
packages: []
filesTouched:
  - plugins/zekoder/client/machine-defaults-panel.tsx
  - plugins/zekoder/client/telemetry-panel.tsx
  - plugins/zekoder/server/config.ts
  - plugins/zekoder/server/telemetry.ts
  - plugins/zekoder/server/zekoder.ts
relatedFeatures: []
relatedBugs: []
relatedFollowups: []
resolvedBy: null
statusHistory:
  - from: planned
    to: merged
    at: 2026-10-15T15:20:51.005Z
---
> Imported from cyberneticlabs/zekoder-plugins bug 002-machine-settings-need-project (feature 008-plugin-source-consolidation).

# Bug 012-machine-settings-need-project: Machine-scoped Defaults and Telemetry tabs unusable with no Zekoder project open

## Summary

The Zekoder plugin's machine-scoped Defaults and Telemetry tabs cannot read or change values when no Paseo project containing `.zekoder/` exists.

## Repro steps

1. Use a fresh machine, or one with no Paseo project whose root contains a `.zekoder/` dir.
2. Open the Zekoder plugin settings in Paseo.
3. Open the Defaults tab: it shows "Open a Zekoder project in Paseo first."
4. Open the Telemetry tab: it shows "Open a Zekoder project in Paseo to change telemetry."
5. Open the Version tab: it shows "No Paseo projects yet."

## Expected vs. actual

- **Expected**: Telemetry consent and agent defaults are per-machine. The zekoder-mcp tools `zekoder_telemetry` and `zekoder_get_config {scope: "machine"}` are machine-only and need no repo, so both tabs work with zero projects open.
- **Actual**: Both tabs show a hint and cannot read or write values.

## Root cause

The plugin has no MCP transport of its own; it borrows a project's zekoder-mcp. Confirmed locations (all under `plugins/zekoder/`):

- `plugins/zekoder/server/telemetry.ts:7` `transportRoot()` returns null when `zekoderProjects()` is empty; `:35` `setTelemetry` throws "Open a Zekoder project in Paseo first."; `getTelemetry` returns state null.
- `plugins/zekoder/server/config.ts:155` `machineTransportRoot()` has the same limit; `:189` used by `getMachineDefaults`; `:236` `setMachineDefaults` throws.
- `plugins/zekoder/server/zekoder.ts:468` `zekoderProjects()` lists only Paseo projects whose root has `.zekoder/`; `:486` `callTool(root, ...)`; `:506` `resolveServer(root)` is keyed per project root, reads that project's `.mcp.json`, and falls back to `ZEKODER_MCP_BUNDLE || DEFAULT_BUNDLE` (`:36`, used at `:510`).
- UI hints: `plugins/zekoder/client/telemetry-panel.tsx:41`, `plugins/zekoder/client/machine-defaults-panel.tsx:103`.
- `plugins/zekoder/client/version-panel.tsx:130` "No Paseo projects yet." is the per-project install list; likely informational only.

## Fix approach

Add a project-less transport. When no project exists, launch zekoder-mcp through the fallback bundle (`ZEKODER_MCP_BUNDLE` or `DEFAULT_BUNDLE` shared cache, same as `resolveServer`) with a neutral cwd (e.g. `$HOME`), and use it for machine-tier calls only (telemetry + machine defaults).

- `plugins/zekoder/server/zekoder.ts`: add a machine-level call path (e.g. `callMachineTool`) that reuses the bundle fallback with a neutral cwd. All MCP talk stays through `plugins/zekoder/server/mcp-client.ts` (guardrail).
- `plugins/zekoder/server/telemetry.ts` and `plugins/zekoder/server/config.ts`: when no project root is found, use the machine transport instead of returning null / throwing.
- `plugins/zekoder/client/telemetry-panel.tsx` and `plugins/zekoder/client/machine-defaults-panel.tsx`: drop or reword the "Open a Zekoder project" hints; show a clear error only if the bundle itself is missing (not installed).
- `plugins/zekoder/client/version-panel.tsx`: verify only; change only if affected.

Note: a second, diverged copy of this plugin exists at `/Users/ahmedelshalaby/Code/zekoder/apps/plugins/zekoder` (shipped as non-removable built-in v0.11.1, apps commit 1b6694c1f). The same bug is there (`apps/plugins/zekoder/server/telemetry.ts:7/:35`, `apps/plugins/zekoder/server/config.ts:155/:236`). That copy is now the single in-repo source `plugins/zekoder/`.

## Tasks

- [ ] Add a project-less machine MCP transport (bundle fallback, neutral cwd) in `plugins/zekoder/server/zekoder.ts`, going through `plugins/zekoder/server/mcp-client.ts`.
- [ ] Use it in `plugins/zekoder/server/telemetry.ts` (`transportRoot`, `getTelemetry`, `setTelemetry`) when no project exists.
- [ ] Use it in `plugins/zekoder/server/config.ts` (`machineTransportRoot`, `getMachineDefaults`, `setMachineDefaults`) when no project exists.
- [ ] Update `plugins/zekoder/client/telemetry-panel.tsx` and `plugins/zekoder/client/machine-defaults-panel.tsx` hints and the "Saved through zekoder-mcp of ..." label for the no-project case.
- [ ] Check `plugins/zekoder/client/version-panel.tsx:130`; change only if affected.
- [ ] Run `cd plugins/zekoder && npm run typecheck`.

## Verification

- `cd plugins/zekoder && npm run typecheck` passes.
- With zero Paseo projects containing `.zekoder/` (and the bundle installed in the shared cache), reload the plugin (`paseo plugin reload zekoder`): Telemetry tab shows status and can toggle consent; Defaults tab loads and saves machine defaults.
- With a project open, behavior is unchanged.
- With no bundle installed, a clear "not installed" error shows instead of the old project hint.
