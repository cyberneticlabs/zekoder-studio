# 02 — Desktop release pipeline and agent procedure

Branch: 003-desktop-gcs-release-pipeline-02-release-pipeline
Depends on: 01
Worktree: isolated worktree from supervisor staging after 01 merges; npm ci.

## Context

Read docs/release.md, docs/development.md, docs/qa.md, plan.md and contracts.md. Reuse npm run build:desktop, packages/desktop/scripts/after-pack.js and after-sign.js, packaged smoke checks, current platform runners. Five matrix targets are mandatory; preserve AppImage basename. Package 01 owns publication scripts; 03 owns runtime.

## Tasks

- [ ] Replace .github/workflows/desktop-release.yml entry points with push tags v* only and strict package-01 preflight. Remove workflow_dispatch, desktop-* prefixes and alternate checkout refs; checkout the exact pushed tag commit. Derive package version in CI without npm version hooks, synchronizing packaged desktop metadata/lock entry as needed, never invoking npm publishing/mobile version scripts.
- [ ] Change packages/desktop/electron-builder.yml to fork-owned generic provider/bootstrap catalog configuration; build with --publish never. Preserve mac DMG+ZIP arm64/x64, Windows NSIS+ZIP x64/arm64 and Linux x64 formats; output architecture-isolated feeds and capture all referenced installers/blockmaps. Inject stable/beta metadata version from tag; require fork mac notarization; preserve explicitly documented current unsigned Windows policy unless owned signing credentials are configured.
- [ ] Matrix jobs build+smoke only and upload complete artifacts/provenance to Actions. Final publication job needs every row, obtains dedicated GCP OIDC, invokes 01 preparation/publisher and verifies tag still resolves to captured source SHA. Reuse previously stored immutable outputs on rerun; serialized final jobs must not drop queued tags (CAS merge handles concurrency). A dedicated notes-fetch job has contents write so its GitHub token can read matching private draft bodies; it passes validated notes/release URL through Actions artifacts to the separate contents read/id-token write publication job. Finalization follows successful publication using a separate dependent job with contents write; OIDC publisher cannot modify GitHub Releases.
- [ ] Require preexisting nonempty matching GitHub Release draft/body; validate prerelease matches channel. Copy that body to immutable notes Markdown before catalog publication; finalize draft only after publication, making finalization retryable when manifest already exists. Release creation/update events do not trigger build. Retire .github/workflows/desktop-rollout.yml fork job through upstream-only guard.
- [ ] Add upstream-only guards to inherited publish jobs in .github/workflows/deploy-app.yml, android-apk-release.yml, release-notes-sync.yml and docker.yml publication condition. Keep ordinary nonpublishing CI; fork version tags cause only desktop release distribution. Upstream notes-sync never rewrites Zekoder GitHub notes.
- [ ] Integrate desktop-specific authoritative process into docs/release.md and link its agent tagging rules from AGENTS.md/CLAUDE.md, removing conflicting blanket all-workspaces release statements for Zekoder desktop. Agents alone operate tagging: prepare reviewed source/green CI/high-level GitHub draft notes, ask explicit publish go-ahead, then create/push immutable annotated stable/beta tag. Notes describe new features, updates to existing features and broad bug categories (security/performance), never commit dumps. No npm release scripts, force tags or manual build dispatch; failed tag workflows rerun same source. Record channel URLs, credentials, recovery and retained signed binaries; manual rollback installs an older retained binary without disabling no-downgrade policy.

## Verification

npm run typecheck; npm run lint; npm run format:check. Validate workflow event/permissions/guards through repository CI, matching fixture tag parsing tests from 01. Execute all matrix packaged smoke jobs in CI; inspect package/app.getVersion, signatures/notarization, feed references+hashes and full GCS contents before marking release visible. No live tag/publish until separately authorized and dependencies 1–3 ready.

## Progress

- Status: planned
- Completed: none
- Blockers: external dependencies 1, 2, 3 for production release.
