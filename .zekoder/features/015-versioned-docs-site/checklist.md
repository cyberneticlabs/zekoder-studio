# Multi-language versioned documentation site — Checklist

## Feature-level gates

- [ ] All packages merged
- [ ] Full quality-gate suite green on the base branch (see this.md → Quality gates)
- [ ] get-started.md walkthrough executed end-to-end
- [ ] No GCS credentials, keys or tokens committed
- [ ] User confirmed the Cloud Run + GCS volume design and `docs.zekoder.com` domain mapping (Overview, Open assumptions 1–2)

## Package 01 — docs-site

- [ ] `packages/docs` in root `workspaces`; `package-lock.json` updated with npm
- [ ] `npm run typecheck` includes the docs workspace and passes
- [ ] `generate` with a `/v0.0.1/` base URL exits 0 and emits `index.html`, `fr/`, `ar/` (with `dir="rtl"`), fallback pages and `404.html`
- [ ] `.nuxt/`/`.output/` ignored by git, oxlint, oxfmt; `knip.json` entry added
- [ ] `packages/docs/**` in the ci-paths `quality` filter; `generate` step in the ci.yml `typecheck` job
- [ ] Sidebar and surround links keep the `/fr` and `/ar` prefix
- [ ] `docs/docs-site.md` written and linked from the `CLAUDE.md` docs table

## Package 02 — docs-publish

- [ ] `docs-release.test.mjs` (publisher + server) green and registered in ci.yml "Validate CI contracts"
- [ ] Server returns real 404s, clean URLs and latest redirects; image builds from `scripts/docs-release/Dockerfile`
- [ ] `ci-workflow.test.mjs` asserts the `docs` job, its stable gate and its `id-token` permission
- [ ] `docs` job skips cleanly with no docs vars, fails on a partial set, reads notes from the published object, deploys with `--min-instances 0`
- [ ] Existing desktop release tests still green
- [ ] `docs/release.md` describes the docs step, vars, checklist item and recovery
