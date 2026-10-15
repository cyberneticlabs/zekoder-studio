# Package 01 — Release pipeline (script, workflow, keyring, docs)

- **Branch**: `013-plugin-auto-update-publishing-01-release-pipeline`
- **Depends on**: none
- **Contracts**: owns `plugin-release-channel` and `plugin-version-constant` (see `../contracts.md`)

## Worktree setup

```bash
git worktree add ../worktrees/023-01 -b 013-plugin-auto-update-publishing-01-release-pipeline main
cd ../worktrees/023-01/paseo && npm ci && npm run typecheck
```

## Context

- Greenfield: no `.github/`, no root `scripts/`, no CI today. Plain Node 22 ESM (`.mjs`), **no new dependencies** — `node:crypto` (sha256, Ed25519 sign/verify, `generateKeyPairSync("ed25519")`, JWK import/export for raw keys), `node:fs`, `node:child_process` for `tar`.
- Pattern to copy (not import): zekoder-skills `.github/workflows/release.yml` + `scripts/release-manifest.mjs` (ADR 009): tag trigger, `concurrency` group, WIF auth via `google-github-actions/auth@v2`, upload with `--no-clobber` and reuse stored bytes' sha on re-run, manifest last with `--if-generation-match` (0 on first write).
- Tree checksum must match Studio `scripts/sync-zekoder-plugin.mjs` `computeTreeChecksum` byte-for-byte (algorithm in contracts). Studio lock for `v0.11.1` holds `1b15aeccbfd8c9eb7381b9c651b5b5958bbb342e78bc0a6b66a75ca52ff43c97` — the parity check.
- Compat field already exists: `plugins/zekoder/paseo-plugin.json` `requirements.paseo` (`>=0.9.2`). The release entry carries it as `requires.paseo` (Studio's name; checked against the daemon version). Keep `requirements` in `paseo-plugin.json` — that is Studio's plugin-manifest key. Studio's manifest schema is strict — **never add keys** (no `version`) to `paseo-plugin.json`.
- `plugins/zekoder/package.json` version is `0.11.0`; tag `v0.11.1` exists off `main`. Bump to `0.12.0` (package.json, package-lock.json root entries, `PLUGIN_VERSION`).
- Keys: public keys are raw 32-byte Ed25519, standard base64 (Studio's `TrustedKey` format). Raw ↔ Node: export `key.export({format:"jwk"}).x` (base64url) → base64; import via `createPublicKey({key:{kty:"OKP",crv:"Ed25519",x}, format:"jwk"})`. Private key stays PKCS8 PEM, only in the CI secret.
- One signing key only. No dual-sign / `_NEXT` key. Rotation runbook is followup `002-plugin-signing-key-rotation`.
- Never write `releases/` or `desktop/` in the bucket; never commit a private key.

## Tasks

- [ ] 1. Create `plugins/zekoder/shared/plugin-version.ts` with `export const PLUGIN_VERSION = "0.12.0";` and bump `plugins/zekoder/package.json` + `plugins/zekoder/package-lock.json` (`version`, `packages[""].version`) to `0.12.0`.
- [ ] 2. Create `scripts/plugin-release.mjs` with subcommands (exit non-zero with a clear message on any failure):
  - `check-tag <tag>` → validates the stable/beta regex, equality with `plugins/zekoder/package.json` version and `PLUGIN_VERSION`; prints `<version> <channel>`.
  - `build <version> <outDir>` → stages the `files` allowlist under `<tmp>/zekoder/` (reject `..`/absolute entries, like Studio's `copyAllowlist`), runs `tar -czf <outDir>/zekoder-plugin-v<version>.tar.gz -C <tmp> zekoder`, prints JSON `{file, sha256, size, treeChecksum}`. Add `--src <dir>` (default `paseo`) so the parity check can point at another checkout.
  - `next --current <envelope.json|-> --release <release.json> --out <payload.json>` → if current is non-empty, verify it against the keyring and decode payload; else start `{schemaVersion:1, pluginId:"zekoder", sequence:0, releases:{}, revoked:[]}`. If the version exists: compare only `artifact.sha256`, `artifact.size`, `treeChecksum`, `commit`, `requires` — equal → print `unchanged`, write nothing, exit 0; different → abort. Else add the release (`--release` gives `{version, tag, channel, commit, artifact, treeChecksum}`; `next` adds `requires: { paseo: <paseo-plugin.json requirements.paseo> }`), recompute `channels` (contract rules, semver with prerelease ordering), `sequence+1`, `publishedAt`. Write payload bytes (`JSON.stringify(p, null, 2) + "\n"`), print `updated`.
  - `revoke --current <envelope.json> --version <v> --reason <text> --out <payload.json>` → verify, append `{version, reason, revokedAt}` (unknown version or already revoked → abort), recompute `channels`, `sequence+1`.
  - `sign <payload.json> <out-envelope.json>` → one signature with `ZEKODER_PLUGIN_SIGNING_KEY` (PKCS8 PEM) + `ZEKODER_PLUGIN_SIGNING_KEY_ID`; the key id must be in the keyring and the derived public key must equal its keyring entry.
  - `verify <envelope.json>` → prints the decoded payload's `sequence` and `channels` or fails.
  - `keygen <keyId> <privateOut.pem>` → writes the private PEM with mode 0600, prints the keyring entry JSON `{keyId, alg:"ed25519", publicKey:<raw base64>, addedAt}`. Refuses to write inside the repo.
- [ ] 3. Create `scripts/plugin-release-keys.json` as `{ "keys": [] }`. `sign`/`verify` fail with "keyring empty — see docs/plugin-release.md" until external dependency 2 adds the first public key.
- [ ] 4. Create `.github/workflows/plugin-release.yml`:
  - Triggers: `push: tags: ['v*']`; `workflow_dispatch` inputs `version`, `reason` (revoke only; run must be on `main`).
  - `permissions: contents: read, id-token: write`; `concurrency: {group: zekoder-plugin-release, cancel-in-progress: false}`; `environment: plugin-release` (holds the signing secret). `actions/checkout` with `fetch-depth: 0`.
  - Tag path: `check-tag` → `git merge-base --is-ancestor $GITHUB_SHA origin/main` (safety check) → `cd plugins/zekoder && npm ci && npm run typecheck` → `build` → auth (`vars.GCP_WORKLOAD_IDENTITY_PROVIDER`, `vars.GCP_SERVICE_ACCOUNT`) → upload artifact with `--no-clobber` and `--cache-control`; if it exists, download it and use the stored sha256/size → **publish loop (max 5 attempts)**: read manifest + generation (`0` if missing) → `next` (on `unchanged` stop, green) → `sign` → `verify` → upload with `--if-generation-match=<gen>` and `Cache-Control: public, max-age=60`; on precondition failure (HTTP 412) loop back to re-read and recompute; after 5 failures exit non-zero.
  - Revoke path: same publish loop with `revoke` instead of `next`.
  - All object paths built from `plugins/zekoder/`; fail fast if `vars.ZEKODER_RELEASE_BUCKET` is empty.
- [ ] 5. Create `docs/plugin-release.md` (≤ ~120 lines): tag → channel mapping; release steps (bump the three version spots, merge, tag); GCS paths; revocation run; **re-run a cancelled or failed tag workflow** (a newer pending run in the concurrency group cancels an older pending one; re-run it from the Actions tab — re-runs are idempotent; after pushing several tags check every version is in `releases`); **key custody** (private key only in the `plugin-release` Environment secret, deployment refs `v*` tags and `main`; encrypted offline backup in the company password vault, two named holders; nobody reads it back); **tag ruleset** (only named maintainers create/update/delete `v*` tags — the setup steps of external dependency 2); **accepted risk** (automatic signing, no required reviewers; ancestor-of-`main` check is safety, not security); **compromise** (delete the secret, disable the environment, tell Studio to drop the key id, revoke every version published since the suspected leak once a new key exists); **rotation**: not built, tracked in followup `002-plugin-signing-key-rotation` — format already allows several `signatures[]` and keyring entries; Studio-consumer notes pointing at `contracts.md`.
- [ ] 6. Update root `README.md` (release section link) and `CLAUDE.md` Cross-repo bullet with the plugin manifest URL `https://storage.googleapis.com/zekoder-releases/plugins/zekoder/manifest.json`.

## Verification

- `cd plugins/zekoder && npm run typecheck` passes.
- `node scripts/plugin-release.mjs check-tag v0.12.0` → `0.12.0 stable`; `v0.12.0-beta.1` → `0.12.0 beta`; `v0.12.0-rc.1`, `0.12.0`, `v0.11.9` fail.
- Parity: `git worktree add /tmp/p0111 v0.11.1` then `node scripts/plugin-release.mjs build 0.11.1 /tmp/out --src /tmp/p0111/paseo` → `treeChecksum` equals `1b15aecc…c43c97`.
- Signing round trip with a throwaway key (`keygen` to `/tmp`, temporary keyring entry not committed): `publicKey` decodes to 32 bytes; `next --current -` → `sign` → `verify` passes; flip one payload byte → `verify` fails; same `next` again with a different `publishedAt` → `unchanged`; changed sha256 → abort; second `next` adds a beta and `channels.beta` is the beta while `channels.stable` stays; `revoke` drops it from `channels` and bumps `sequence`.
- Workflow review: `fetch-depth: 0`, publish loop retries on 412 and re-runs `next`, no `_NEXT` key reference.
- `grep -rn "releases/manifest.json\|desktop/" .github scripts` shows no write to those paths.
- `git status` shows no `.pem` file.

## Progress

- [ ] Tasks done · [ ] Verification done · [ ] Ready for review
