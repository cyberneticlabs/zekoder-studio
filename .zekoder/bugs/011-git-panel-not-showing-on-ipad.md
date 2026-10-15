---
id: 011-git-panel-not-showing-on-ipad
type: bug
title: Git panel not showing on iPad
status: merged
createdAt: 2026-10-15
openedAt: 2026-10-15T15:15:30.484Z
updatedAt: 2026-10-15T15:20:39.546Z
completedAt: 2026-10-15T15:20:29.856Z
severity: medium
branch: bug-011-git-panel-not-showing-on-ipad
promoted: false
packages: []
filesTouched:
  - .zekoder/bugs/011-git-panel-not-showing-on-ipad.md
  - docs/paseo-plugin-explorer-panel.md
  - plugins/zekoder/client/agent-branch-pills.ts
  - plugins/zekoder/client/git-tab.ts
  - plugins/zekoder/client/panel-location.ts
  - plugins/zekoder/index.client.tsx
relatedFeatures: []
relatedBugs: []
relatedFollowups: []
resolvedBy: null
statusHistory:
  - from: planned
    to: merged
    at: 2026-10-15T15:20:29.856Z
---
> Imported from cyberneticlabs/zekoder-plugins bug 001-git-panel-not-showing-on-ipad (feature 008-plugin-source-consolidation).

# Bug 011-git-panel-not-showing-on-ipad: Git panel not showing on iPad

## Summary

On iPad (installed app / PWA) the Git header button shows, but tapping it opens no Git panel.

## Repro steps

1. Open Paseo as the installed app / PWA on an iPad.
2. Open a git workspace. The "Open Git panel" header button is visible.
3. Tap the Git header button.

## Expected vs. actual

- **Expected**: Git panel opens (as on desktop, in the right-hand explorer panel).
- **Actual**: Nothing opens. No panel appears.

Works on desktop in the same project.

## Root cause

Not reproduced on a device (no iPad available to the coding agent). Hypothesis below is supported by code reading only: the plugin registered the Git panel for `"explorer"` only and always opened it there; no plugin code checks for a compact layout; the host (Paseo, not in this repo) decides whether the explorer panel is visible. The fix opens the panel in the main pane (`"workspace"`) when the window is narrow (< 1024 px, `plugins/zekoder/client/panel-location.ts`), which works whichever way the host handles the explorer. Needs on-device confirmation (see Verification). Original hypothesis:

- The button handler calls `client.openPanel(GIT_PANEL_ID, { workspaceId, location: "explorer" })` in `plugins/zekoder/client/git-tab.ts` (`open`, line 17-18). The panel is registered with `locations: ["explorer"]` only, in `plugins/zekoder/index.client.tsx` (the `addWorkspacePanel` call for `GIT_PANEL_ID`).
- On a compact layout (iPad portrait / split view, where Paseo passes `layout.compact === true`), the right "explorer" panel is probably collapsed or not mounted. Opening a panel into it then has no visible effect. The host code that decides this lives in the Paseo app, not in this repo (`docs/paseo-plugin-explorer-panel.md` cites `resolvePluginPanelOpenLocation` / `pluginPanelSupportsLocation`, verified only on Paseo 0.10.1 desktop).
- The same `location: "explorer"` call is also used in `plugins/zekoder/client/agent-branch-pills.ts` (line 65), so the pills likely fail the same way.
- `plugins/zekoder/client/git-panel.tsx` has no tablet/touch/hover gating (no `compact`, `Platform` or hover use), so the panel component itself is not the suspect.

First step of the fix: reproduce on iPad (or a narrow browser viewport) and confirm the hypothesis. If the cause is entirely inside the Paseo host, re-file the host part as a vendor issue and keep only a plugin workaround here.

## Fix approach

Make the Git panel openable from the main pane when the explorer panel is not available (compact layout).

- `plugins/zekoder/index.client.tsx`: register the Git panel with `locations: ["workspace", "explorer"]` so it may open in the main pane too (per `docs/paseo-plugin-explorer-panel.md` table).
- `plugins/zekoder/client/git-tab.ts`: in `open`, choose `location: "workspace"` when the layout is compact, else `"explorer"`. The header button `onPress` receives no layout, so detect compact another way (approximate - confirm during planning: viewport width via react-native `Dimensions`/`useWindowDimensions` or a shared helper matching Paseo's compact breakpoint).
- `plugins/zekoder/client/agent-branch-pills.ts`: apply the same location choice to its `openPanel` call.
- Put the compact check in one small shared helper (e.g. `plugins/zekoder/client/panel-location.ts`, new file) so both callers use it.
- `plugins/zekoder/client/git-panel.tsx`: use `props.layout.compact` if the wide main-pane layout needs adjusting (graph lanes, row sizes).

## Tasks

- [ ] Reproduce on iPad or at a narrow/compact viewport; confirm `openPanel(..., { location: "explorer" })` is a no-op there. Record the finding in this doc's Root cause.
- [x] `plugins/zekoder/index.client.tsx`: change Git panel `locations` to `["workspace", "explorer"]`.
- [x] Add `plugins/zekoder/client/panel-location.ts` with a helper returning `"workspace"` on compact layout, else `"explorer"`.
- [x] `plugins/zekoder/client/git-tab.ts`: use the helper in `open()`.
- [x] `plugins/zekoder/client/agent-branch-pills.ts`: use the helper in its `openPanel` call (line ~65).
- [ ] `plugins/zekoder/client/git-panel.tsx`: check the layout in the main pane; adjust only if broken.
- [x] Update `docs/paseo-plugin-explorer-panel.md` with a short gotcha: explorer location may not show on compact layouts.

## Verification

- `cd plugins/zekoder && npm run typecheck` passes.
- `paseo plugin reload zekoder`, then reload the app window.
- On iPad (or a compact-width browser window): tap the Git header button. The Git panel opens and shows worktrees, branches and the graph.
- On desktop: the button still opens the Git tab in the right panel next to Files / Changes.
- Branch pills in agent view also open the Git panel on iPad.
