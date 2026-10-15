# Package 01 — in-repo-source

- Branch: `008-plugin-source-consolidation-01-in-repo-source`
- Worktree: `git worktree add ../worktrees/008-01 -b 008-plugin-source-consolidation-01-in-repo-source main`, then `npm install`, `npm run build:client`.
- Contracts: `zekoder-plugin-tree-module` (owner), `zekoder-plugin-version-source` (owner).

## Context

- Source: `/Users/ahmedelshalaby/Code/zekoder/zekoder-plugins`, tag `v0.12.0-beta.1` (`git -C <plugins> archive v0.12.0-beta.1 paseo`). Today's vendored copy is v0.11.1: 22 files differ, new `server/unzip.ts` and `shared/plugin-version.ts`.
- Copy the `paseo/package.json` `files` allowlist (`paseo-plugin.json`, `index.client.tsx`, `index.server.ts`, `client/`, `shared/`, `server/`) plus `README.md`. Do NOT copy `node_modules`, `package-lock.json`, `tsconfig.json` (a nested tsconfig breaks the plugin compiler's resolution) or `.gitignore`.
- Add a slim `plugins/zekoder/package.json`: `name` `paseo-zekoder`, `version` `0.12.0-beta.1`, `private: true`, `type: "module"` (NodeNext treats the `.ts` files as CJS without it), `files` as above. No deps, no scripts.
- `README.md` and `package.json` sit in `plugins/zekoder/` but outside `files`, so a whole-directory checksum never equals the release artifact's `treeChecksum`. Every checksum that names a plugin version (desktop provenance, release build) is `computeAllowlistChecksum`: stage the `files` allowlist, then hash the staged tree. It is not a workspace member (root `workspaces` lists `plugins` only), so the lockfile is unaffected. All imports are host modules (`compiler.ts:13`, client externals ~L401).
- Lock consumers to repoint:
  - `packages/server/src/server/plugins/builtin/updates/wiring.ts:14-25` `readLockVersion` → read `<root>/zekoder/package.json` `version`. Absent/invalid still yields null (updater off, nothing throws).
  - `updates/tree-checksum.ts:5-7` comment; `updates/tree-checksum.test.ts:9-15` (pins against the lock).
  - `plugins/index.posix.test.ts:1808` fixture writes `zekoder.lock.json`.
  - `scripts/desktop-release/release-data.mjs:7,258` (`validateLock`, `pluginsFromLock`), `prepare-release.mjs:268-276`, `release-ci.mjs:100-108`, `test-fixtures.mjs:97`, their `*.test.mjs`, and `packages/desktop/src/features/__fixtures__/desktop-release-catalog.wire.json:16,224`.
  - `packages/app/src/zekoder/host-provisioning.ts:3,8` + `host-provisioning.test.ts:86-92`.
  - `.github/workflows/ci.yml:78` node --test list; `.gitattributes:2-3`; `.oxfmtrc.json:14`, `.oxlintrc.json:6`, `knip.json` (`plugins` → `ignore: ["zekoder/**"]`).
- Desktop catalog `plugins` record keeps its shape `{repo, ref, commit, version, checksum}` (old catalogs and the wire fixture stay valid): `repo` = this repo's git URL, `ref` = `plugins/zekoder`, `commit` = tag commit, `version` from `plugins/zekoder/package.json` at that commit, `checksum` = `computeAllowlistChecksum` of `plugins/zekoder` at that commit (export the commit's tree with `git archive` into a temp dir; never hash the working tree). It equals the `treeChecksum` a plugin release of the same version publishes.

## Tasks

- [ ] Copy the source and write the slim `package.json` as above. Delete `plugins/zekoder.lock.json`, `scripts/sync-zekoder-plugin.mjs`, `scripts/sync-zekoder-plugin.test.mjs`; drop the test from `ci.yml:78`.
- [ ] New `scripts/zekoder-plugin-tree.mjs` (contract `zekoder-plugin-tree-module`): `computeTreeChecksum(dir)` and `copyAllowlist(sourceDir, targetDir, files)` moved verbatim from the deleted sync script (~L115, L132), `computeAllowlistChecksum(dir)` (reads `files` from `<dir>/package.json`, then `copyAllowlist` into a temp dir and hash), `readZekoderPluginVersion(dir)`, `zekoderPluginProvenanceAt(git, commit)`. Sibling `scripts/zekoder-plugin-tree.test.mjs` (README and package.json changes leave `computeAllowlistChecksum` unchanged; a file change under `shared/` changes it); register it in `ci.yml:78`.
- [ ] Desktop release: replace `pluginsFromLock` / the `git show ...zekoder.lock.json` reads in `release-data.mjs`, `prepare-release.mjs`, `release-ci.mjs` with `zekoderPluginProvenanceAt`; update `test-fixtures.mjs` and the release tests. Keep the wire fixture's old record (it proves old catalogs parse) and add no new schema field.
- [ ] `wiring.ts`: version from `zekoder/package.json`; update `index.posix.test.ts:1808` fixture. `tree-checksum.test.ts`: assert the server port equals `computeTreeChecksum` from `scripts/zekoder-plugin-tree.mjs` on `plugins/zekoder` (parity, not a pinned hash).
- [ ] `host-provisioning.ts`: keep `ZEKODER_PLUGIN_VERSION = "0.11.1"` (user decision: the published npm package). Rewrite the comment: it pins the npm package, not the built-in. Test: drop the lock read, assert an exact semver. (Package 03 files the npm-publish followup.)
- [ ] Remove the `plugins/zekoder/**` ignores from `.oxfmtrc.json` and `knip.json`, run `npm run format:files -- plugins/zekoder`, fix knip findings. Remove the `.oxlintrc.json` ignore and fix violations; if more than ~30, keep the ignore and file a followup with `zekoder_create_item` instead. Keep `.gitattributes` `plugins/zekoder/** -text` (checksum stable on Windows); fix its comment.
- [ ] `docs/plugins.md`: rewrite "Vendored plugins" (~L124-140) as "The Zekoder plugin": source in `plugins/zekoder/`, version in its `package.json`, edit in place, how desktop release records provenance. Fix L109 and L159-162 references to the lock and to zekoder-plugins. Link docs/release.md for releasing (package 02 writes that section).

## Verification

- `npm run typecheck` (covers `@getpaseo/builtin-plugins`), `npm run lint`, `npm run format:check`, `npm run knip`.
- `node --test scripts/zekoder-plugin-tree.test.mjs scripts/desktop-release/*.test.mjs scripts/ci-workflow.test.mjs`.
- `npx vitest run packages/server/src/server/plugins/builtin/updates/tree-checksum.test.ts --bail=1`, same for `updates/index.test.ts`, `plugins/index.posix.test.ts`, `packages/app/src/zekoder/host-provisioning.test.ts` (output to `/tmp/test-output.txt`).
- `npm run build:server && node --test scripts/builtin-plugins-dist.test.mjs` — built `dist/server/builtin-plugins/zekoder/package.json` exists and the update wiring reports `bundledVersion` `0.12.0-beta.1`.
- `rg "zekoder.lock|sync-zekoder-plugin" --glob '!.zekoder/**'` returns nothing.

## Progress

- Status: planned
- Completed: none
- Blockers: none
