# External dependencies

## 1. zekoder-plugins publishing feature

- Type: other repository feature (cyberneticlabs/zekoder-plugins)
- Owner: zekoder-plugins maintainers; filed by Paseo agent 4dafbbdd-3d4a-4468-95f1-53c301418fd4 (worktree `/Users/ahmedelshalaby/.paseo/worktrees/0pgjyo23/plugin-auto-update-publishing`)
- Feature id: pending — fill in when the plugins agent reports it.
- Related contracts: zekoder-plugin-release-manifest, plugin-update-status-api
- Blocks: package 01 final field names and artifact format (code against contracts.md, adapt on confirmation); live end-to-end check in get-started.md. Does not block 02 or 03 unit work.
- Needs from them: build + sign + publish to `gs://zekoder-releases/plugins/zekoder/` on tag CI; signed manifest with an incrementing `sequence`, channel pointers, compat range (daemon version), revoked list, immutable artifacts with sha256, and a `{keyId, sig}` signature list; their own WIF/service account confined to the `plugins/` prefix (separate from the desktop identity in feature 003 and skills' `releases/`); Version tab reading `paseo.pluginUpdates.status()`, showing "Restart the daemon to apply (Settings → Host → Restart daemon)" when `restartRequired` is true (no plugin-invoked restart in this feature) and "updates are managed by the desktop app" when `enabled` is false; final status field list (contract builtin-plugin-update-status, *(pending)* fields) forwarded via the coordinator.

## 2. Release signing public key(s)

- Type: key material / CI secret (non-coding)
- Owner: Cybernetic Labs release maintainer. The private key lives in a zekoder-plugins CI secret guarded by a GitHub tag ruleset (user decision); Studio is affected only through its trusted key list.
- Related contract: zekoder-plugin-release-manifest
- Blocks: enabling updates in shipped builds (package 01 `TRUSTED_KEYS`). Code, tests and wiring proceed with a test keypair generated inside tests.
- Deliver the `keyId` and base64 raw Ed25519 public key. Only the public key enters this repo. The rotation process is a separate followup, out of scope here.
