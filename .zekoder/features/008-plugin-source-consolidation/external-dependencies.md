# External dependencies — 008-plugin-source-consolidation

All are human tasks. Agents never create secrets, push tags, dispatch workflows or archive repos without the user's explicit go-ahead.

## 1. Plugin release environment in cyberneticlabs/zekoder-studio

- Type: GitHub + GCP config. Owner: Cybernetic Labs maintainer. Blocks: the first real plugin release (not package merges). Contract: `plugin-release-channel`.
- Create environment `plugin-release` (deployment refs: tags `zekoder-plugin-v*`, branch `main`). Move the **existing** secret `ZEKODER_PLUGIN_SIGNING_KEY` (do not generate a new key). Environment vars: `ZEKODER_PLUGIN_SIGNING_KEY_ID=zk-plugin-2026-10`, `ZEKODER_RELEASE_BUCKET`, `GCP_WORKLOAD_IDENTITY_PROVIDER`, `GCP_SERVICE_ACCOUNT` (the plugin publisher's, not the desktop one).
- Allow `cyberneticlabs/zekoder-studio` in the plugin service account's Workload Identity attribute condition (today it trusts zekoder-plugins).
- Tag ruleset: only maintainers create `zekoder-plugin-v*` tags.

## 2. First plugin release from Studio (retirement gate A)

- Type: release, human-approved. Owner: maintainer or agent with go-ahead. Blocks: dependency 4.
- Bump `plugins/zekoder/package.json` + `PLUGIN_VERSION` past `0.12.0-beta.1`, merge, tag `zekoder-plugin-v<version>`. Confirm the signed manifest lists it, and that an installed desktop on the matching channel stages and runs it after restart (Settings → plugin Version tab).

## 3. Desktop release built from in-repo source (retirement gate B)

- Type: release, human-approved. Owner: maintainer. Blocks: dependency 4.
- Tag a desktop `vX.Y.Z[-beta.N]` per docs/release.md. Confirm the catalog `plugins` record shows `repo` zekoder-studio, the built-in plugin starts offline, and no plugin release was needed.

## 4. Retire cyberneticlabs/zekoder-plugins

- Type: repo admin. Owner: user only, after explicit go-ahead and gates A and B.
- Make a last commit to its README pointing to `cyberneticlabs/zekoder-studio/plugins/zekoder`. Disable or remove its `plugin-release.yml` and environment secret so two repos can never sign. Archive the repo on GitHub. Update any cross-repo references (zekoder-skills docs, org READMEs) that name it.
