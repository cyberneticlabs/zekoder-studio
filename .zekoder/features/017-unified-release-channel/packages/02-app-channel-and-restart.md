# Package 02 — app-channel-and-restart

**Branch**: `017-unified-release-channel-02-app-channel-and-restart` · **Depends on**: 01

## Worktree setup

```bash
git worktree add ../worktrees/017-unified-release-channel-02-app-channel-and-restart -b 017-unified-release-channel-02-app-channel-and-restart main
cd ../worktrees/017-unified-release-channel-02-app-channel-and-restart && npm install && npm run build:client
```

## Goal

One per-host Stable/Beta control in Settings → About, the desktop app channel following the local host, a per-host "Update ready — restart daemon" notice, and restart copy that matches real behavior.

## Context

- Contract: `daemon-release-channel` (contracts.md). Gate on `useHostFeature(serverId, "releaseChannel")` (`packages/app/src/runtime/host-features.ts` L33). Read/write via `useDaemonConfig(serverId)` → `{config, patchConfig}` (`packages/app/src/hooks/use-daemon-config.ts`).
- New code goes in the fork-owned module `packages/app/src/zekoder/` (plan.md boundaries); upstream files get small call sites only. Follow docs/design.md, docs/forms.md; no route changes.
- About section: `packages/app/src/screens/settings-screen.tsx` — `AboutSection` L455, `ConnectedHostsSection` L549, `HostVersionRow` L571, `DesktopAppUpdateRow` L639 with the current Release channel row (handler ~L670-681, row ~L716-732, `SegmentedControl` usage to reuse).
- Local host: `useLocalDaemonServerId()` (`packages/app/src/hooks/use-is-local-daemon.ts` L35), null when the desktop manages no local daemon. Desktop write path: `useSettings().updateSettings({releaseChannel})` (`hooks/use-settings/index.ts` L210-212, Electron only). On the desktop side a channel change already reconfigures the app updater (`packages/desktop/src/features/app-update-service.ts` `configureRuntime` ~L197-204 clears state when the channel differs); no desktop code changes.
- Restart status: `client.getBuiltinPluginUpdateStatus()` (`packages/client/src/daemon-client.ts` ~L5591, gated by `features.pluginUpdates`) returns `restartRequired`, `stagedVersion`.
- Restart action: `restartDaemonFromSettings` (`screens/settings/daemon-lifecycle.ts` L15) as used by `RestartDaemonCard` (`screens/settings/host-page.tsx` L559-661, call ~L619-632). `confirmDialog` (`utils/confirm-dialog.ts` L106).
- Real restart behavior (checked): Restart requests a replacement worker (`restart_server_request`; public-docs/cli.md L353). The old worker's shutdown closes every agent (`packages/server/src/server/bootstrap.ts` ~L1841 `closeAllAgents`, L1901) after flushing agent storage. So running agents stop and their history is kept. The current `settings.host.daemon.restart.confirmMessage` ("Agents running on it will keep going") is wrong.
- Callout: copy `desktop/updates/update-callout-source.tsx` (mounted `app/_layout.tsx` ~L601); options in `contexts/sidebar-callout-state.ts`. Callouts render on web/desktop only, so native gets an inline `Alert` on the host page.
- i18n: `i18n/resources/en.ts` `settings.about.releaseChannel` ~L2346 (reuse label/stable/beta), restart copy ~L2735-2756; every locale carries the same keys (`resources.test.ts`).

## Settled English copy

- `settings.host.daemon.restart.confirmMessage` (replace): "This restarts the daemon. Running agents on it stop; their history is kept. The app reconnects automatically."
- Notice title: "Update ready — restart daemon". Description: "{{name}}: Zekoder plugin {{version}} is installed and runs after a daemon restart." Action: "Restart daemon".
- Notice confirm: title "Restart {{name}}?", message "Zekoder plugin {{version}} starts after the restart. Running agents on {{name}} stop; their history is kept. The app reconnects automatically.", confirm "Restart daemon", destructive.
- Old host: "Update this host to change its channel."

## Tasks

- [ ] `packages/app/src/zekoder/release-channel/host-release-channel-control.tsx`: per-host Stable/Beta `SegmentedControl` bound to `config.releaseChannel` and `patchConfig`. Without the capability: the old-host hint, no control. Render it in `HostVersionRow` for connected hosts.
- [ ] `settings-screen.tsx` `DesktopAppUpdateRow`: show the Release channel row only when `useLocalDaemonServerId()` is null (desktop-app-only channel, stored desktop setting as today); hide it otherwise.
- [ ] `packages/app/src/zekoder/release-channel/use-local-channel-sync.ts`, mounted once in `app/_layout.tsx` on Electron only: when the local host is capable and its `releaseChannel` differs from the desktop setting, `updateSettings({releaseChannel})`. Pure decision function + test.
- [ ] `packages/app/src/zekoder/restart-ready/`: per-connected-host query of `getBuiltinPluginUpdateStatus` (react-query, refetch on connect, every 60s, and invalidated on `status:daemon_config_changed` and after a channel patch), so the notice appears within about 1-2 minutes of staging. Callout source (id `host-restart-ready:` + serverId, not dismissible, settled copy) → notice confirm → `restartDaemonFromSettings`. Mount next to `UpdateCalloutSource`. Test the pure "which hosts need restart" selector.
- [ ] `host-page.tsx`: inline `Alert` with the same copy and action above `RestartDaemonCard` (~L1242) when restart is required. Covers native.
- [ ] i18n: replace `confirmMessage` and add the new keys in `en.ts` and every locale file (translated); update the release channel description to "Applies to this host's app updates, Zekoder plugin and skills."

## Verification

- Changed tests only: `npx vitest run` with one file path and `--bail=1 > /tmp/test-output.txt 2>&1`, for the new tests and `packages/app/src/i18n/resources.test.ts`.
- `npm run typecheck`, `npm run lint --` and `npm run format:files --` with the changed file paths.
- Manual (dev daemon 6768 only, `npm run dev` + `npm run dev:desktop`): get-started.md steps 1-5 and 8-9.

## Progress

- [ ] Tasks complete · [ ] Gate green · [ ] Merged
