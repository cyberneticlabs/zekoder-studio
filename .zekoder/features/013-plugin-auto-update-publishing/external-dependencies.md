# Plugin auto-update publishing — External Dependencies

None of these block merging code. 1 and 2 block the first live release; 3 and 4 block end-to-end auto-update.

## 1. GCS publish identity for the plugin release workflow

- **Type**: GCP IAM + GitHub repository variables
- **Owner**: Cybernetic Labs GCP / repository maintainer
- **Blocks packages**: 01 (live release run only)
- **Related contract**: plugin-release-channel
- **Details**: The existing WIF provider `github-repo` trusts only `cyberneticlabs/zekoder-skills`. Add a provider (or condition) trusting the plugin release repository (now `cyberneticlabs/zekoder-studio`) on `refs/tags/v*` and `refs/heads/main`. New service account (e.g. `zekoder-plugin-release@zekoder-484012.iam.gserviceaccount.com`) with `roles/storage.objectAdmin` on bucket `zekoder-releases` under IAM condition `resource.name.startsWith("projects/_/buckets/zekoder-releases/objects/plugins/zekoder/")`. Set repo variables `ZEKODER_RELEASE_BUCKET=zekoder-releases`, `GCP_WORKLOAD_IDENTITY_PROVIDER`, `GCP_SERVICE_ACCOUNT`. Prove a write to `releases/` is denied. No key files.

## 2. Plugin signing key, `plugin-release` environment and tag ruleset

- **Type**: secret provisioning + GitHub repository settings
- **Owner**: Cybernetic Labs release maintainer (two named key holders)
- **Blocks packages**: 01 (live release run only)
- **Related contract**: plugin-release-channel
- **Details**:
  - On a trusted machine run `node scripts/plugin-release.mjs keygen zk-plugin-2026-10 <path outside repo>`. Create GitHub Environment `plugin-release` (deployment refs: `v*` tags and `main`, **no required reviewers**); secret `ZEKODER_PLUGIN_SIGNING_KEY` = private PKCS8 PEM, variable `ZEKODER_PLUGIN_SIGNING_KEY_ID`. Store an encrypted backup in the company password vault; delete the local file. Commit the printed public keyring entry (raw base64 key) to `scripts/plugin-release-keys.json` via PR and hand it to Studio (dependency 3).
  - **Tag ruleset (the key guard)**: GitHub repository ruleset targeting tags `v*` that restricts creation, update and deletion; bypass list = the named release maintainers only.
  - **Accepted risk** (user decision): signing is fully automatic on a tag, with no reviewer gate. Anyone who can push a `v*` tag (ruleset: named maintainers) or change the workflow on `main` can get a signature. The tag-commit-is-ancestor-of-`main` check in CI is a safety check against mistakes, not a security control.

## 3. Studio 004 consumes the release channel

- **Type**: other-repo change (cyberneticlabs/zekoder-studio, feature 004-plugin-auto-update)
- **Owner**: Studio team
- **Blocks packages**: none (end-to-end only)
- **Related contract**: plugin-release-channel
- **Details**: Embed the keyring, fetch `plugins/zekoder/manifest.json`, verify the envelope, enforce `sequence` (persist highest verified, reject lower as `sequence-replay` — Studio's draft already plans this reader check), `revoked`, `requires.paseo` against the **daemon** version, `sha256`/`size`/`treeChecksum`; apply the reader selection rule with the app channel, stage for next daemon start, fall back to bundled.
- **Differences from the Studio 004 draft** (`zekoder-plugin-release-manifest`; this repo is owner; Studio must change):
  - **Signature (change required)**: one envelope `{schemaVersion, payload (base64 bytes), signatures[{keyId, alg, sig}]}` in `manifest.json`, not a body plus detached `manifest.json.sig` with `[{keyId, sig}]`. Verify decoded `payload` bytes, then parse. Reason: one object = atomic update; a separate `.sig` can be read out of step with `manifest.json` during a publish (CDN/cache skew) and give a spurious `signature-invalid`.
  - **`revoked` (change required)**: objects `{version, reason, revokedAt}`, not strings. (Informational: Studio may keep revoked state internally as a list of version strings; only the manifest wire format must be objects.)
  - **Error codes (add)**: verify `artifact.size` and `treeChecksum`, reporting `size-mismatch` and `tree-checksum-mismatch`.
  - Now matching Studio: compat key `requires.paseo` (daemon version); `sequence` integer, lower rejected, equal no-op (also bumped on revocation-only writes).
  - Release entries add `tag`, `publishedAt`, `treeChecksum`; payload adds `publishedAt`.
  - Artifact folder is `releases/vX.Y.Z/` (with `v`), not `releases/<version>/`; always use the manifest `url`.
  - Unpacked tarball has one root dir `zekoder/` holding `paseo-plugin.json` etc., not the files at the root.
  - Keyring: same `{keyId, publicKey}` raw base64 32-byte keys, plus `alg`, `addedAt`.

## 4. Studio 004 exposes `pluginUpdates.status` (Studio-owned API)

- **Type**: other-repo change (Studio protocol + `PaseoApi` + plugin server context)
- **Owner**: Studio team (owns the shape; this repo consumes)
- **Blocks packages**: none (02 shows "Unknown — host does not report plugin updates" until it exists)
- **Related contract**: builtin-plugin-update-status (Studio contract id; Studio types `BuiltinPluginUpdate*`)
- **Details**: Studio ships its flat status (contracts.md; final and confirmed) on wire `plugin.updates.get_status.request/.response`, flag `server_info.features.pluginUpdates`, call `paseo.pluginUpdates.status("zekoder")` (plain string `pluginId`; returns `BuiltinPluginUpdateStatus[]`) on the server-side `PaseoApi` given to plugin `server.handle` handlers (package 02 reads it there). Auto-update runs only when the desktop app launches the daemon; otherwise `enabled: false`. Channel comes from the desktop app. `restartRequired` is final (includes rollback to bundled after a revoke). No restart API: the plugin never restarts; users restart from Settings → Host → Restart daemon.
- **This repo's requests to Studio on this contract**: none open. All consumed fields are confirmed (contracts.md). Remaining Studio changes are in dependency 3 (envelope, revoked objects, `size-mismatch`/`tree-checksum-mismatch`).
