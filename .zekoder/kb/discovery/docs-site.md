<!-- discovery-stamp: sha=086bb911c46dcb6eb10e04dbc71a1f8608eccb23 globs=["packages/docs/**", ".github/ci-paths.yml", "packages/website/package.json", "package.json", ".oxlintrc.json", ".oxfmtrc.json", "knip.json", ".gitignore", ".github/workflows/desktop-release.yml", ".github/workflows/ci.yml", ".github/workflows/plugin-release.yml", "scripts/desktop-release/**", "scripts/ci-workflow.test.mjs", "docs/release.md", "branding/source/**"] updatedAt=2026-10-15T18:10:00Z -->
# Docs site

Planned by feature 015-versioned-docs-site. No Nuxt/Vue existed in this repo before it.

## External sources (read with `gh api`, never a runtime dependency)

- Theme: `cyberneticlabs/zekoder-site` (branch master; pnpm, Nuxt 4.4.8, @nuxt/ui 4.11.3, Tailwind 4.3.3; no @nuxt/content, no i18n). Tokens `src/layers/core/app/assets/css/main.css` (brand #1461BD, ink-900 #16181D, `--zk-*` light/dark vars, container 1200px); Nuxt UI colors `src/layers/core/app.config.ts` (primary blue, neutral slate); fonts Inter / Inter Tight / JetBrains Mono via @fontsource, `ui.fonts:false`; color mode system/light, classSuffix ''; logo `src/layers/core/app/components/zk/ZkLogo.vue`; header/footer `src/layers/site/app/components/site/Site{Header,Footer}.vue`. Deploys to Cloud Run, not GCS.
- i18n pattern: `ZeKoder/zekoder-web` (branch dev) `src/layers/core/nuxt.config.ts` (@nuxtjs/i18n 10, ar `dir: 'rtl'`, no_prefix) and `src/layers/core/assets/css/rtl.css`. Static generation here needs `prefix_except_default` instead.

## This repo

- `packages/website` is TanStack Start + Vite + Cloudflare (upstream), renders `public-docs/` via `src/docs.ts`; unrelated to the Nuxt docs site.
- Brand rasters: `branding/source/logo-{blue,dark,white}.png`.
- Root `package.json` `workspaces` is an explicit list. `typecheck`, `test`, `build` run `--workspaces --if-present` (a workspace `build` script joins root build). `lint` = root oxlint (no .vue), `format` = root oxfmt.
- Ignores: `.oxlintrc.json` only `.dev/**`; `.oxfmtrc.json` `*.lock`, `**/*.gen.*`, `.zekoder/**`; `.gitignore` has `dist/` but not `.nuxt/`/`.output/`. `knip.json` has one entry per workspace.
- `.github/ci-paths.yml` `quality` filter matches only js/ts/json; `.vue`/`.md` changes need an explicit path. ci.yml `typecheck` job runs `npm run typecheck`.

## Publishing reuse

- `scripts/desktop-release/publish-release.mjs`: `createGcsClient` -> `readStored`, `readBytes` (`{bytes, generation}`), `upload(name, src, {ifGenerationMatch, cacheControl})` returns false on 412; `resolveAccessToken` (GCS_ACCESS_TOKEN or gcloud). Internal `contentTypeFor` maps only .json/.yml/.md.
- `scripts/desktop-release/release-data.mjs`: `parseDesktopTag` (.channel stable|beta), `compareDesktopTags`, `stableStringify`, cache-control constants. `objectNameFromUrl` is pinned to desktop/releases.
- `scripts/desktop-release/test-fixtures.mjs` `startFakeGcs` honors ifGenerationMatch.
- `scripts/ci-workflow.test.mjs` asserts desktop-release.yml has exactly preflight/release-notes/build/publish/finalize and only publish has `id-token: write`; adding a job means updating it. ci.yml "Validate CI contracts" lists every contract test file explicitly.
- Raw `storage.googleapis.com` does not resolve `/dir/` to `index.html` or serve a custom 404. Feature 015 plans Cloud Run (min instances 0) with a read-only GCS volume and a zero-dep server (`scripts/docs-release/serve.mjs`) owning clean URLs, 404s and latest redirects; each release uploads only its version plus `versions.json`.
- `CHANGELOG.md` is upstream Paseo versioning. Zekoder release notes are the draft GitHub Release body, published as `desktop/releases/TAG/release-notes.md` in the release bucket; read them there, since `build`/`publish` skip on an already-published rerun.
