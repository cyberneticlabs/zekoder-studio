---
id: 017-unified-release-channel
type: feature
title: Unified release channel and update-restart notice
status: planned
createdAt: 2026-10-15
openedAt: 2026-10-15T18:37:37.309Z
updatedAt: 2026-10-15T19:46:54.995Z
promoted: true
dependsOn:
  - 013-release-channel-change-not-propagated
packages:
  - id: "01"
    name: daemon-channel
    file: packages/01-daemon-channel.md
    branch: 017-unified-release-channel-01-daemon-channel
    dependsOn: []
    status: planned
  - id: "02"
    name: app-channel-and-restart
    file: packages/02-app-channel-and-restart.md
    branch: 017-unified-release-channel-02-app-channel-and-restart
    dependsOn:
      - "01"
    status: planned
  - id: "03"
    name: plugin-channel
    file: packages/03-plugin-channel.md
    branch: 017-unified-release-channel-03-plugin-channel
    dependsOn:
      - "01"
    status: planned
contracts:
  - id: daemon-release-channel
    type: internal
    kind: store
    owner: "01"
    consumers:
      - "02"
      - "03"
relatedFeatures:
  - 004-plugin-auto-update
  - 013-plugin-auto-update-publishing
  - 008-plugin-source-consolidation
  - 003-desktop-gcs-release-pipeline
  - 016-per-user-zekoder-installation
relatedBugs:
  - 013-release-channel-change-not-propagated
relatedFollowups: []
statusHistory: []
---
# Unified release channel and update-restart notice — Overview

## User's request (verbatim)

"it is very confusing - only one beta/stable selector for plugin, skills and app, from the settings/about - change channel should be written to config imemdiately - when plugin or skills are updated silently, user is notified to restart the demon so the new tools ar eavialable"

The "written immediately" part is bug 013-release-channel-change-not-propagated, a dependency of this feature, not repeated here.

Clarifications (user, 2026-10-15): Stable maps to skills `stable`, Beta to skills `dev`. Channel is per host: each daemon owns it, Settings → About sets it per connected host, the desktop app-update channel follows the local host; with no local host the desktop keeps its stored channel and shows a desktop-only Stable/Beta row. Old daemons: tell the user to update the host, no fallback write. Restart notice: persistent per-host banner "Update ready — restart daemon" for the plugin only, confirmation copy matching real behavior, never auto-restart. Skills updates get a Version-tab note only. A host whose old plugin skills setting was `dev` migrates once to Beta.

## Refined scope

- Each daemon persists `releaseChannel: "stable" | "beta"` in its mutable daemon config (`$PASEO_HOME/config.json`), read and written through the existing `get_daemon_config` / `set_daemon_config` RPCs. A capable daemon always returns the field; `server_info.features.releaseChannel` gates the app UI. No new RPC.
- The built-in Zekoder plugin updater takes its channel from daemon config and re-checks when it changes.
- The Zekoder plugin's skills installer takes its channel from daemon config (Beta → `dev`). The Version tab channel chips go; the tab shows the channel read-only with "Change in Settings → About", or "Update this host to change its channel" on an old daemon. After a background skills install it notes that running agents need `/mcp reconnect zekoder` or a restart.
- Settings → About → Connected hosts: each host row gets a Stable/Beta control (old host: "Update this host to change its channel"). The desktop Release channel row shows only when there is no local host; otherwise the desktop app channel mirrors the local host.
- A per-host "Update ready — restart daemon" notice when the host's built-in plugin updater reports `restartRequired`; confirmation, then the existing restart flow. The restart confirmation copy is corrected to real behavior (package 02).

## Out of scope

- Bug 013's fixes (desktop writes `desktop-channel.json` on change/restart; updater re-checks on file change).
- Signing/notarization; unsigned macOS self-update (existing behavior).
- A real skills `beta` channel in zekoder-skills.
- Auto-restart of any daemon. A daemon-restart notice for skills installs (user confirmed: Version-tab note only).

## Packages

| ID | Name | File | Branch | Depends on |
|---|---|---|---|---|
| 01 | daemon-channel | packages/01-daemon-channel.md | 017-unified-release-channel-01-daemon-channel | — |
| 02 | app-channel-and-restart | packages/02-app-channel-and-restart.md | 017-unified-release-channel-02-app-channel-and-restart | 01 |
| 03 | plugin-channel | packages/03-plugin-channel.md | 017-unified-release-channel-03-plugin-channel | 01 |

- **01** protocol field + capability, daemon config store with one-time seed, built-in updater channel source, docs/plugins.md.
- **02** app: per-host selector in About, desktop channel follows local host, restart-ready notice, corrected restart copy.
- **03** plugin: skills channel from daemon config, legacy `dev` migration, read-only Version tab, README, version bump.

## Dependency graph

```
01-daemon-channel ──┬──> 02-app-channel-and-restart
                    └──> 03-plugin-channel
```

Feature-level: depends on bug 013-release-channel-change-not-propagated (lands first; 01 builds on its updater re-check hook).

## Related bugs, followups & features

- 013-release-channel-change-not-propagated · separate (dependency) · land first. Its "channel changed → checkNow" hook is what 01 points at the daemon-config source; its desktop file write is the seed 01 reads once. Not folded: high severity, ships on its own.
- Feature 016-per-user-zekoder-installation · overlapping, separate · its package 01 rewrites the same plugin files (`shared/version.ts`, `server/version.ts`, `index.server.ts`, `client/version-panel.tsx`, README, docs/zekoder-plugin.md). **Landing order: 017 first** (016 is blocked on external deliverables). Required change to 016, applied as one line in its `packages/01-shared-runtime.md`: the channel is read-only from daemon config (feature 017); 016 must not re-add channel controls and must keep 017's channel read, legacy migration and reconnect note when it replaces the per-project UI.
- 005-distinct-desktop-updater-cache-dir · separate · unrelated files.
- 002-plugin-signing-key-rotation, 010-publish-paseo-zekoder-to-npm · separate · no overlap.

Decisions consulted: none relevant (search hit only 001 Nix packaging and 002 three-tier agent defaults, both unrelated).

## Open assumptions

1. **Seed for hosts with no stored channel.** A capable daemon resolves an unset `releaseChannel` from `desktop-channel.json` (written by the desktop from its setting), else `stable`, so existing Beta desktop users stay on Beta. Remote hosts with no file start on Stable unless 03's legacy `dev` migration moves them to Beta.
2. **Plugin on an old daemon** (field absent): the skills channel stays the legacy plugin setting, shown read-only with "Update this host to change its channel". This avoids a skills downgrade; tagged COMPAT.
