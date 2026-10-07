---
id: 004-plugin-auto-update
type: feature
title: Signed Zekoder plugin auto-update without app rebuild
status: planned
createdAt: 2026-10-07
openedAt: 2026-10-07T14:12:09.274Z
updatedAt: 2026-10-07T16:39:30.323Z
promoted: true
dependsOn: []
packages:
  - id: "01"
    name: update-engine
    file: packages/01-update-engine.md
    branch: 004-plugin-auto-update-01-update-engine
    dependsOn: []
    status: planned
  - id: "02"
    name: status-rpc
    file: packages/02-status-rpc.md
    branch: 004-plugin-auto-update-02-status-rpc
    dependsOn: []
    status: planned
  - id: "03"
    name: overlay-loader
    file: packages/03-overlay-loader.md
    branch: 004-plugin-auto-update-03-overlay-loader
    dependsOn:
      - "01"
      - "02"
    status: planned
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
relatedFeatures:
  - 003-desktop-gcs-release-pipeline
  - 001-builtin-zekoder-plugin
relatedBugs: []
relatedFollowups:
  - 002-plugin-signing-key-rotation
statusHistory: []
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
