---
id: 013-release-channel-change-not-propagated
type: bug
title: Release channel change does not reach the plugin updater until a full app relaunch
status: planned
createdAt: 2026-10-15
openedAt: 2026-10-15T18:30:27.488Z
updatedAt: 2026-10-15T18:31:22.367Z
severity: high
branch: bug-013-release-channel-change-not-propagated
promoted: false
packages: []
relatedFeatures:
  - 008-plugin-source-consolidation
  - 004-plugin-auto-update
relatedBugs: []
relatedFollowups: []
resolvedBy: null
statusHistory: []
---
# Bug 013-release-channel-change-not-propagated: Release channel change does not reach the plugin updater until a full app relaunch

## Summary

The desktop writes its release channel to `desktop-channel.json` only on `start_desktop_daemon`, so changing the channel in Settings, or restarting the daemon from Settings, never reaches the built-in plugin updater until the user quits and relaunches the app.

Observed 2026-10-15 on desktop 0.12.0-beta.1 (`/Applications/Zekoder.app`, `PASEO_HOME` `~/.zekoder`). Related: `.zekoder/features/008-plugin-source-consolidation`, `.zekoder/features/004-plugin-auto-update`.

Out of scope (planned separately as a feature via `/zekoder-plan`): a single unified stable/beta selector for app + plugin + skills, and a "restart daemon" notice after a silent plugin/skills update.

## Repro steps

1. Desktop on the stable channel; a beta plugin release exists (manifest `channels.beta` set, `channels.stable` null).
2. Settings -> About -> Release channel -> Beta.
3. Check `~/.zekoder/builtin-plugin-updates/desktop-channel.json`: still `{"channel":"stable"}`. Settings -> Host -> Restart daemon: file unchanged (mtime stayed 18:59:37 across a daemon restart at 19:14:23). `~/.zekoder/builtin-plugin-updates/zekoder/state.json` has `latestAvailable: null`.
4. Cmd+Q and relaunch: file becomes `{"channel":"beta"}` (19:22:31) and the updater stages 0.12.0-beta.2 within about 60s (19:23:33).

## Expected vs. actual

- **Expected**: changing the release channel writes `desktop-channel.json` immediately and triggers a plugin update check, with no relaunch. Every daemon (re)start path also rewrites the file.
- **Actual**: the file is rewritten only when the renderer calls `start_desktop_daemon` (app launch). Channel changes and Settings -> Host -> Restart daemon leave it stale, with no hint to the user.

## Root cause

Confirmed in code (no other writer of the file exists):

1. `packages/desktop/src/daemon/daemon-manager.ts` `writeBuiltinPluginUpdateChannel` (line 283) is called from exactly one place: `startDaemon` (line 301), registered as `start_desktop_daemon` (line 435).
2. Channel change path: `packages/app/src/screens/settings-screen.tsx` (line 671, `updateSettings({ releaseChannel })`) -> `packages/app/src/desktop/settings/desktop-settings.ts` (line 138, `patch_desktop_settings`) -> `packages/desktop/src/settings/desktop-settings-commands.ts` (line 12, `settingsStore.patch`). The store only persists `desktop-settings.json`; nothing writes `desktop-channel.json`.
3. Restart path: `restart_desktop_daemon` (line 443) -> `restartDaemon` (line 384) shells out to `paseo daemon restart --home ... --json` and never calls `startDaemon`, so it bypasses the write. `docs/plugins.md` (lines 148-157) wrongly claims the desktop writes the file on every `start_desktop_daemon` and that Restart daemon "stays opted in" for channel purposes; it also says a channel change "applies at the next check after the next app launch", which describes the bug as intended behavior.
4. Even with a fresh file, the daemon only reads it in `runCheck` (`packages/server/src/server/plugins/builtin/updates/index.ts` line 327, `readChannelFile` line 113), reached from the timer (`start()` line 181 -> first check after 60s, then every 6h). `checkNow` (line 202) has no external caller, so there is no way to trigger an immediate check after a channel change.

## Fix approach

Desktop side (the file's single owner stays `daemon-manager.ts`):

- Write the file whenever the persisted channel changes: hook the `patch_desktop_settings` handler (or the settings store change path in `packages/desktop/src/settings/desktop-settings-commands.ts` / `desktop-settings-electron.ts`) so a `releaseChannel` change calls `writeBuiltinPluginUpdateChannel` (export it, or move it to a small module imported by both).
- Write it in `restartDaemon` before the CLI restart, using the stored channel.

Daemon side, so a change applies without a restart:

- Make the updater react to a changed channel file with an immediate `checkNow()`. Prefer the least invasive option: in `BuiltinPluginUpdater`, compare the file's channel (or mtime) against `lastCheckChannel` and run a check on change (watch the file, or add a cheap poll). Do not add a new RPC unless the watch approach is rejected during implementation. Keep protocol changes out (see `docs/protocol-compatibility.md`).

Docs: correct `docs/plugins.md` (lines 148-157): state when the file is written (settings change, every start, and restart), that the updater checks promptly after a change, and drop the incorrect "next app launch" and "Restart daemon stays opted in" wording where it implies the channel is handled by it.

## Tasks

- [ ] `packages/desktop/src/daemon/daemon-manager.ts`: export/reuse `writeBuiltinPluginUpdateChannel`; call it from `restartDaemon` (line 384) before the CLI restart.
- [ ] `packages/desktop/src/settings/desktop-settings-commands.ts` (and `desktop-settings-electron.ts` if the store hook lives there): on `patch_desktop_settings` with a changed `releaseChannel`, write `desktop-channel.json` immediately.
- [ ] `packages/server/src/server/plugins/builtin/updates/index.ts`: detect a changed channel file and run `checkNow()` promptly, without waiting for the 6h interval.
- [ ] Tests: extend `packages/desktop/src/daemon/daemon-manager.test.ts` (restart writes the file; settings change writes the file) and `packages/server/src/server/plugins/builtin/updates/index.test.ts` (channel file change triggers a check on the new channel).
- [ ] `docs/plugins.md` lines 148-157: correct the channel-file and restart claims as described above.

## Verification

- Run only the changed test files with `npx vitest run <file> --bail=1`; then `npm run typecheck`, `npm run lint`, `npm run format`.
- Manual on desktop: with a beta plugin release published, switch Settings -> About -> Release channel to Beta; `desktop-channel.json` flips to `{"channel":"beta"}` immediately and the updater stages the beta version without relaunching. Repeat with Settings -> Host -> Restart daemon on a stale file: the file is rewritten.
