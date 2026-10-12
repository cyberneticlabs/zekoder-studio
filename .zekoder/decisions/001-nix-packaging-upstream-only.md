---
id: 001-nix-packaging-upstream-only
type: decision
title: Nix packaging stays upstream-only until we ship to Nix users
status: accepted
createdAt: 2026-10-12
openedAt: 2026-10-12T10:18:32.855Z
updatedAt: 2026-10-12T10:18:58.811Z
completedAt: 2026-10-12T10:18:58.811Z
tags:
  - nix
  - ci
  - github-actions
  - upstream-only
  - packaging
  - npm-deps-hash
  - fork
relatedFeatures: []
relatedBugs: []
relatedFollowups:
  - 003-guard-deploy-website-release-event
  - 004-full-local-test-run-before-push
supersedes: []
supersededBy: []
statusHistory:
  - from: proposed
    to: accepted
    at: 2026-10-12T10:18:58.811Z
---
# Decision 001-nix-packaging-upstream-only: Nix packaging stays upstream-only until we ship to Nix users

> **Not queued for autonomous implementation.** This is a decision record (ADR) — knowledge the
> planner consults, not work a zekoder-coding-agent executes.

## Context

The fork `cyberneticlabs/zekoder-studio` inherits Paseo's Nix workflows: `.github/workflows/nix.yml` (jobs `build`, `build-desktop-darwin`) and `.github/workflows/nix-update-hash.yml` (job `update-hash`). After main push `d92e425cd` both failed on the fork (runs 38232327006 Nix, 38232326965 Nix Update Hash; main CI run 38232326973 was fully green).

- `nix-update-hash` needs the `PASEO_BOT_APP_ID` / `PASEO_BOT_APP_PRIVATE_KEY` GitHub App secrets, which the fork lacks ("Input required and not supplied: app-id").
- Without the bot, `nix/npm-deps.hash` goes stale and the Nix build fails with "npmDepsHash is out of date".
- Zekoder does not ship to NixOS/Nix users today.

## Decision

Nix packaging is upstream-only in the fork until Zekoder decides to ship to Nix users.

- All three Nix jobs are guarded with `if: ${{ github.repository == 'getpaseo/paseo' }}` (commit `9c95edef1`). This is the same pattern used for deploy-website (followup 003) and other inherited upstream publishing jobs.
- `flake.nix` and the `nix/` files stay untouched, to keep upstream merges clean.
- The contract test "inherited upstream publishing jobs only run in the upstream repository" in `scripts/ci-workflow.test.mjs` enforces the guards.

**Revisit trigger:** when Zekoder decides to ship to NixOS/Nix users. Then remove the guards (and their contract-test entries), provision a bot GitHub App and secrets, refresh `nix/npm-deps.hash`, and rebrand Nix package names (currently `paseo-desktop`).

## Consequences

- `nix/npm-deps.hash` will drift from `package-lock.json` in the fork.
- The Nix build, including the `paseo-desktop` Nix package, is unverified in fork CI.
- Anyone running `nix build` from the fork may hit a stale-hash failure.
- Upstream merges stay conflict-free in `nix/` and `flake.nix`.
- Fork CI on main no longer shows permanent red Nix runs.

## Alternatives considered

- **Create our own GitHub App and secrets, keep `npm-deps.hash` maintained by the bot.** Rejected for now: extra infra and secret maintenance with no Nix users.
- **Delete the Nix workflows and `nix/` files.** Rejected: causes upstream merge conflicts on every sync.
- **Leave as-is.** Rejected: permanent red runs on main.
