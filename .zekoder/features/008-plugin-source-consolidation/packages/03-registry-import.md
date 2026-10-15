# Package 03 — registry-import

- Branch: `008-plugin-source-consolidation-03-registry-import` (cut after 01 merges: 01 may file a followup, and two branches allocating followup ids in parallel collide)
- Worktree: `git worktree add ../worktrees/008-03 -b 008-plugin-source-consolidation-03-registry-import main`. Pass its absolute path as `cwd` on every `zekoder_*` call.
- Contracts: none.

## Context

- Source: `/Users/ahmedelshalaby/Code/zekoder/zekoder-plugins/.zekoder/`. Every `.zekoder/` write goes through `zekoder_create_item` / `zekoder_write_doc` / `zekoder_update_item`; never copy files by hand. Skip tooling state (`config.json`, `this.md`, `kb/` — package 04 —, `codex-install/`, `harness-install/`, `.preflight-cache`).
- Expected id map (actual ids come from `zekoder_create_item {baseRef: "main"}`; record the real ones in this doc's Progress for package 04):

| zekoder-plugins | Studio | Status |
|---|---|---|
| feature 019-paseo-copy-implement-and-promote-idea-buttons | feature 009 | merged |
| feature 020-launch-button-defaults (folder) | feature 010 | merged |
| feature 021-versionless-role-model-defaults (folder) | feature 011 | merged |
| feature 022-omp-provider-settings | feature 012 | planned, needs re-plan |
| feature 023-plugin-auto-update-publishing (folder) | feature 013 | merged |
| feature 024-remote-file-explorer (folder) | feature 014 | planned, needs re-plan |
| bug 001-git-panel-not-showing-on-ipad | bug 011 | merged |
| bug 002-machine-settings-need-project | bug 012 | merged |
| followup 001-plugin-signing-key-rotation | merged into Studio followup 002 | — |
| followup 002-replace-unzip-with-node-extraction | followup 008 | merged |
| decision 001-three-tier-agent-defaults | decision 002 | accepted |
| idea 001-branded-zekoder-app-after-synkvault | idea 001 | rejected |
| vendor-issue 001-zekoder-installer-not-windows-compatible | vendor-issue 001 | resolved |

## Tasks

- [ ] Create each item with the same slug and title (`full: true` for the four folder features), write every doc body verbatim with `zekoder_write_doc`, then prepend one provenance line to each primary doc: `> Imported from cyberneticlabs/zekoder-plugins <type> <old id> (feature 008-plugin-source-consolidation).`
- [ ] Planned features 012 and 014: keep status `planned` and the bodies verbatim (no rewritten gates or paths); their provenance line adds `Needs re-plan against zekoder-studio before execution.`
- [ ] Merged and other items: rewrite old item ids → new ids (map above) and `paseo/` / `packages/paseo/` paths → `plugins/zekoder/` inside the bodies.
- [ ] `zekoder_update_item` each: status, severity/origin, `externalSystem`, relations rewritten to new ids (010↔009/011, 011↔010, decision 002 → features 010/011, feature 013 → followup 002), `packages`/`contracts` arrays with re-rooted `filesTouched` (planned features unchanged). If the server rejects a terminal status on a new item, stop and report; do not fake history.
- [ ] Studio followup 002-plugin-signing-key-rotation: `zekoder_write_doc` patch it to absorb zekoder-plugins followup 001 (CI dual-sign + secret swap now in `scripts/plugin-release.mjs` and `plugin-release.yml`), remove its "paired repo" TODO, link feature 013.
- [ ] Feature 005-dev-zekoder-plugin-path-override (user decision): `zekoder_update_item` to status `cancelled` (or the server's superseded equivalent) and patch its doc with `Superseded by feature 008-plugin-source-consolidation: the plugin source now lives in plugins/zekoder/.`
- [ ] New followup via `zekoder_create_item` (user decision): "Publish @cyberneticlabs/paseo-zekoder to npm from plugin-release.yml", related feature 008 and 006; context: `packages/app/src/zekoder/host-provisioning.ts` pins `0.11.1` for stock daemons and can only move once the in-repo release workflow publishes the npm package.

## Verification

- `zekoder_list_items {itemTypes: ["feature","bug","followup","decision","idea","vendor-issues"]}` shows every mapped item with the right status and relations, feature 005 cancelled, and the npm followup open.
- `rg -n "paseo/" .zekoder/features/009* .zekoder/features/010* .zekoder/features/011* .zekoder/features/013*` finds nothing; `rg -n zekoder-plugins` on imported items finds only provenance lines.

## Progress

- Status: planned
- Completed: none
- Blockers: none
