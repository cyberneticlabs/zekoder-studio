# Package 01 — daemon-channel

**Branch**: `017-unified-release-channel-01-daemon-channel` · **Depends on**: — (feature depends on bug 013 being merged first)

## Worktree setup

```bash
git worktree add ../worktrees/017-unified-release-channel-01-daemon-channel -b 017-unified-release-channel-01-daemon-channel main
cd ../worktrees/017-unified-release-channel-01-daemon-channel && npm install && npm run build:client
```

## Goal

Each daemon owns its release channel in daemon config, always reports it, advertises the capability, and its built-in Zekoder plugin updater follows it.

## Context

- Contract: `daemon-release-channel` (contracts.md). Read docs/protocol-compatibility.md first: optional wire field, pure schema, one COMPAT-tagged capability.
- Copy `pluginsEnabled` end to end; it is the closest top-level mutable field:
  - `packages/protocol/src/messages.ts` `MutableDaemonConfigSchema` ~L174, `MutableDaemonConfigPatchSchema` ~L214, features object ~L3600-3680 (pattern: `pluginUpdates` ~L3647 with its COMPAT comment).
  - `packages/server/src/server/daemon-config-store.ts`: `SupportedMutableConfigPatch` L19-35, supported keys ~L191, `PERSISTED_TO_MUTABLE_PATH` ~L214, `pickSupportedPatchFields` ~L277 (silently drops unknown keys), `applySupportedPatch` ~L358, `mergeMutablePatchIntoPersistedConfig` ~L589, `onChange` L542.
  - `packages/server/src/server/persisted-config.ts` `PersistedConfigSchema` L228-320; `packages/server/src/server/config.ts` resolution ~L628; `bootstrap.ts` `PaseoDaemonConfig` ~L409.
  - Advertise in `packages/server/src/server/websocket-server.ts` features ~L1789-1890 (next to `pluginUpdates: true` ~L1842).
- Resolution rule: `persisted.releaseChannel ?? seedFromChannelFile() ?? "stable"`, where the seed reads `$PASEO_HOME/builtin-plugin-updates/desktop-channel.json` (`{channel:"beta"}` → beta). Tag the seed `// COMPAT(releaseChannel): seed from desktop-channel.json, remove after 2027-04-15`. Do not write the seeded value back; the first patch persists it.
- Updater: `packages/server/src/server/plugins/builtin/updates/index.ts` — `readChannelFile` L113, `runCheck` L327, `getStatus` L228, `lastCheckChannel` L156, `checkNow` L202. Bug 013 adds a "channel changed → checkNow" path; point it at the new source instead of duplicating it. Wiring: `updates/wiring.ts` `createBuiltinUpdateWiring` L34, created in `bootstrap.ts` ~L628 where `daemonConfigStore` is in scope.
- Updater option (single-package, not a contract): `readChannel: () => "stable" | "beta"` supplied from `daemonConfigStore.get().releaseChannel`. The updater stops reading the file itself.

## Tasks

- [ ] `packages/protocol/src/messages.ts`: add optional `releaseChannel: z.enum(["stable","beta"])` to both mutable config schemas; add optional `features.releaseChannel` with its COMPAT comment. Extend the protocol schema test beside `messages.plugins.test.ts` for parse of old and new shapes.
- [ ] `persisted-config.ts`, `config.ts`, `daemon-config-store.ts`: persist, resolve (rule above), whitelist and merge `releaseChannel` like `pluginsEnabled`. Extend the store's existing test file: patch → persisted → get round trip; unset + file `beta` → `beta`; unset + no file → `stable`.
- [ ] `websocket-server.ts`: advertise `releaseChannel: true`.
- [ ] `updates/index.ts` + `wiring.ts` + `bootstrap.ts`: inject `readChannel`; subscribe to `daemonConfigStore.onChange` and run `checkNow()` when the channel changes; unsubscribe in `stop()`. Extend `updates/index.test.ts` (replace the `writeChannel` file helper L292 where it drives the channel): injected channel selects the release; a change triggers a check on the new channel.
- [ ] `docs/plugins.md` "The Zekoder plugin" channel bullets (~L144-159): daemon config `releaseChannel` is the source, set per host in Settings → About; `desktop-channel.json` is only a one-time seed. Rewrite in place, do not append.

## Verification

- `npx vitest run packages/server/src/server/plugins/builtin/updates/index.test.ts --bail=1 > /tmp/test-output.txt 2>&1`, then each other changed test file the same way, one at a time.
- `npm run build:client`, `npm run typecheck`, `npm run lint --` and `npm run format:files --` with the changed file paths.
- `rg "COMPAT\(releaseChannel\)"` shows the feature flag and the seed.

## Progress

- [ ] Tasks complete · [ ] Gate green · [ ] Merged
