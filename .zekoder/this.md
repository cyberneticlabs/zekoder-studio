# This Repo — Planning Knowledge Base

This file is an **index**, not the whole knowledge base. It holds only the critical rules and
the exact commands an agent needs on every run; everything else is a one-line pointer into
`.zekoder/kb/`, pulled on demand with `zekoder_get_kb {references: [...], cwd: <your working
directory>}`.

Hard cap: 120 lines, enforced by `zekoder_update_kb`. Shipped/delivered history does not
belong here — query the item registry (`zekoder_list_items`, `zekoder_search`) instead.

## About this repo

Cybernetic Labs fork of Paseo (`cyberneticlabs/zekoder-studio`, npm workspace monorepo): the branded Zekoder Suite desktop, mobile and web distribution. It bundles Zekoder plugins and theme and adds product login (Cybernetic Labs Spine, OIDC), while staying upgradeable from upstream Paseo (`getpaseo/paseo`).
Serves Zekoder end users (humans running coding agents from desktop, mobile and web) and Cybernetic Labs maintainers who ship releases.
Not a permanent divergent rewrite of Paseo. Not the owner of agent execution, protocol or pairing (upstream's). Not the product backend (orgs, subscriptions, entitlements live in Spine). Not the zekoder-plugins repo.
Doing its job: branded desktop installs beside upstream Paseo, bundled plugins load at pinned versions, branding works before any daemon connects, login matches the agreed access policy, pairing and execution still work, one upstream upgrade completes, the release manifest identifies all bundled revisions.
Goals, dates and non-goals: kb/goals.md. Source: plan.md.

## Guidelines & hard boundaries

- Keep fork changes small and isolated within plan.md customization boundaries. Do not assume upstream hooks exist.
- Preserve upstream directory and internal names. Do not keep a permanent branding branch (branded work lives on `main`).
- Sync upstream only via `sync/paseo-*` branches. Merge with merge commits. Never squash sync PRs. Never rebase published history.
- Keep the protocol backward-compatible (docs/protocol-compatibility.md). Tag every shim `COMPAT(name)`.
- Leave agent execution, protocol and pairing to upstream. Get explicit human approval for architecture changes.
- Treat login as account identity only. Never treat it or a UI gate as daemon or backend authorization.
- Use Spine OIDC: Authorization Code + PKCE via the system browser. Store tokens in platform-secure storage. Verify ES256 tokens against Spine JWKS. Never accept HS256 or unverified tokens.
- Treat `current_org_id` as optional (absent is not an error). Read the org role from `GET /api/v1/me/orgs`, never from `roles`.
- Gate paid features on Spine tier/org_capabilities. Never call Stripe directly. Never run a separate shared Supabase Auth project.
- Never commit secrets, signing certificates or tokens. Keep provider credentials separately managed.
- Use distinct bundle IDs, URL schemes, app data, ports and `PASEO_HOME` from upstream. Never let a branded update install upstream binaries.
- Pin plugins to exact tested versions (no floating git branches). Preserve user-installed plugins and config.
- Audit inherited CI publishing, relay and download endpoints before enabling. Preserve license and attribution. Keep previous signed artifacts for rollback.
- Never restart the main daemon on :6767. Never run the full test suite locally (changed file only, `--bail=1`).
- Run typecheck and lint after every change and format before commit, via npm scripts only. Use npm only.
- Keep persistence file-based JSON (no database or migration tool). Do not hand-edit generated or patched paths (`dist/`, zod-aot validation output, `patches/`).
  Rationale and checks: kb/guardrails.md.

## Quality gates

Run after every change (npm scripts only, never raw npx eslint/oxlint/oxfmt):

- `npm run typecheck`
- `npm run lint` (targeted: `npm run lint -- <files>`)
- `npm run format` before commit (targeted: `npm run format:files -- <files>`; check: `npm run format:check`)
- Tests: ONLY the changed file: `npx vitest run <file> --bail=1 > /tmp/test-output.txt 2>&1`. NEVER `npm run test` for a workspace/whole repo locally; full suite = CI.
- Stale cross-package types: `npm run build:client` or `npm run build:server` first.
  Detail: kb/quality-gates.md

## Pre-flight / environment prerequisites

- `node -v` (Node 22+; 24 works) and `npm -v`
- `test -d node_modules && echo ok || npm install` (postinstall applies patches)
- `npm run build:client` (protocol+client declarations must be current before typecheck)
- `git status --short` (clean tree expected before planning)
- No database/migration tool; persistence is file-based JSON (docs/data-model.md)
- Do NOT touch the main daemon on port 6767; dev daemon uses 6768 via `npm run dev`
  Detail: kb/preflight.md

## Reference index

- `kb/architecture.md` — Architecture and file map
- `kb/conventions.md` — Naming conventions and norms
- `kb/discovery/branding.md` — Zekoder branding: BRAND module, asset generator, ids, i18n rewrite
- `kb/discovery/desktop-releases.md` — Desktop release matrix, updater boundaries and fork publisher audit
- `kb/discovery/plugins.md` — Plugin system: built-in registry, packaging, vendored zekoder plugin, start seams, RPC/feature-flag templates, plugin PaseoApi, CI checks
- `kb/goals.md` — Repo purpose, users, goals with dated success signals, and explicit non-goals
- `kb/guardrails.md` — Hard boundaries: each rule, why it exists, and how to check compliance
- `kb/preflight.md` — Pre-flight caveats
- `kb/quality-gates.md` — Quality gate detail and CI/hook wiring
