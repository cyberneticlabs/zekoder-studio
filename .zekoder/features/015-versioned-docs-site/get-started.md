# Multi-language versioned documentation site — Get started

## Prerequisites

- Node 22.5+ (native `node:sqlite` for `@nuxt/content`), npm, `npm install` at the repo root.
- No GCP access needed locally. Real publishing needs external-dependencies.md task 1.
- Preview the hosting behavior locally: `DOCS_ROOT=/tmp/docs-root PORT=8080 node scripts/docs-release/serve.mjs` after copying a generated tree to `/tmp/docs-root/v0.0.1/` next to a hand-written `versions.json`.

## Run

```bash
npm run dev --workspace=@cyberneticlabs/zekoder-docs        # http://localhost:3000
NUXT_APP_BASE_URL=/v0.0.1/ NUXT_PUBLIC_DOCS_VERSION=0.0.1 \
  npm run generate --workspace=@cyberneticlabs/zekoder-docs # static build
node --test scripts/docs-release/docs-release.test.mjs       # publisher tests
```

## Manual walkthrough (dev server)

1. Open `/` → English home with Zekoder header (logo, version selector showing `dev`, locale switcher, theme toggle), sidebar and footer in the commercial-site style.
2. Click "Getting started → Install" in the sidebar → page renders with a table of contents and previous/next links.
3. Toggle the theme → dark palette (`#16181D` background, `#4C8FE0` accent) applies; reload keeps it.
4. Switch locale to Français → URL becomes `/fr/getting-started/install`, French text renders. Open `/fr/getting-started/connect-a-host` → English text with a "not translated yet" notice in French.
5. Switch locale to العربية → URL `/ar/...`, `<html dir="rtl" lang="ar">`, sidebar on the right, Arabic text renders.
6. Open `/does-not-exist` → 404 page in the site layout.
7. Open the version selector → only `dev` listed (no `/versions.json` locally).

## Integration-test mapping

| Step | Covered by |
|---|---|
| 1–7 | Manual walkthrough above (no Playwright suite added for this site) |
| Static output, base URL, RTL attribute | Package 01 verification `generate` + grep checks |
| Manifest merge, latest move rules, listed/partial reruns, CAS retry, beta rejection, notes writer | `scripts/docs-release/docs-release.test.mjs` (publisher) |
| Clean URLs, 404 pages, `/` and `/latest/` redirects, path escape, cache headers | `scripts/docs-release/docs-release.test.mjs` (server) |
| Workflow job, permissions, stable gate, service account var, min instances 0 | `scripts/ci-workflow.test.mjs` |
| Docs build on PRs | `typecheck` job `generate` step in `.github/workflows/ci.yml` |
| Real publish | First stable tag after external dependency 1: `https://docs.zekoder.com/` redirects to `/vX.Y.Z/`, `/fr/` deep links and a missing page return the site's 404, selector lists the version, "What changed" shows the release notes |
