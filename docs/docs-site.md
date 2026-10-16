# Docs site

`packages/docs` (`@cyberneticlabs/zekoder-docs`) is the user documentation site: Nuxt 4, `@nuxt/content` v3 and `@nuxt/ui` v4, generated to static files. It is separate from `public-docs/` (the inherited Paseo docs) and `packages/website`.

## Layout

| Path                                  | What lives there                                                           |
| ------------------------------------- | -------------------------------------------------------------------------- |
| `content/{en,fr,ar}/`                 | Markdown pages, one tree per locale                                        |
| `content/<locale>/**/.navigation.yml` | Sidebar title of a folder                                                  |
| `content.config.ts`                   | One collection per locale (`docs_en`, `docs_fr`, `docs_ar`)                |
| `i18n/locales/*.json`                 | UI strings (header, footer, notices). Page text belongs in `content/`      |
| `app/`                                | Theme, header/footer, version selector, the single `[...slug].vue` page    |
| `app/assets/css/main.css`             | Brand tokens copied from the commercial site. Nothing depends on that repo |

## Add a page

Create `content/en/<section>/<name>.md` with `title` and `description` frontmatter. The sidebar is built from the English tree, so the page appears in every locale as soon as the English file exists. Order siblings with `navigation: { order: N }` in the frontmatter (unset sorts first by file name; `whats-changed` uses 99 to stay last).

Link to other pages with absolute paths such as `/getting-started/install`. In `fr` and `ar` content, prefix the locale (`/fr/getting-started/install`): Markdown links are not rewritten.

## Locales and fallback

A page path is the same in every locale: all three collections use `prefix: ''`. `en` has no URL prefix; `fr` and `ar` live under `/fr` and `/ar` (`ar` renders `dir="rtl"`, so use logical Tailwind utilities such as `ms-`/`pe-`).

To translate a page, add the same relative path under `content/fr/` or `content/ar/`. Until then the English page renders with a translated "not translated yet" notice. The sidebar titles use the locale's own page title where it exists.

## How a version freezes

The content at a tagged commit is that version of the docs. A stable release tag generates the site with `NUXT_APP_BASE_URL=/vX.Y.Z/` so every asset URL carries the version prefix, and uploads the result under `vX.Y.Z/`; the release workflow does this (see [release.md](release.md)). Nothing rewrites a frozen version afterwards.

Two things cannot be frozen in the page itself:

- **The version list.** `VersionSelector.vue` fetches `/versions.json` from the docs domain root at runtime with native `fetch`. `$fetch` and `useFetch` resolve against the per-version base URL and would read a stale copy. A failed fetch or a 404 (local dev, first release) shows only the current version.
- **The release notes.** The release job overwrites `content/en/whats-changed.md` before generating, keeping its frontmatter and replacing the body. Do not hand-edit that body.

The static host must serve `_nuxt/*.wasm` as `application/wasm`. Content search runs SQLite in the browser; without the MIME type it still works but logs a streaming-compile error.

## Generate and preview

```bash
NUXT_APP_BASE_URL=/v1.4.0/ NUXT_PUBLIC_DOCS_VERSION=1.4.0 \
  npm run generate --workspace=@cyberneticlabs/zekoder-docs
```

Both variables are optional: unset means base `/` and version `dev`. Output is `packages/docs/.output/public/`. The script exits non-zero on any prerender error, so a broken link fails the build. CI runs `generate` in the `typecheck` job on every pull request.

For day-to-day writing use the dev server, which needs Node 22.5 or newer (`@nuxt/content` uses the built-in `node:sqlite`):

```bash
npm run dev --workspace=@cyberneticlabs/zekoder-docs   # http://localhost:3000
```

The workspace has no `build` script on purpose: the root `npm run build --workspaces` would pick it up.
