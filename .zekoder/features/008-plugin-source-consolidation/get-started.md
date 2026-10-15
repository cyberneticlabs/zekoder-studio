# Get started — 008-plugin-source-consolidation

## Prerequisites

- Node 22+, npm; `npm install` at the root; `npm run build:client`.
- Never touch the daemon on :6767. The dev daemon is `npm run dev` (6768).

## Run

- `npm run dev` then `npm run dev:desktop`. The built-in plugin loads from `plugins/zekoder/`.

## Manual walkthrough

1. Open `plugins/zekoder/package.json`. It shows `version` `0.12.0-beta.1` and no deps. `plugins/zekoder.lock.json` and `scripts/sync-zekoder-plugin.mjs` are gone.
2. Start the dev daemon and app. The sidebar shows Issues, Reports and Zekoder. Each surface opens without a fallback message.
3. Edit a label in `plugins/zekoder/client/version-panel.tsx` and restart the dev daemon. The change shows in the app with no sync step.
4. Run `npm run build:server`. `packages/server/dist/server/builtin-plugins/zekoder/package.json` exists. `node --test scripts/builtin-plugins-dist.test.mjs` passes.
5. Run `node scripts/plugin-release.mjs check-tag zekoder-plugin-v0.12.0-beta.1`. It prints `0.12.0-beta.1 beta`. With `v0.12.0-beta.1` it fails.
6. Run `node scripts/plugin-release.mjs build 0.12.0-beta.1 /tmp/zp`. The tarball has one `zekoder/` root with no README.md or package.json, and the printed `treeChecksum` equals `computeAllowlistChecksum("plugins/zekoder")` from `scripts/zekoder-plugin-tree.mjs`.
7. Run `node --test scripts/ci-workflow.test.mjs`. It proves that a `zekoder-plugin-v*` tag triggers only `plugin-release.yml`.
8. Run `zekoder_list_items`. It shows imported features 009-014, bugs 011-012, followup 008, decision 002, idea 001 and vendor-issue 001, each with a provenance line; features 012 and 014 are `planned` and flagged for re-plan; feature 005 is cancelled with a pointer to 008.

## Integration-test mapping

| Step | Test |
|---|---|
| 1, 4 | `scripts/builtin-plugins-dist.test.mjs`, `updates/tree-checksum.test.ts` |
| 2 | `packages/desktop/e2e/packaged-app-smoke.js` (CI) |
| 5, 6 | `scripts/plugin-release.test.mjs` |
| 7 | `scripts/ci-workflow.test.mjs` |
| Desktop provenance | `scripts/desktop-release/*.test.mjs`, `scripts/zekoder-plugin-tree.test.mjs` |
| 8 | manual (registry) |
