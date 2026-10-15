# Multi-language versioned documentation site — Contracts

## docs-build-interface

Internal. Owner: 01. Consumer: 02.

How the release job builds one frozen version. 01 makes this work; 02 calls it.

- Release notes input: before generating, the caller overwrites `packages/docs/content/en/whats-changed.md`. 01 commits that file as a placeholder with frontmatter `title: What changed` and `navigation.order: 99`; the caller keeps the same frontmatter and replaces only the body with the release's Markdown notes.
- Command, from the repo root:
  ```bash
  NUXT_APP_BASE_URL=/v1.4.0/ NUXT_PUBLIC_DOCS_VERSION=1.4.0 \
    npm run generate --workspace=@cyberneticlabs/zekoder-docs
  ```
  Both env vars optional; unset means base `/` and version `dev`.
- Output: `packages/docs/.output/public/` — a self-contained static tree. Every asset URL is prefixed with `NUXT_APP_BASE_URL`. Contains `index.html`, `fr/index.html`, `ar/index.html`, one `index.html` per page directory, hashed assets under `_nuxt/`, and `404.html`.
- The script exits non-zero on any prerender error (`nitro.prerender.failOnError: true`).

## docs-versions-manifest

Internal. Owner: 02. Consumer: 01.

`/versions.json` at the docs domain root, served with `Cache-Control: public, max-age=60`. Written only by 02's publisher with a generation-match CAS.

```json
{
  "schemaVersion": 1,
  "latest": "1.4.0",
  "versions": [
    { "version": "1.4.0", "tag": "v1.4.0", "path": "/v1.4.0/", "publishedAt": "2026-10-20T10:00:00Z" },
    { "version": "1.3.2", "tag": "v1.3.2", "path": "/v1.3.2/", "publishedAt": "2026-09-30T09:00:00Z" }
  ]
}
```

- `versions` sorted newest first by semver; `latest` equals `versions[0].version`.
- Consumers ignore unknown fields and treat a fetch failure or 404 as "only the current version" (local dev, first release).

## docs-hosting

Cross-system. Counterpart: GCP docs bucket, Artifact Registry repository and Cloud Run service (external-dependencies.md task 1). Owner: 02.

Bucket (private, mounted read-only into the service at `/srv/docs`):

| Object | Written |
|---|---|
| `vX.Y.Z/**` | per stable tag, overwriting a partial earlier attempt until `versions.json` lists the version (per file: `readBytes`, then `upload` with `ifGenerationMatch` = existing generation or `0`; retry once on 412); never touched after |
| `versions.json` | CAS-merged after the version upload |

Server (`scripts/docs-release/serve.mjs`, image tag = release tag, Cloud Run min instances 0):

| Request | Response |
|---|---|
| `GET /versions.json` | the object, `max-age=60` |
| `GET /`, `GET /latest/` + rest | `302` to the latest entry's `path` + rest |
| `GET /vX.Y.Z/` + rest | file, else `rest/index.html`; `_nuxt/**` `immutable`, HTML `max-age=300` |
| miss under a version | `404` with that version's `404.html` |
| any other miss | `404` with the latest version's `404.html` (plain text when no version exists) |
| path escaping the root, non GET/HEAD | `404` / `405` |
