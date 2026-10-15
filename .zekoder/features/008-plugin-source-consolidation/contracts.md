# Contracts — 008-plugin-source-consolidation

## zekoder-plugin-version-source

- Type: internal. Owner: 01. Consumers: 02.
- `plugins/zekoder/package.json` `version` is the only version of the built-in Zekoder plugin. `plugins/zekoder/shared/plugin-version.ts` `PLUGIN_VERSION` must equal it.
- Readers: the daemon (`updates/wiring.ts`, `bundledVersion`), the desktop release provenance (01), the plugin release `check-tag` (02).
- Allowed fields only: `name`, `version`, `private`, `type: "module"`, `files`. `files` lists exactly what ships: `paseo-plugin.json`, `index.client.tsx`, `index.server.ts`, `client/`, `server/`, `shared/`. No `dependencies`, no `scripts`. `README.md` and `package.json` itself stay outside `files`.

## zekoder-plugin-tree-module

- Type: internal. Owner: 01. Consumers: 02.
- `scripts/zekoder-plugin-tree.mjs` (Node ESM, no deps):
  - `computeTreeChecksum(dir: string): string`: regular files only, symlinks rejected, sorted `/`-joined relative paths, sha256 over `"<path>\0<len>\0"` + bytes + `"\0"`, hex. Byte-identical to `packages/server/src/server/plugins/builtin/updates/tree-checksum.ts`.
  - `copyAllowlist(sourceDir: string, targetDir: string, files: string[]): void`: moved verbatim from `scripts/sync-zekoder-plugin.mjs:132`; copies each `files` entry from `sourceDir` into `targetDir`. The caller reads `files` from `package.json`. This is the only `copyAllowlist`; the release script's own `copyAllowlist(srcDir, files, destRoot)` is deleted, not adapted.
  - `computeAllowlistChecksum(dir: string): string`: reads `files` from `<dir>/package.json`, calls `copyAllowlist(dir, <temp dir>, files)`, then `computeTreeChecksum(<temp dir>)`. The only checksum that identifies a plugin version: desktop provenance `checksum` and release `build` `treeChecksum` both use it, so they are equal for the same commit.
  - `readZekoderPluginVersion(dir: string): string`: the semver `version` from `<dir>/package.json`; throws when it is missing or invalid.
  - `zekoderPluginProvenanceAt(git, commit): {repo, ref, commit, version, checksum}`: computed from the commit's tree, never the working tree; `checksum` = `computeAllowlistChecksum`.

## plugin-release-channel

- Type: cross-system. Counterpart: GCS `gs://zekoder-releases/plugins/zekoder/` + GitHub `plugin-release` environment. External dependency 1. Owner: 02.
- Unchanged from feature 004 / zekoder-plugins feature 023: signed envelope at `plugins/zekoder/manifest.json`, artifacts at `plugins/zekoder/releases/v<version>/zekoder-plugin-v<version>.tar.gz`, key `zk-plugin-2026-10`, tree checksum above. Only the git tag that triggers publishing changes, to `zekoder-plugin-v<version>`; the manifest `tag` field carries it.
