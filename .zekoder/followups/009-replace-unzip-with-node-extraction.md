---
id: 009-replace-unzip-with-node-extraction
type: followup
title: Replace unzip shell-out with cross-platform extraction
status: merged
createdAt: 2026-10-15
openedAt: 2026-10-15T15:15:34.768Z
updatedAt: 2026-10-15T15:20:51.988Z
completedAt: 2026-10-15T15:20:51.988Z
origin: zekoder-debt-agent
filedFromTask: null
branch: followup-009-replace-unzip-with-node-extraction
promoted: false
packages: []
filesTouched:
  - .zekoder/followups/009-replace-unzip-with-node-extraction.md
  - plugins/zekoder/README.md
  - plugins/zekoder/server/unzip.ts
  - plugins/zekoder/server/version.ts
relatedFeatures: []
relatedBugs: []
relatedFollowups: []
resolvedBy: null
statusHistory:
  - from: planned
    to: merged
    at: 2026-10-15T15:20:51.988Z
---
> Imported from cyberneticlabs/zekoder-plugins followup 002-replace-unzip-with-node-extraction (feature 008-plugin-source-consolidation).

# Followup 009-replace-unzip-with-node-extraction: Replace unzip shell-out with cross-platform extraction

## Summary

Replace the `unzip` shell-out in `ensureRelease` (`plugins/zekoder/server/version.ts`) with a Node-based zip extraction so release unpacking works on Windows.

## Why it's out of scope now

Windows has no `unzip`, so release extraction fails and Windows auto-install still breaks, even though the installer now runs `scripts/install.mjs` (commit 69c1a94, "run Node installer, fall back to install.sh"). The fix needs a decision that did not fit that commit: Node has no built-in zip reader, so the options are a new dependency (project rule: new dependencies need human review) or a small hand-rolled extractor. Deferred from the installer-switch commit for that reason. Related upstream: vendor issue `001-zekoder-installer-not-windows-compatible` (resolved).

## Proposed approach

- Extract the zip in-process in `ensureRelease` (`plugins/zekoder/server/version.ts`, currently `await run("unzip", ["-q", zip, "-d", staging], { timeout: UNZIP_TIMEOUT_MS })`).
- Pick one option (human decision, see TODO):
  - A. Hand-rolled extractor using `node:zlib` (`inflateRawSync`) plus a small central-directory parser, in a new file `plugins/zekoder/server/unzip.ts` (approximate, confirm during planning). No new dependency. Must handle stored (method 0) and deflate (method 8) entries; reject encrypted and zip64 entries with a clear error.
  - B. Add a small, well-known zip library (needs human review per repo guardrail; `plugins/zekoder/package.json` currently has only devDependencies, and `plugins/zekoder/node_modules` contains no zip library today).
- Keep zip-slip protection: resolve every entry path against `staging` and reject any entry that is absolute, contains `..`, or resolves outside `staging`. Fail the whole extraction on the first bad entry.
- Keep the existing order: the sha256 check already happens before extraction and must stay before it.
- Preserve the executable bit where the zip records one (matters for POSIX only); create parent directories as needed; skip directory entries cleanly.
- Also relax the post-extract check at `plugins/zekoder/server/version.ts:270`, which requires `scripts/install.sh` and throws if absent. Newer releases ship `scripts/install.mjs` (see `INSTALL_MJS`/`INSTALL_SH` at lines 35-36 and the fallback at line 398), so accept either file.
- Remove `UNZIP_TIMEOUT_MS` (line 52) if it becomes unused, and the `run` call only if no other caller needs it.
- Update `plugins/zekoder/README.md` (line 107-108): the daemon needs `node` on its `PATH`, no longer `unzip`; `jq` is only for the older `install.sh`.

## Tasks

- [x] Decide extractor approach (hand-rolled vs new dependency) with a human; record the choice in this doc. DECIDED: Option A, hand-rolled extractor (`node:zlib` + central-directory parser), no new dependency (supervisor ruling, user authorized autonomous execution).
- [x] Add the extraction code (`plugins/zekoder/server/unzip.ts`, approximate path) with zip-slip rejection, and call it from `ensureRelease` in `plugins/zekoder/server/version.ts` in place of the `run("unzip", ...)` line (around line 269).
- [x] In `plugins/zekoder/server/version.ts` around line 270, accept `scripts/install.mjs` or `scripts/install.sh` after extraction; drop `UNZIP_TIMEOUT_MS` (line 52) if unused.
- [x] N/A: no dependency chosen (Option A), so `plugins/zekoder/package.json` and the lockfile are unchanged.
- [x] Update the daemon requirements sentence in `plugins/zekoder/README.md` (lines 107-108) to drop `unzip`; also re-read the Cache bullet (lines 103-108) for accuracy.

## Verification

- `cd plugins/zekoder && npm run typecheck` passes (only existing gate; no test suite).
- Manual: build a small test zip containing a nested file and an executable script; confirm extraction output matches `unzip -l` listing.
- Manual: build a zip with an entry named `../evil.txt` (and an absolute path entry); confirm extraction throws and nothing is written outside the staging dir.
- Manual: run `paseo plugin reload zekoder`, trigger an update from the Zekoder version tab, confirm the cache unpacks with `unzip` absent from `PATH` (rename or shadow it) and `.zekoder-release.json` is written.
- `grep -n unzip plugins/zekoder/server/version.ts plugins/zekoder/README.md` finds no remaining shell-out or requirement.

<!-- Decision recorded: Option A (hand-rolled, no new dependency). Extractor lives in `plugins/zekoder/server/unzip.ts` (`extractZip(buf, destDir)`). -->
