# Package 03 — plugin-channel

**Branch**: `017-unified-release-channel-03-plugin-channel` · **Depends on**: 01

## Worktree setup

```bash
git worktree add ../worktrees/017-unified-release-channel-03-plugin-channel -b 017-unified-release-channel-03-plugin-channel main
cd ../worktrees/017-unified-release-channel-03-plugin-channel && npm install && npm run build:client
```

## Goal

The Zekoder plugin installs zekoder-skills from the daemon's channel, migrates a legacy `dev` setting once, and shows the channel read-only in the Version tab.

## Context

- Contract: `daemon-release-channel` (contracts.md). Mapping: `beta` → skills `dev`, `stable` → `stable` (stable still falls back to dev while stable has no release; `pickRelease` keeps that). Capability: `"releaseChannel" in (await host.config.get())`; absent = old daemon.
- Plugin rules: kb/discovery/zekoder-plugin.md. No new npm imports; labels inline; bump `package.json` `version` and `shared/plugin-version.ts` `PLUGIN_VERSION` together.
- Lands before feature 016 (its package 01 rewrites these files and now keeps this behavior).
- `plugins/zekoder/server/version.ts`: `host: Paseo | null` L77 (set by handlers), `scheduleVersionChecks` L198-222 (tick = `checkLatest` then `reconcile(host)`; subscribes to the settings store), `checkLatest` L231, `readChannel` L274-281, `pickRelease` L284, `runInstall` L461-489 (`disposeClient(dir)` on success).
- `plugins/zekoder/shared/version.ts` L14-22: `RELEASE_CHANNELS`, `versionSettingsSchema {channel}`, host-scoped `versionSettings`; registered in `index.server.ts` ~L110.
- `plugins/zekoder/client/version-panel.tsx`: chips L101-116, `switchChannel` L65-75, "Latest version" + "Check now" L91-99, plugin card "Channel" row L183, restart text L223-226.

## Tasks

- [ ] `server/version.ts` channel source: a tick with `host` unset does nothing (no channel resolution, no manifest check, no reconcile) and runs on the next tick. With `host`: read `host.config.get()`; capable → map `releaseChannel`; old daemon → use the legacy plugin setting value (`// COMPAT(releaseChannel): legacy plugin channel on daemons without releaseChannel, remove after 2027-04-15`). Replace the settings-store subscription with a 60s `unref` channel poll that ticks when the mapped channel changes.
- [ ] Legacy migration, same file, once per host: on a capable daemon, if the legacy setting is `dev`, `host.config.patch({releaseChannel: "beta"})`, then save the legacy setting back to `stable` so it never re-runs; on patch failure keep the setting and retry next tick. Same COMPAT tag. Keep `versionSettings` registered only for this read.
- [ ] Status schema (`shared/version.ts`): add `daemonChannel: "stable" | "beta" | null` (null = old daemon), the mapped skills channel, and per project the last background install `{version, at}` recorded in `runInstall`.
- [ ] `client/version-panel.tsx`: remove chips, `switchChannel` and the `RELEASE_CHANNELS` import. Capable: "Channel: Stable|Beta (skills: stable|dev) · Change in Settings → About". Old daemon: "Channel: skills dev|stable · Update this host to change its channel." Keep "Latest version" and "Check now". After a background install: "Skills updated to X at HH:MM. Agents started before then need `/mcp reconnect zekoder` or a restart." Plugin card restart text points at the "Update ready — restart daemon" notice.
- [ ] `plugins/zekoder/README.md` Version tab section (~L91-136) and `docs/zekoder-plugin.md` L34-40: channel per host from Settings → About; mapping; legacy migration; reconnect note.
- [ ] Bump the plugin version.

## Verification

- Extract channel mapping + migration decision as a pure helper and test it beside `server/version.ts` with `npx vitest run` on that one file and `--bail=1` (root vitest discovers plugin tests).
- `npm run typecheck` (covers `plugins/`), `npm run lint --` and `npm run format:files --` with the changed file paths.
- Manual: get-started.md steps 6-7 and 10.

## Progress

- [ ] Tasks complete · [ ] Gate green · [ ] Merged
