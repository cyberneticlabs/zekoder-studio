---
id: 003-guard-deploy-website-release-event
type: followup
title: Guard deploy-website release-published trigger in fork
status: planned
createdAt: 2026-10-10
openedAt: 2026-10-10T16:29:28.152Z
updatedAt: 2026-10-10T16:29:28.152Z
origin: zekoder-coding-agent
filedFromTask: 003-desktop-gcs-release-pipeline-02-release-pipeline
branch: followup-003-guard-deploy-website-release-event
promoted: false
packages: []
relatedFeatures:
  - 003-desktop-gcs-release-pipeline
relatedBugs: []
relatedFollowups: []
resolvedBy: null
statusHistory: []
---
## Context

`.github/workflows/deploy-website.yml` also triggers on `release: published` (stable, non-draft). The desktop release pipeline (feature 003) finalizes the fork's GitHub Release by publishing the draft, which emits that event and starts a Cloudflare website deploy that the fork has no upstream-only guard for. Feature 003 package 02 guarded only the publishing jobs the plan named (deploy-app, android-apk-release, release-notes-sync, docker, desktop-rollout).

## Work

Decide whether the fork should deploy the inherited Paseo website at all. If not, add `github.repository == 'getpaseo/paseo'` to the `deploy` job (or drop the `release` trigger) and extend the guard contract test in `scripts/ci-workflow.test.mjs`.
