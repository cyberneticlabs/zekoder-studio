# Consolidate Zekoder plugin source and independent releases into Studio — Checklist

## Feature-level gates

- [ ] All packages merged
- [ ] Full quality-gate suite green on the base branch (see this.md → Quality gates), CI green on GitHub Actions
- [ ] get-started.md walkthrough executed end-to-end
- [ ] No secret, signing key or token committed
- [ ] External dependencies 2 and 3 verified before dependency 4 (archive) is requested from the user

## Package 01 — in-repo-source

- [ ] `plugins/zekoder/` matches zekoder-plugins `v0.12.0-beta.1` allowlist (plus README and slim package.json), modulo formatting
- [ ] No reference to `zekoder.lock` or `sync-zekoder-plugin` outside `.zekoder/`
- [ ] Daemon `bundledVersion` reads `plugins/zekoder/package.json`; auto-update still eligible in packaged builds
- [ ] `plugins/zekoder/package.json` has `type: "module"` and only the contract's fields
- [ ] Desktop release provenance comes from the tag commit's tree via `computeAllowlistChecksum`; old wire fixture still parses
- [ ] Lint/format/knip cover `plugins/zekoder/` (or a followup filed for the remaining oxlint ignore)

## Package 02 — plugin-release

- [ ] Tag grammar `zekoder-plugin-vX.Y.Z[-beta.N]`; `vX.Y.Z` rejected
- [ ] No workflow other than `plugin-release.yml` matches a `zekoder-plugin-v*` tag; desktop `v*` trigger unchanged
- [ ] Release `build` `treeChecksum` equals `computeAllowlistChecksum(plugins/zekoder)`; server port agrees with the tree module; `TRUSTED_KEYS` equals the keyring
- [ ] Release job has no install/typecheck step; merge-base check on `main` kept
- [ ] docs/release.md "Zekoder plugin releases" section written; CLAUDE.md links it

## Package 03 — registry-import

- [ ] Every zekoder-plugins item imported or merged per the id map, with provenance and rewritten relations
- [ ] Features 012 and 014 `planned`, verbatim, flagged "needs re-plan against zekoder-studio"
- [ ] Feature 005 cancelled with a pointer to 008; npm-publish followup filed

## Package 04 — kb-docs

- [ ] KB merged: `discovery/zekoder-plugin.md` ≤150 lines and stamped; `discovery/plugins.md`, `guardrails.md` #12, index and goals.md (L20, L24, L41) updated
- [ ] `docs/zekoder-plugin.md` added to the CLAUDE.md docs table; feature-023 citations repointed to Studio feature 013; plan.md updated
