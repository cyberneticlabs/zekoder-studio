# Package 01 — docs-site

- **Branch:** `015-versioned-docs-site-01-docs-site`
- **Worktree:** created by the supervisor from the batch staging branch; run `npm install` at the repo root after adding the workspace.
- **Depends on:** none. **Contracts:** owns `docs-build-interface`, consumes `docs-versions-manifest` (contracts.md).

## Context

- Nothing in this repo is Nuxt/Vue today; every Nuxt dependency is new. Pin exact versions matching the theme source: `nuxt` 4.4.8, `@nuxt/ui` 4.11.3, `tailwindcss` 4.3.3, plus current `@nuxt/content` 3.x, `@nuxtjs/i18n` 10.x, `@fontsource/inter`, `@fontsource/inter-tight`, `@fontsource/jetbrains-mono`, `vue-tsc`. npm only; commit the updated `package-lock.json`.
- Theme source (read with `gh api repos/cyberneticlabs/zekoder-site/contents/src/layers/core/app.config.ts?ref=master --jq .content | base64 -d`; never add it as a dependency):
  - `src/layers/core/app/assets/css/main.css` — brand tokens (`--color-brand #1461BD`, `ink-900 #16181D`, `--zk-*` light/dark vars, `--container-site 1200px`), fontsource imports.
  - `src/layers/core/app.config.ts` — Nuxt UI `primary: blue`, `neutral: slate`. Core `nuxt.config` sets `ui.fonts: false`; color mode `{ preference: 'system', fallback: 'light', classSuffix: '' }`.
  - `src/layers/core/app/components/zk/ZkLogo.vue` — theme-aware logo swap (`dark:hidden`).
  - `src/layers/site/app/components/site/SiteHeader.vue`, `SiteFooter.vue` — header bar and footer layout and copy ("ZeKoder is a product of Cybernetic Labs Ltd, London", Privacy/Cookies/Terms).
- i18n reference: `ZeKoder/zekoder-web` (`dev`) `src/layers/core/nuxt.config.ts` locale list with `dir: 'rtl'` for `ar`, and `src/layers/core/assets/css/rtl.css`. Use strategy `prefix_except_default` here (static generation needs real `/fr` and `/ar` routes), not that repo's `no_prefix`.
- Logos: copy `branding/source/logo-blue.png` and `logo-white.png` into `packages/docs/public/brand/`.
- Repo wiring facts: root `package.json` `workspaces` is an explicit list; `typecheck` runs `--workspaces --if-present`, so a `typecheck` script joins CI automatically. `.oxlintrc.json` ignores only `.dev/**`; `.oxfmtrc.json` ignores `*.lock`, `**/*.gen.*`, `.zekoder/**`; `.gitignore` has no `.nuxt/`/`.output/`; `knip.json` lists each workspace.
- Do not name a script `build` in the docs workspace: root `npm run build --workspaces --if-present` would pick it up.

## Tasks

- [x] Scaffold `packages/docs/` with `package.json` (`"name": "@cyberneticlabs/zekoder-docs"`, `"private": true`, `"type": "module"`, scripts `dev: nuxt dev`, `generate: nuxt generate`, `typecheck: nuxt typecheck`), `nuxt.config.ts`, `app/app.vue`, `tsconfig.json`. Add `packages/docs` to root `package.json` `workspaces`; run `npm install`.
- [x] `nuxt.config.ts`: modules `@nuxt/ui`, `@nuxt/content`, `@nuxtjs/i18n`; `content.experimental.sqliteConnector: 'native'` (no native sqlite dependency); `ui.fonts: false`; `colorMode` as in the theme source; `runtimeConfig.public.docsVersion: 'dev'` (set by `NUXT_PUBLIC_DOCS_VERSION`); `nitro.prerender: { crawlLinks: true, routes: ['/', '/fr', '/ar', '/404.html'], failOnError: true }`; i18n locales `en` (default, `en-GB`), `fr` (`fr-FR`), `ar` (`ar`, `dir: 'rtl'`), UI strings in `i18n/locales/{en,fr,ar}.json`.
- [x] Theme: `app/assets/css/main.css` with the copied tokens, Tailwind/Nuxt UI imports and fontsource imports; `app/app.config.ts` colors; `app/components/DocsLogo.vue`, `DocsHeader.vue` (logo, link to `https://zekoder.com`, version selector, locale switcher, color-mode toggle), `DocsFooter.vue` (company line, legal links to `https://zekoder.com`). Use logical Tailwind utilities (`ms-`/`me-`/`ps-`/`pe-`) so `ar` mirrors.
- [x] Content: `content.config.ts` with collections `docs_en`, `docs_fr`, `docs_ar` (`type: 'page'`, sources `en/**`, `fr/**`, `ar/**`, each with `prefix: ''` so a page path is the same in every locale). Page `app/pages/[...slug].vue`: query the current locale's collection by path, fall back to `docs_en` and show a translated "not translated yet" `UAlert`; 404 via `createError` when neither exists. Sidebar from `queryCollectionNavigation('docs_en')` with titles replaced by the locale's page where one exists; pass every sidebar and surround link through `localePath()` so `fr`/`ar` stay in their prefix; use Nuxt UI `UPage`, `UPageAside`, `UContentNavigation`, `UContentToc`, `UContentSurround`.
- [x] `app/components/VersionSelector.vue`: on client mount use native `fetch(new URL('/versions.json', location.origin))` (not `$fetch`/`useFetch`, which resolve against the per-version `app.baseURL`); show `runtimeConfig.public.docsVersion` marked current; on pick navigate to the entry's `path` (for example `/v1.4.0/`) plus `fr/` or `ar/` for those locales. Fetch failure or 404 → show only the current version (contracts.md `docs-versions-manifest`).
- [x] Seed content: `content/en/index.md`, `getting-started/install.md`, `getting-started/connect-a-host.md` (short, accurate to the Zekoder desktop app; read `docs/product.md`), and `whats-changed.md` placeholder per `docs-build-interface`; `content/fr/` and `content/ar/` translations of `index.md` and `getting-started/install.md`.
- [x] Repo wiring: add `.nuxt/` and `.output/` to `.gitignore`; add `packages/docs/.nuxt/**`, `packages/docs/.output/**` to `.oxlintrc.json` and `.oxfmtrc.json` ignore patterns; add a `packages/docs` entry to `knip.json` (entry `app/**/*.vue`, `content.config.ts`, `nuxt.config.ts`). CI: add `packages/docs/**` to the `quality` filter in `.github/ci-paths.yml`, and a step `npm run generate --workspace=@cyberneticlabs/zekoder-docs` after "Typecheck all packages" in the existing `typecheck` job of `.github/workflows/ci.yml` (no new job). Update the exact `deepEqual` expectation for the `quality` filter in `scripts/ci-workflow.test.mjs` (around L170–235, the `quality: [...]` line near L192) to include `packages/docs/**`. Package 02 also edits `ci.yml` and `scripts/ci-workflow.test.mjs`, in different places.
- [x] Docs: new `docs/docs-site.md` (content layout, adding a page, locale fallback, how a version freezes, the `docs-build-interface` command, local preview) and a row in the `CLAUDE.md` docs table after `docs/release.md`. Link the release step to `docs/release.md` instead of restating it.

## Verification

- `npm run typecheck` (includes `@cyberneticlabs/zekoder-docs` via `nuxt typecheck`), `npm run lint`, `npm run format:check`.
- `NUXT_APP_BASE_URL=/v0.0.1/ NUXT_PUBLIC_DOCS_VERSION=0.0.1 npm run generate --workspace=@cyberneticlabs/zekoder-docs` exits 0; `.output/public/` has `index.html`, `fr/index.html`, `ar/index.html`, `fr/getting-started/connect-a-host/index.html` (fallback page), `404.html`; `grep -c '/v0.0.1/_nuxt/' .output/public/index.html` > 0; `grep 'dir="rtl"' .output/public/ar/index.html` matches.
- `npm run dev --workspace=@cyberneticlabs/zekoder-docs` and walk get-started.md steps 1–5.

## Progress

- [x] Tasks complete
- [ ] Verification green
- [x] Handed back to supervisor
