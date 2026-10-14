---
id: 004-plugin-auto-update
type: feature
title: Signed Zekoder plugin auto-update without app rebuild
status: merged
createdAt: 2026-10-07
openedAt: 2026-10-07T14:12:09.274Z
updatedAt: 2026-10-14T14:37:54.100Z
completedAt: 2026-10-14T14:37:54.100Z
promoted: true
dependsOn: []
packages:
  - id: "01"
    name: update-engine
    file: packages/01-update-engine.md
    branch: 004-plugin-auto-update-01-update-engine
    dependsOn: []
    status: merged
    commit: 2d1ada709c08822824404770188920f625c70519
    mergeMode: local
    filesTouched:
      - .zekoder/features/004-plugin-auto-update/packages/01-update-engine.md
      - package-lock.json
      - packages/server/package.json
      - packages/server/src/server/plugins/builtin/updates/index.test.ts
      - packages/server/src/server/plugins/builtin/updates/index.ts
      - packages/server/src/server/plugins/builtin/updates/manifest.ts
      - packages/server/src/server/plugins/builtin/updates/tree-checksum.test.ts
      - packages/server/src/server/plugins/builtin/updates/tree-checksum.ts
      - packages/server/src/server/plugins/builtin/updates/trusted-keys.ts
      - packages/server/src/server/plugins/builtin/updates/types.ts
    verifiedBaseSha: 11409f30ce889aa0a916fa476139428f85a80929
  - id: "02"
    name: status-rpc
    file: packages/02-status-rpc.md
    branch: 004-plugin-auto-update-02-status-rpc
    dependsOn: []
    status: merged
    commit: 95c1d19e6eb5a4d4c50449d94501c6fa938852e1
    mergeMode: local
    filesTouched:
      - .zekoder/features/004-plugin-auto-update/packages/02-status-rpc.md
      - docs/architecture.md
      - docs/plugins.md
      - packages/client/src/daemon-client.test.ts
      - packages/client/src/daemon-client.ts
      - packages/client/src/index.test.ts
      - packages/client/src/index.ts
      - packages/protocol/src/messages.plugins.test.ts
      - packages/protocol/src/messages.ts
      - packages/server/src/server/authorization/operation-permissions.ts
      - packages/server/src/server/bootstrap.ts
      - packages/server/src/server/plugins/index.posix.test.ts
      - packages/server/src/server/plugins/index.ts
      - packages/server/src/server/plugins/plugin-paseo-api.e2e.test.ts
      - packages/server/src/server/session.ts
      - packages/server/src/server/test-utils/paseo-daemon.ts
      - packages/server/src/server/websocket-server.ts
    verifiedBaseSha: 5e149136973d3c9e9e9c68b2025b07c11907c5d0
  - id: "03"
    name: overlay-loader
    file: packages/03-overlay-loader.md
    branch: 004-plugin-auto-update-03-overlay-loader
    dependsOn:
      - "01"
      - "02"
    status: merged
    commit: 9587c4cb2226aefa0adcba1276201ccf674cbee8
    mergeMode: local
    filesTouched:
      - .zekoder/features/004-plugin-auto-update/packages/03-overlay-loader.md
      - docs/data-model.md
      - docs/plugins.md
      - packages/desktop/e2e/packaged-app-smoke.js
      - packages/desktop/src/daemon/daemon-manager.test.ts
      - packages/desktop/src/daemon/daemon-manager.ts
      - packages/server/src/server/bootstrap.ts
      - packages/server/src/server/plugins/builtin/index.ts
      - packages/server/src/server/plugins/builtin/updates/index.ts
      - packages/server/src/server/plugins/builtin/updates/types.ts
      - packages/server/src/server/plugins/builtin/updates/wiring.ts
      - packages/server/src/server/plugins/index.posix.test.ts
      - packages/server/src/server/plugins/index.ts
      - packages/server/src/server/plugins/runtime.posix.test.ts
      - scripts/builtin-plugins-dist.test.mjs
    verifiedBaseSha: 9277c0f848389a016cd30f75698b04873fe8bc65
contracts:
  - id: builtin-plugin-updater
    type: internal
    kind: store
    owner: "01"
    consumers:
      - "03"
  - id: builtin-plugin-update-status
    type: cross-system
    counterpart: cyberneticlabs/zekoder-plugins
    externalDependency: 1
    owner: "02"
    consumers:
      - "03"
  - id: plugin-release-channel
    type: cross-system
    counterpart: cyberneticlabs/zekoder-plugins feature 023-plugin-auto-update-publishing
    externalDependency: 1
    owner: external
    consumers:
      - "01"
mergeMode: local
relatedFeatures:
  - 003-desktop-gcs-release-pipeline
  - 001-builtin-zekoder-plugin
relatedBugs: []
relatedFollowups:
  - 002-plugin-signing-key-rotation
statusHistory:
  - from: planned
    to: in-progress
    at: 2026-10-14T14:21:55.532Z
  - from: in-progress
    to: merged
    at: 2026-10-14T14:37:54.100Z
---

# Signed Zekoder plugin auto-update without app rebuild

## User's request (verbatim)

"for the plugin auto-update feature, for tasks related to the plugin itself, talk to the zekoder-plugin project by creating a new agent (opus) in a new workspace and ask it to file the required new feature"

Revision (2026-10-07): "make Studio feature 004-plugin-auto-update consume the plugin release contract defined by zekoder-plugins feature 023-plugin-auto-update-publishing."

Context: update the built-in Zekoder plugin (vendored at `plugins/zekoder/`, lock `plugins/zekoder.lock.json`) without rebuilding the desktop app. Agreed requirements: versions published to our GCS bucket with a signed manifest; Ed25519 signature checked against embedded public key(s), rotation-ready; check every few hours, only newer versions, no downgrade except rollback; per-version compat range; bundled copy always kept as fallback; revoked versions roll back to previous good or bundled; downloaded copy keeps built-in lock semantics; status visible. Apply on next daemon start; channel follows the app's channel.

## Ownership

- **zekoder-plugins feature 023-plugin-auto-update-publishing owns the release contract** (`plugin-release-channel`: envelope, payload, artifact, GCS layout, keyring). Studio consumes it.
- **Studio 004 owns `builtin-plugin-update-status`** (status RPC + `paseo.pluginUpdates.status("zekoder")`). 023's Version tab consumes it from its plugin `server.handle` handlers.

## Refined scope

Studio's daemon:

- Runs updates only when the desktop app launches the daemon (user decision); headless npm/Docker daemons, dev checkouts, CI and smoke runs report `enabled: false`.
- Checks `plugins/zekoder/manifest.json` at start and every 6 hours on the app's channel (stable app → stable; beta app → highest eligible stable or beta, as in feature 003).
- Verifies the signed envelope (Ed25519 over the decoded payload bytes, any trusted key in the embedded keyring), rejects replays via a persisted `sequence`, filters by channel, revoked list, `requires.paseo` against the **daemon** version and locally failed versions, picks the highest version newer than bundled, downloads it from the manifest URL, checks `size` and `sha256`, extracts the single `zekoder/` root, checks `treeChecksum`, and stages it under `$PASEO_HOME/builtin-plugin-updates/zekoder/<version>/`.
- Loads the best verified copy on the **next** daemon start. A start failure starts bundled in the same start; the version is retried once at the next start, then marked failed until a newer one ships. No hot-swap or auto-restart: status reports `restartRequired` and the user restarts from Settings → Host → Restart daemon.
- Keeps the plugin a built-in: same id, same `rejectBuiltinId` locks, same catalog path.
- Serves `plugin.updates.get_status.request/.response`, gated on `server_info.features.pluginUpdates`, plus `PaseoApi.pluginUpdates.status(pluginId?: string)` on both the client and the plugin server-side `PaseoApi`.

## Out of scope

Plugins-repo publish pipeline, signing, manifest production and Version tab UI (023, external dependency 1). Whole-app updates (feature 003). Plugin skills/MCP install behaviour (`plugins/zekoder/server/version.ts`). Signing-key rotation (dual-sign overlap, retiring keys) — followup 002-plugin-signing-key-rotation, paired with zekoder-plugins followup 001-plugin-signing-key-rotation; this feature ships only the list-shaped keyring and `signatures[]` handling. Mobile. Live hot-swap. User-selectable plugin channel. Built-ins other than `zekoder`. Studio-side UI.

## Packages

| ID  | Name           | File                          | Branch                                   | Depends on |
| --- | -------------- | ----------------------------- | ---------------------------------------- | ---------- |
| 01  | Update engine  | packages/01-update-engine.md  | 004-plugin-auto-update-01-update-engine  | —          |
| 02  | Status RPC     | packages/02-status-rpc.md     | 004-plugin-auto-update-02-status-rpc     | —          |
| 03  | Overlay loader | packages/03-overlay-loader.md | 004-plugin-auto-update-03-overlay-loader | 01, 02     |

- **01** — server module: envelope fetch + verify, sequence/compat/channel/revocation selection, download, size/sha256, unpack, tree checksum (ported from `scripts/sync-zekoder-plugin.mjs`), state file, periodic check. No daemon wiring.
- **02** — protocol schema + feature flag, session handler over a provider interface, daemon-client method, `PaseoApi.pluginUpdates`, proof that a plugin server handler can call it.
- **03** — wire 01 into daemon start: per-id overlay directory, fallback on start failure, status provider for 02, desktop-only opt-in and channel file, CI kept off, docs.

## Dependency graph

```
01 update-engine ─┐
                  ├─> 03 overlay-loader
02 status-rpc ────┘
```

01 and 02 run in parallel; contracts.md fixes their shared shapes.

## Related bugs & followups

- followup 002-plugin-signing-key-rotation — separate (Studio side of key rotation; depends on this feature shipping). Linked, no fold-in.
- followup 001-restore-auto-updater-service-tests — separate. Desktop Electron updater tests, already folded into feature 003; no file overlap.
- feature 003-desktop-gcs-release-pipeline — related, not a dependency. Same bucket `zekoder-releases` and channel rule; this feature reads only `plugins/zekoder/`.
- feature 001-builtin-zekoder-plugin (merged) — context: built-in registration and locks this feature preserves.

## Decisions consulted

None relevant (decision search returned no records). Recommend `/zekoder-decision` for "built-in plugins may load signed, network-delivered code from PASEO_HOME".

## Open assumptions

1. **Architecture/security change.** The daemon executes plugin code downloaded at runtime, not only app-bundled code. A signed, immutable, version-pinned artifact selected by a signed manifest is the sanctioned exception to "pin plugins to exact tested versions"; package 03 documents it. **Approved by the user 2026-10-07.**
2. **Public SDK surface.** Adds a `pluginUpdates` namespace to `PaseoApi` (`packages/client/src/index.ts`) — a fork-owned addition to an upstream interface. **Approved by the user 2026-10-07.**
3. **Trust at load time.** Verification (signature, size, sha256, tree checksum) happens at download. At start the daemon trusts the unpacked directory under `$PASEO_HOME` (same trust as the rest of PASEO_HOME) and re-checks only that the recorded version is not revoked or failed.
4. **Production public key** arrives through 023's external dependency 2 (a PR adding the entry to zekoder-plugins `scripts/plugin-release-keys.json`); Studio copies it into `TRUSTED_KEYS` (external dependency 2). Until then `TRUSTED_KEYS` ships empty and the updater is disabled with no network calls.
