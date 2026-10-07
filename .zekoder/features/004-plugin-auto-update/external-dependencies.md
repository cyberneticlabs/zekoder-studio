# External dependencies

Neither blocks merging code. Both block the live end-to-end walkthrough (get-started.md).

## 1. zekoder-plugins feature 023-plugin-auto-update-publishing

- Type: other repository feature (cyberneticlabs/zekoder-plugins)
- Owner: zekoder-plugins maintainers
- Feature id: `023-plugin-auto-update-publishing`
- Related contracts: plugin-release-channel (023 owns; Studio consumes), builtin-plugin-update-status (Studio owns; 023 package 02 consumes)
- Blocks: live end-to-end check only. 01 codes against contracts.md › plugin-release-channel, which mirrors 023's final format; 02 and 03 are unaffected.
- They deliver: tag CI that builds, signs and publishes to `gs://zekoder-releases/plugins/zekoder/` — the signed envelope `manifest.json`, immutable `releases/vX.Y.Z[-beta.N]/zekoder-plugin-vX.Y.Z[-beta.N].tar.gz` artifacts with `sha256`, `size` and `treeChecksum`, `sequence`, `requires.paseo`, append-only `revoked` objects — under their own GCS identity confined to `plugins/zekoder/`. Their Version tab calls `paseo.pluginUpdates.status("zekoder")` from its `server.handle` handlers, shows "Restart the daemon to apply (Settings → Host → Restart daemon)" when a restart is needed and "Updates are managed by the desktop app" when `enabled` is false.
- We deliver to them: the status API exactly as contracts.md › builtin-plugin-update-status states (final field list, no open requests).

## 2. Release signing public key

- Type: key material (non-coding)
- Owner: Cybernetic Labs release maintainer, via 023's external dependency 2: a PR adding the key entry to zekoder-plugins `scripts/plugin-release-keys.json`. The private key stays a zekoder-plugins CI secret.
- Related contract: plugin-release-channel (keyring)
- Blocks: enabling updates in shipped builds. Until it lands, `TRUSTED_KEYS` (package 01) ships empty and the updater is disabled with no network calls. Code, tests and wiring proceed with a keypair generated inside tests.
- Action once merged there: copy the `{keyId, alg, publicKey, addedAt}` entry verbatim into `packages/server/src/server/plugins/builtin/updates/trusted-keys.ts` in a small Studio PR. Only the public key enters this repo. Rotation is followup 002-plugin-signing-key-rotation.
