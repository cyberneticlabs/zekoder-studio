---
id: 004-plugin-auto-update
type: feature
title: Signed Zekoder plugin auto-update without app rebuild
status: planned
createdAt: 2026-10-07
openedAt: 2026-10-07T14:12:09.274Z
updatedAt: 2026-10-07T15:58:38.271Z
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
    type: internal
    kind: store
    owner: "02"
    consumers:
      - "03"
  - id: zekoder-plugin-release-manifest
    type: cross-system
    counterpart: cyberneticlabs/zekoder-plugins
    externalDependency: 1
    owner: "01"
    consumers: []
  - id: plugin-update-status-api
    type: cross-system
    counterpart: cyberneticlabs/zekoder-plugins
    externalDependency: 1
    owner: "02"
    consumers: []
relatedFeatures:
  - 003-desktop-gcs-release-pipeline
  - 001-builtin-zekoder-plugin
relatedBugs: []
relatedFollowups: []
statusHistory: []
---
# Signed Zekoder plugin auto-update without app rebuild

## User's request (verbatim)

"for the plugin auto-update feature, for tasks related to the plugin itself, talk to the zekoder-plugin project by creating a new agent (opus) in a new workspace and ask it to file the required new feature"

Context: update the built-in Zekoder plugin (vendored at `plugins/zekoder/`, lock `plugins/zekoder.lock.json`) without rebuilding the desktop app. Agreed requirements: publish versions to our GCS bucket with a signed manifest; Ed25519 signature checked against embedded public key(s), key rotation supported; check every few hours, only newer versions, no downgrade except rollback; per-version compat range; bundled copy always kept as fallback; revoked versions roll back to previous good or bundled; downloaded copy keeps built-in lock semantics; status visible (version, source, last check, errors). Apply on next daemon start; channel follows the app's channel.

## Refined scope

This repo (Studio) consumes; `zekoder-plugins` publishes. Studio's daemon:

- Runs only when the desktop app launches the daemon (user decision); headless npm/Docker daemons, dev checkouts, CI and smoke runs stay off.
- Checks the signed manifest at start and every 6 hours, on the app's channel (stable app → stable only; beta app → highest eligible stable or beta, same rule as feature 003).
- Verifies the manifest signature list against the embedded trusted keys (`{keyId, publicKey}` list), rejects replayed manifests via a persisted sequence counter, filters by compat range, channel, revoked list and locally failed versions, picks the highest version newer than bundled, downloads it, checks sha256, unpacks into `$PASEO_HOME/builtin-plugin-updates/zekoder/<version>/`.
- On the **next** daemon start loads the best verified downloaded copy instead of bundled. A start failure starts the bundled copy in the same start; the version is retried once at the next start and blocked after a second failure. No hot-swap or auto-restart: status reports `restartRequired` and the user restarts from Settings → Host → Restart daemon.
- Keeps the plugin a built-in: same id, same `rejectBuiltinId` locks, same catalog path.
- Serves the status shape zekoder-plugins proposed (running version + source, staged version, fallback reason, last check, typed error codes) as `plugin.updates.get_status.request/.response`, gated on `server_info.features.pluginUpdates`, plus `PaseoApi.pluginUpdates.status()` for the plugin's Version tab.

## Out of scope

Plugins-repo publish pipeline, signing, manifest production and Version tab UI (zekoder-plugins feature, external dependency 1). Whole-app updates (feature 003). Plugin skills/MCP install behaviour (`plugins/zekoder/server/version.ts`). Full signing-key rotation process (dual-signing overlap, retiring keys) — separate followup the coordinator files; this feature ships only the list-shaped hooks. Mobile. Live hot-swap. User-selectable plugin channel. Updating built-ins other than `zekoder`. Studio-side UI.

## Packages

| ID  | Name           | File                          | Branch                                   | Depends on |
| --- | -------------- | ----------------------------- | ---------------------------------------- | ---------- |
| 01  | Update engine  | packages/01-update-engine.md  | 004-plugin-auto-update-01-update-engine  | —          |
| 02  | Status RPC     | packages/02-status-rpc.md     | 004-plugin-auto-update-02-status-rpc     | —          |
| 03  | Overlay loader | packages/03-overlay-loader.md | 004-plugin-auto-update-03-overlay-loader | 01, 02     |

- **01** — server module: manifest fetch, signature/compat/channel/revocation selection, download, unpack, state file, periodic check. Injected deps, no daemon wiring.
- **02** — protocol schema + feature flag, session handler over a provider interface, daemon-client method, `PaseoApi.pluginUpdates` namespace.
- **03** — wire 01 into daemon start: per-id overlay directory, fallback on start failure, status provider for 02, desktop-only opt-in and channel file, CI kept off, docs.

## Dependency graph

```
01 update-engine ─┐
                  ├─> 03 overlay-loader
02 status-rpc ────┘
```

01 and 02 run in parallel; contracts.md fixes their shared shapes.

## Related bugs & followups

- followup 001-restore-auto-updater-service-tests — separate. Desktop Electron updater tests, already folded into feature 003; no file overlap. No fold-in.
- feature 003-desktop-gcs-release-pipeline — related, not a dependency. Reuses its bucket `zekoder-releases` and channel rule; this feature reads only the plugins prefix the plugins repo publishes.
- feature 001-builtin-zekoder-plugin (merged) — context: built-in registration and locks this feature preserves.

## Decisions consulted

None relevant (decision search returned no records). Recommend `/zekoder-decision` for "built-in plugins may load signed, network-delivered code from PASEO_HOME".

## Open assumptions

1. **Architecture/security change.** The daemon executes plugin code downloaded at runtime, not only app-bundled code. A signed, immutable, version-pinned artifact selected by a signed manifest is the sanctioned exception to "pin plugins to exact tested versions"; package 03 documents it. **Approved by the user 2026-10-07.**
2. **Public SDK surface.** Adds a `pluginUpdates` namespace to `PaseoApi` (`packages/client/src/index.ts`) — a fork-owned addition to an upstream interface. **Approved by the user 2026-10-07.**
3. **Trust at load time.** Verification happens at download. At start the daemon trusts the unpacked directory under `$PASEO_HOME` (same trust as the rest of PASEO_HOME) and re-checks only that the recorded version is not revoked or failed.
4. **Artifact format** is the plugins side's call. Studio prefers `.tar.gz` unpacked with a pinned `tar` dependency; package 01 adapts if the owner picks otherwise.
5. **Production public key** comes from external dependency 2. Until then `TRUSTED_KEYS` ships empty and the update check reports `disabled` without network calls.
