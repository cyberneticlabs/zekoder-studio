# Package 02 — plugin-release

- Branch: `008-plugin-source-consolidation-02-plugin-release` (cut after 01 merges)
- Worktree: `git worktree add ../worktrees/008-02 -b 008-plugin-source-consolidation-02-plugin-release main`, `npm install`.
- Contracts: consumes `zekoder-plugin-tree-module`, `zekoder-plugin-version-source`; owns the repo side of `plugin-release-channel` (cross-system).

## Context

- Source files at zekoder-plugins `v0.12.0-beta.1`: `.github/workflows/plugin-release.yml`, `scripts/plugin-release.mjs` (340 lines; check-tag, build, next, revoke, sign, verify, keygen), `scripts/plugin-release-keys.json` (key `zk-plugin-2026-10`), `docs/plugin-release.md` (runbook).
- Paths to re-root from `paseo/` to `plugins/zekoder/`: `plugin-release.mjs` L76-79 (`shared/plugin-version.ts`), L182, L205 (`--src`), L242 (`paseo-plugin.json` → `requires.paseo`). `REPO_ROOT` = script dir `..`, so `scripts/` works as is. `URL_PREFIX` and every GCS object path stay unchanged.
- Tag grammar becomes `zekoder-plugin-vX.Y.Z` (stable) and `zekoder-plugin-vX.Y.Z-beta.N` (beta); version = tag without the `zekoder-plugin-v` prefix, still cross-checked against `plugins/zekoder/package.json` and `PLUGIN_VERSION`. Manifest `tag` is a free string (`updates/manifest.ts:15`), so the daemon needs no change.
- GitHub `v*` (desktop-release, android-apk-release, deploy-app, release-notes-sync) never matches `zekoder-plugin-v*`. Plugin tags must not fire any of them, and desktop tags must not fire this workflow.
- Repo vars `GCP_WORKLOAD_IDENTITY_PROVIDER` / `GCP_SERVICE_ACCOUNT` belong to the desktop release. The plugin workflow reads them from the `plugin-release` **environment** (environment vars shadow repo vars) — external dependency 1.
- `TRUSTED_KEYS` (`packages/server/src/server/plugins/builtin/updates/trusted-keys.ts`) was copied from the keyring by hand; both now live here.

## Tasks

- [x] Copy `plugin-release.mjs` to `scripts/plugin-release.mjs` and the keyring to `scripts/plugin-release-keys.json`. Re-root the paths above; delete the script's own `computeTreeChecksum` and `copyAllowlist(srcDir, files, destRoot)` and import `computeTreeChecksum` and `copyAllowlist(sourceDir, targetDir, files)` from `scripts/zekoder-plugin-tree.mjs` (`build` stages with `copyAllowlist(plugins/zekoder, <stage>/zekoder, files)`; note the argument order), and make `build` report `treeChecksum` via `computeAllowlistChecksum` (the same function desktop provenance uses); new tag regexes and prefix strip in `check-tag`.
- [x] `scripts/plugin-release.test.mjs` (node:test): tag grammar accepts both forms and rejects `vX.Y.Z`; check-tag fails when the tag, `package.json` and `PLUGIN_VERSION` disagree; `build` stages exactly the `files` allowlist (no README.md, no package.json) and its `treeChecksum` equals `computeAllowlistChecksum(plugins/zekoder)`; sign → verify round-trip with a generated key; `TRUSTED_KEYS` equals the keyring entries. Register in `ci.yml:78`.
- [x] `.github/workflows/plugin-release.yml`: trigger `push: tags: ["zekoder-plugin-v*"]` plus the existing revoke `workflow_dispatch` (main only); keep the `plugin-release` environment, permissions, concurrency, merge-base check, upload and manifest CAS loop. Drop the `npm ci` + typecheck step: on a fresh runner `@getpaseo/builtin-plugins` cannot typecheck without first building `@getpaseo/plugin` declarations, and the merge-base check already requires the tagged commit to be on `main`, which CI typechecks on every push. The script needs no install (plain Node, no deps).
- [x] `scripts/ci-workflow.test.mjs`: assert the plugin workflow's tag trigger is exactly `zekoder-plugin-v*`, its permissions are `contents: read` + `id-token: write`, it uses the `plugin-release` environment, and no other workflow's tag filter matches `zekoder-plugin-v1.0.0`. The existing desktop `v*` assertion stays unchanged.
- [x] `docs/release.md`: new section "Zekoder plugin releases" after "Zekoder desktop releases", integrating zekoder-plugins `docs/plugin-release.md` (tag namespace, channels, steps, revoke, re-run, key custody, tag ruleset for `zekoder-plugin-v*`, compromise). State that plugin and desktop releases are independent and agents follow the same tag rules. `CLAUDE.md` "Zekoder desktop releases" paragraph: add one sentence that plugin tags follow the same agent-only rule, linking the new section. `docs/plugins.md` (rewritten in 01) links here. Drop the "copied verbatim" note on `trusted-keys.ts`. Cite the publishing design as Studio feature 013 (imported zekoder-plugins 023), never as a zekoder-plugins item; package 04 fixes any remaining citation.

## Verification

- `node --test scripts/plugin-release.test.mjs scripts/ci-workflow.test.mjs scripts/zekoder-plugin-tree.test.mjs`.
- `node scripts/plugin-release.mjs check-tag zekoder-plugin-v0.12.0-beta.1` prints `0.12.0-beta.1 beta`; `node scripts/plugin-release.mjs build 0.12.0-beta.1 /tmp/zp` produces `zekoder-plugin-v0.12.0-beta.1.tar.gz` and prints a `treeChecksum` equal to `computeAllowlistChecksum("plugins/zekoder")`.
- `npm run typecheck`, `npm run lint -- scripts/plugin-release.mjs scripts/plugin-release.test.mjs`, `npm run format:files` on changed files.
- Never push a tag or dispatch the workflow from this package.

## Progress

- Status: planned
- Completed: none
- Blockers: none (external dependency 1 is needed only before the first real release)
