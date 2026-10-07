# Goals: Zekoder Suite (branded Paseo distribution)

Sources: plan.md, the spine-oidc skill (as relayed), CLAUDE.md.
Interviewed: Ahmed Elshalaby (Cybernetic Labs), 2026-10-04.

## Purpose

Branded Zekoder Suite desktop, mobile and web distribution of Paseo. It bundles Zekoder plugins and theme and adds product login, while staying upgradeable from upstream Paseo.

## Who it serves

- Zekoder end users: humans running coding agents from desktop, mobile and web.
- Cybernetic Labs maintainers who build, sign and ship releases.

## What it is not

- Not a permanent divergent rewrite of Paseo.
- Not the owner of agent execution, protocol or pairing (upstream's).
- Not the product backend: orgs, subscriptions, payments and entitlements are enforced by Spine.
- Not the `cyberneticlabs/zekoder-plugins` repo (plugins are versioned independently).

## Doing its job looks like

Branded desktop installs beside upstream Paseo; bundled plugins load at pinned versions; branding works before any daemon connects; login matches the agreed access policy; existing pairing and execution still work; one upstream upgrade completes; the release manifest identifies all bundled revisions.

## Horizon (absolute dates)

- Branded desktop: by 2026-11-03.
- Other apps (mobile, web): by 2026-12-03.
- Auth and paid versions: before 2027-01-01.

## Goals and success signals

### G1 Baseline

Build the selected upstream revision unchanged.
Signal: baseline versions and check results recorded; branding and deployment touchpoints audited; existing Zekoder plugin compatibility validated.

### G2 Branded desktop (by 2026-11-03)

Central branding config, bundled pinned plugins and theme, isolated app state and update channel.
Signal: clean install beside upstream Paseo; branding visible before any daemon connects; startup and disconnected appearance validated separately.

### G3 Login and paid versions (before 2027-01-01)

Isolated login/account module on Cybernetic Labs Spine.
Decided:

- IdP is Spine (Supabase Auth OAuth 2.1/OIDC plus the Spine claims hook, client registry and consent screen). First-party CLABS products only; the client is provisioned by a Spine admin (no dynamic registration).
- Authorization Code + PKCE via the system browser; ES256 tokens verified against Spine JWKS.
- Org and entitlement data comes from the token: `current_org_id` (optional), `tier`, `org_capabilities` (omitted means no entitlement). Org role comes from `GET /api/v1/me/orgs`, not from `roles`. One session = one active org; switching re-mints the token.
- Payments: entitlements are seeded in Spine from Stripe, licence, manual or signup. This repo never touches Stripe and gates paid features on tier/capabilities.
- "Package" in Spine means bundle tiers that expand into product entitlements. It does not mean plugin distribution or app update feeds; those stay fork-owned per plan.md.
  Signal: login, callback, refresh and logout verified; pairing remains independently functional; paid features gated by Spine entitlements.
  Open prerequisites (decide before implementing auth, unless Spine already answers them):
- Optional versus mandatory login.
- Offline behavior and token expiry.
- Org selection UX.
- Logout, revocation and daemon access semantics.
- Personal machines versus shared execution hosts.

### G4 Upstream sync

Repeatable `sync/paseo-*` merge workflow.
Signal: one upstream upgrade completes with merge commits; conflicts and patch footprint measured; upgrade from the previous branded build verified; compatibility matrix (app, daemon, plugin versions) maintained, with mixed-version combinations tested or documented as unsupported.

### G5 Distribution (mobile and web by 2026-12-03)

Branded mobile and web releases, plugin provisioning on remote daemons, signing and release automation, scheduled upstream integration checks.
Signal: release manifest lists all bundled revisions (plugin versions, upstream commit, artifact checksums); update channels and package identities are the branded ones.

## Non-goals

- Mandatory daemon authorization or multi-user isolation (needs a separate daemon enforcement design).
- Backend services (orgs, subscriptions, payments, entitlements): Spine's.
- Changes to agent execution, protocol or pairing.
- A permanent branding branch.
- Renaming upstream directories or internal names.

## Delivery sequence (plan.md)

1. Establish baseline. 2. Branded desktop prototype. 3. Login integration. 4. Rehearse upstream upgrade. 5. Expand distribution.
   Validation and rollback: run affected upstream checks, add focused tests around custom boundaries, keep previous signed artifacts, document app and plugin rollback, back up state before irreversible migrations.

## Inferred / unverified

- Spine facts were relayed from the spine-oidc skill by the coordinator; re-check them against `.claude/skills/spine-oidc/SKILL.md` if they matter.
- The Spine-as-IdP choice and the login policy are candidates for `/zekoder-decision`.
