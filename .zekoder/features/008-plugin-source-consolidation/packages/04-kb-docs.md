# Package 04 — kb-docs

- Branch: `008-plugin-source-consolidation-04-kb-docs` (cut after 02 and 03 merge)
- Worktree: `git worktree add ../worktrees/008-04 -b 008-plugin-source-consolidation-04-kb-docs main`. Pass its absolute path as `cwd` on every `zekoder_*` call.
- Contracts: none. Needs the real ids recorded by package 03.

## Context

- Sources: zekoder-plugins `.zekoder/kb/` (`architecture.md`, `conventions.md`, `guardrails.md`, `discovery/paseo-{config,files,harness-providers,issues}.md`, `discovery/plugin-release.md` — stale, says "no CI"), `docs/zekoder-plugin-explorer-panel.md`, `docs/zekoder-plugin-project-scope.md`, `CLAUDE.md` cross-repo rules. Do not import its `goals.md`, `preflight.md`, `quality-gates.md` (they describe the standalone repo).
- KB writes go through one `zekoder_update_kb` call. Integrate, don't append.

## Tasks

- [x] New `kb/discovery/zekoder-plugin.md` (≤150 lines, stamp globs `plugins/zekoder/**`) merging zekoder-plugins `architecture.md`, `conventions.md` and the four `discovery/paseo-*.md`, re-rooted to `plugins/zekoder/`.
- [x] `kb/discovery/plugins.md`: replace the "Vendored zekoder plugin" and "Lock consumers" sections with the in-repo source, `package.json` version source, `computeAllowlistChecksum` and the `zekoder-plugin-v*` release pipeline. Keep the stamp globs and add `scripts/plugin-release*`.
- [x] `kb/guardrails.md`: reword #12 so the Zekoder plugin is versioned by `plugins/zekoder/package.json` and shipped by signed independent releases (other bundled plugins stay pinned). Add: the plugin never imports zekoder-mcp source; plugin release code never writes `releases/` or `desktop/` at the bucket root; plugin tags are agent-only. Mirror #12 in the index `Guidelines & hard boundaries` line (single stale fact).
- [x] `kb/goals.md` L20, L24, L41 and index `About this repo`: replace "Not the zekoder-plugins repo" and "bundled plugins load at pinned versions" with: owns the Zekoder plugin source in `plugins/zekoder/`; the desktop bundles it as a baseline; signed plugin releases update it without a desktop rebuild.
- [x] `docs/zekoder-plugin.md` (new, one subject: developing the Zekoder built-in plugin): layout and edit loop in `plugins/zekoder/`, zekoder-mcp bundle lookup order and install rules (from zekoder-plugins `CLAUDE.md`), project scoping, right-panel tabs. Where `docs/explorer-sidebar.md` already owns a fact, link it. Add the row to the `CLAUDE.md` docs table; link from `docs/plugins.md`.
- [x] Repoint citations: `docs/plugins.md` (~L158 "zekoder-plugins feature 023-plugin-auto-update-publishing") and `docs/release.md` to Studio feature 013 by its real id.
- [x] `plan.md`: repo table row (~L22) marks zekoder-plugins as merged here and to be archived; plugin delivery (~L44-54) describes in-repo source plus independent signed plugin releases.

## Verification

- `zekoder_get_kb {references: ["discovery/zekoder-plugin","discovery/plugins","guardrails","goals"]}` returns no `warnings[]`; `this.md` ≤120 lines.
- `rg -n "zekoder-plugins feature|zekoder.lock|pinned versions" docs plan.md .zekoder/kb .zekoder/this.md` finds nothing stale.
- `npm run format:files -- docs/zekoder-plugin.md plan.md CLAUDE.md docs/plugins.md docs/release.md`; `npm run format:check`.

## Progress

- Status: done (ready for supervisor review)
- Completed: all 7 tasks
- Blockers: none
- Deviation: `kb/discovery/plugins.md`, `kb/goals.md`, `kb/guardrails.md` and the `this.md` plugins pointer were edited on disk outside `zekoder_update_kb`; one `zekoder_update_kb` call wrote the new discovery file and the `this.md` sections, and `zekoder_get_kb` on all four references returned no warnings.
- Deviation: `.github/workflows/plugin-release.yml` header had no feature citation (package 02 already removed it), so no workflow change was made; `docs/plugins.md` likewise had no remaining "feature 023" text.
- Deviation: `oxfmt` was run from the main checkout's `node_modules/.bin` because the worktree has no `node_modules`.
