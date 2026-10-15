---
id: 015-versioned-docs-site
type: feature
title: Multi-language versioned documentation site
status: planned
createdAt: 2026-10-15
openedAt: 2026-10-15T17:19:57.986Z
updatedAt: 2026-10-15T17:47:15.455Z
promoted: true
dependsOn: []
packages:
  - id: "01"
    name: docs-site
    file: packages/01-docs-site.md
    branch: 015-versioned-docs-site-01-docs-site
    dependsOn: []
    status: planned
  - id: "02"
    name: docs-publish
    file: packages/02-docs-publish.md
    branch: 015-versioned-docs-site-02-docs-publish
    dependsOn: []
    status: planned
contracts:
  - id: docs-build-interface
    type: internal
    kind: component
    owner: "01"
    consumers:
      - "02"
  - id: docs-versions-manifest
    type: internal
    kind: store
    owner: "02"
    consumers:
      - "01"
  - id: docs-hosting
    type: cross-system
    counterpart: GCP docs bucket + Artifact Registry + Cloud Run service (docs.zekoder.com)
    externalDependency: 1
    owner: "02"
    consumers: []
relatedFeatures:
  - 003-desktop-gcs-release-pipeline
relatedBugs: []
relatedFollowups: []
statusHistory: []
---
# Multi-language versioned documentation site — Overview

## User's request (verbatim)

"we need a multi language documentation site using nuxt, content component and markdown. It should be part of this repo so with every release we can publish the related documentation update with version selector. The app should follow the style and theme for the commercial site as in zekoder-site project. every future release should a new version of documentation including what has been changed"

## Refined scope

- New npm workspace `packages/docs` (`@cyberneticlabs/zekoder-docs`, private): Nuxt 4 + `@nuxt/content` v3 + `@nuxt/ui` v4 + `@nuxtjs/i18n`, Markdown under `packages/docs/content/{en,fr,ar}/`, static output via `nuxt generate`. Builds under npm, no pnpm.
- Locales: `en` (source, default, no prefix), `fr` (`/fr`), `ar` (`/ar`, `dir="rtl"`). A page missing in `fr`/`ar` renders the English page with a "not translated yet" note.
- Theme ported (copied, no runtime dependency) from `cyberneticlabs/zekoder-site`: tokens, Nuxt UI colors, fonts, color mode, header/footer look. Logos from this repo's `branding/source/`.
- Versioning: the docs content at a tagged commit is that version. Each stable `vX.Y.Z` run of `.github/workflows/desktop-release.yml` gains a `docs` job: it fetches that release's published `release-notes.md` into a "What changed" page, generates the site with base URL `/vX.Y.Z/`, uploads it to a private GCS bucket under `vX.Y.Z/`, CAS-merges `versions.json`, then builds and deploys a tiny static server to Cloud Run (min instances 0) that mounts the bucket read-only. Frozen versions read `/versions.json` at runtime, so old versions list newer ones.
- The server owns clean URLs (`/dir/` → `index.html`), real 404s (version 404 page, else latest version's), `/` and `/latest/...` redirects to the latest version.
- Seed content only: en `index`, `getting-started/install`, `getting-started/connect-a-host`, `whats-changed`; fr and ar translate `index` and `getting-started/install`.
- Docs integration: new `docs/docs-site.md` with a row in the `CLAUDE.md` docs table; `docs/release.md` gains the docs publish step.

## Out of scope

- Migrating `public-docs/` (stays as-is) or changing `packages/website`.
- Translating pages beyond the seed; search; a beta/"next" channel (confirmed: betas publish nothing).
- Provisioning GCP (bucket, Artifact Registry, Cloud Run service, IAM, domain): external-dependencies.md, done by a human.
- Any manual deploy or dispatch path: publishing and deploying run only from the tag-triggered workflow.

## Packages

| ID | Name | File | Branch | Depends on |
|---|---|---|---|---|
| 01 | docs-site | packages/01-docs-site.md | 015-versioned-docs-site-01-docs-site | — |
| 02 | docs-publish | packages/02-docs-publish.md | 015-versioned-docs-site-02-docs-publish | — |

01 builds the workspace, theme, i18n, seed content, version selector, repo and CI wiring. 02 adds the notes writer, the GCS publisher, the static server and its image, the `docs` job, contract tests and the release doc.

## Dependency graph

```
01-docs-site  ──(docs-build-interface)──►  02-docs-publish
01-docs-site  ◄──(docs-versions-manifest)── 02-docs-publish
```

No merge-order dependency; both code against contracts.md. Both touch `.github/workflows/ci.yml` (01: typecheck job step; 02: contract-test list) and `scripts/ci-workflow.test.mjs` (01: ci-paths `quality` expectation; 02: desktop-release `docs` job assertions), in different places.

## Related bugs & followups

- none overlap. Open followups 002-plugin-signing-key-rotation, 005-distinct-desktop-updater-cache-dir and 010-publish-paseo-zekoder-to-npm · separate · no action.
- Context: merged feature 003-desktop-gcs-release-pipeline owns the workflow and GCS client this plan extends.

Decisions consulted: none recorded for docs, release publishing, Cloud Run or Nuxt.

## Open assumptions

1. **Cloud Run (min 0) serving a GCS volume, not a per-tag image of all versions.** Each release uploads only its new version plus `versions.json`; the server image is a few KB and its deploy is the same every tag. The alternative, rebuilding an image holding every prior version, grows the image each release, needs the old versions from somewhere anyway, and loses history if an image is lost. Cost: cold start of about 1–2 s on the first request after idle; a new version is visible within about 2 minutes (Cloud Storage FUSE and server caches, 60 s each).
2. **Domain:** `https://docs.zekoder.com` via Cloud Run domain mapping. Domain mapping exists only in some regions; pick one of those or fall back to a load balancer later.
3. **"What changed"** (confirmed): English only, from the release's published `desktop/releases/vX.Y.Z/release-notes.md` (the validated draft Release body). Fetched from the public object on every run, so a rerun after the desktop release was already published also publishes docs.
4. **Docs job is non-blocking for desktop.** It runs after `publish`; when all docs vars are unset it skips with a notice; a partial set fails.
5. **Version selector** jumps to the same locale's home of the chosen version, not the same page.
6. Header/footer external links point at `https://zekoder.com`; package scope `@cyberneticlabs/zekoder-docs`.
