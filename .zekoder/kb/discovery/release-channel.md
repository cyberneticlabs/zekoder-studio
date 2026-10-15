<!-- discovery-stamp: sha=6e1f85a65587e93d682589c49761611850b533d8 globs=["packages/server/src/server/plugins/builtin/updates/**", "packages/server/src/server/daemon-config-store.ts", "packages/server/src/server/persisted-config.ts", "packages/desktop/src/daemon/daemon-manager.ts", "packages/desktop/src/settings/desktop-settings.ts", "packages/desktop/src/features/catalog-app-update-runtime.ts", "packages/desktop/src/features/app-update-service.ts", "packages/app/src/screens/settings-screen.tsx", "packages/app/src/screens/settings/host-page.tsx", "packages/app/src/screens/settings/daemon-lifecycle.ts", "packages/app/src/hooks/use-settings/**", "packages/app/src/hooks/use-daemon-config.ts", "packages/app/src/desktop/updates/**", "packages/server/src/server/bootstrap.ts", "plugins/zekoder/server/version.ts", "plugins/zekoder/shared/version.ts", "plugins/zekoder/client/version-panel.tsx"] updatedAt=2026-10-15T20:00:00Z -->
# Discovery: release channels and update/restart signals

Plugin registry/updater internals: discovery/plugins.md. Per-host app UI: discovery/app-host-plugins.md.

## Channel sources (as of this stamp)

- Desktop app updates: Electron `desktop-settings.json` `releaseChannel` stable|beta (`packages/desktop/src/settings/desktop-settings.ts` ReleaseChannelSchema ~L45); consumed by `catalog-app-update-runtime.ts` ~L71 (`allowPrerelease`) and `main.ts` ~L1046; `app-update-service.ts` `configureRuntime` ~L197 resets state on a channel change. App write path: `hooks/use-settings/index.ts` ~L210 (Electron only). UI: `settings-screen.tsx` `DesktopAppUpdateRow` ~L639 (desktop-only, app-level, not per host).
- Built-in plugin updater: `$PASEO_HOME/builtin-plugin-updates/desktop-channel.json`, written only by desktop `daemon-manager.ts` `writeBuiltinPluginUpdateChannel` ~L283 on `start_desktop_daemon` (bug 013); read per check by `updates/index.ts` `readChannelFile` L113. Updater runs only on desktop-managed daemons (`wiring.ts` eligibility).
- zekoder-skills: plugin host-scoped setting `zekoder-version-settings.channel` stable|dev (`plugins/zekoder/shared/version.ts` L14-22), chips in `client/version-panel.tsx` L101-116. No setChannel RPC. Stable falls back to dev when stable has no release (`pickRelease`).
- Feature 017 plans one per-host daemon config field `releaseChannel` to drive all three.

## Daemon config field path

- A new mutable daemon config field needs: `messages.ts` MutableDaemonConfigSchema ~L174 + Patch ~L214; `daemon-config-store.ts` supported keys/pick/merge (unknown keys are silently dropped, so an old daemon accepts and ignores them; gate UI with a `server_info.features` flag); `persisted-config.ts` ~L228; `config.ts` ~L628. Template: `pluginsEnabled`. Store has `onChange` (~L542).
- Plugins read/patch it through `paseo.config.get/patch` (`packages/client/src/index.ts` ~L765).

## Restart signals

- Staged plugin vs running: `updates/index.ts` `getStatus` L210-231 (`restartRequired = stagedVersion !== null`), exposed by `plugin.updates.get_status` (client `getBuiltinPluginUpdateStatus` ~L5591, feature `pluginUpdates`). Not in server_info.
- Restart flow: `host-page.tsx` `RestartDaemonCard` L559-661 -> `daemon-lifecycle.ts` `restartDaemonFromSettings` (waits for a new pid) -> `restart_server_request` -> replacement worker (public-docs/cli.md L353).
- Real behavior: the old worker's shutdown closes every agent (`bootstrap.ts` ~L1841 `closeAllAgents`, L1901) after flushing agent storage, so running agents stop and history is kept. `settings.host.daemon.restart.confirmMessage` ("keep going") is wrong; feature 017 replaces it.
- Skills installs need no daemon restart: `runInstall` disposes the pooled zekoder-mcp per root (`version.ts` ~L472, `zekoder.ts` ~L499); running agents keep their own `.mcp.json` MCP connection and need `/mcp reconnect zekoder`.
- Sidebar callouts are web/desktop only (native slot renders null); template `desktop/updates/update-callout-source.tsx`.
