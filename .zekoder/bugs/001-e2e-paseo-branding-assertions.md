---
id: 001-e2e-paseo-branding-assertions
type: bug
title: E2E tests still assert Paseo branding after Zekoder rebrand
status: planned
createdAt: 2026-10-10
openedAt: 2026-10-10T17:00:14.650Z
updatedAt: 2026-10-10T17:02:12.177Z
severity: medium
branch: bug-001-e2e-paseo-branding-assertions
promoted: false
packages: []
relatedFeatures:
  - 002-zekoder-rebrand
relatedBugs:
  - 002-builtin-plugin-pollutes-e2e-fixtures
relatedFollowups: []
resolvedBy: null
statusHistory: []
---
# Bug 001-e2e-paseo-branding-assertions: E2E tests still assert Paseo branding after Zekoder rebrand

## Summary

Playwright e2e specs and helpers assert Paseo-branded UI copy and `paseo.sh` URLs that the Zekoder rebrand (feature 002-zekoder-rebrand) changed at runtime, so CI run 38065806335 is red.

## Repro steps

1. From `packages/app`, run the browser specs: `packages/app/e2e/browser/pair-device-relay.spec.ts`, `settings-host-page.spec.ts`, `sidebar-help.spec.ts`, `root-error-recovery.spec.ts`, `plugin-management.spec.ts` (Playwright, one spec file at a time per repo rules).
2. Run the desktop renderer e2e `packages/desktop/e2e/pair-device-relay.spec.ts` (the `pair-device-relay-local-*` tests; CI job desktop-tests, step "Run desktop renderer E2E").
3. Each failing test times out waiting for a Paseo-labelled locator, regex or URL (failed on both CI attempts).

## Expected vs. actual

- **Expected**: e2e assertions track the branded product copy and URLs and pass.
- **Actual**: locators, regexes and URLs target Paseo strings while the app renders Zekoder:
  - link "Read how Paseo relay works" (`packages/app/e2e/support/helpers/pair-device.ts:93`, `:210`) — also breaks 5 desktop `pair-device-relay-local-*` tests, which import the same helper.
  - switch "Inject Paseo tools" (`packages/app/e2e/support/helpers/settings.ts:325`, used by `settings-host-page.spec.ts:44` via `expectHostInjectMcpCard`).
  - sidebar version regex `/^Paseo\s*v.../` (`sidebar-help.spec.ts:13`); app renders "Zekoderv0.11.2".
  - changelog popup URL regex `https://paseo.sh/changelog` (`sidebar-help.spec.ts:14`); popup came up as `chrome-error://chromewebdata/`.
  - "Paseo ran into a problem." (`root-error-recovery.spec.ts:52,64,72`).
  - plugin docs navigation `https://paseo.sh/` and origin check (`plugin-management.spec.ts:250,260`) — times out.

## Root cause

Confirmed. Brand is applied at runtime, not in source:

- `packages/app/src/i18n/rebrand.ts` rewrites `Paseo` to `BRAND.name` in every i18n string value at load (`packages/app/src/i18n/i18next.ts`). Locale files (`packages/app/src/i18n/resources/en.ts:1545`, `:1849`, `:2647`) intentionally stay upstream-identical, so the rendered text is "Zekoder ran into a problem.", "Read how Zekoder relay works", "Inject Zekoder tools".
- Product URLs come from `brandUrl()` in `packages/protocol/src/branding.ts` (`BRAND.websiteUrl = https://zekoder.net`), e.g. `packages/app/src/changelog/internal/changelog-sheet.tsx:29` (`/changelog`), `packages/app/src/desktop/components/pair-device-section.tsx:25` (`/docs/security`), `packages/app/src/screens/settings/plugins-page.tsx:37` (`/docs/plugins/reference#plugin-sources`).
- The e2e files above were never updated and hardcode the upstream strings.

"Zekoderv0.11.2" is a test-reading artifact, not a rendering defect: `packages/app/src/components/sidebar/sidebar-help-menu.tsx:173` renders the app name and the version as separate cells (`DropdownMenuHint` children + `trailing`), so `textContent` has no space; the existing spec comment (`sidebar-help.spec.ts:11-12`) and the `\s*` in the regex already account for that. Only the literal "Paseo" is wrong.

Unconfirmed: whether `https://zekoder.net/changelog` (and `/docs/plugins/reference`) is reachable from the CI runner. The `chrome-error://chromewebdata/` popup suggests the navigation failed (host not resolving or site not deployed yet), which would still fail `sidebar-help.spec.ts:75` after the regex is branded. See Fix approach.

## Fix approach

Assert against `BRAND` / `brandUrl()` from `@getpaseo/protocol/branding` (the e2e tree already imports `@getpaseo/protocol/*`; needs `npm run build:client` current). Do not edit locale files or product code.

- `pair-device.ts`: build labels as `` `Read how ${BRAND.name} relay works` `` (both occurrences); `:178` "Update the host to enable relay from Paseo Desktop." becomes `${BRAND.name} Desktop` (same rebrand source, same template-literal fix); `:213` expected URL becomes `brandUrl("/docs/security")`.
- `settings.ts:325`: `` `Inject ${BRAND.name} tools` ``.
- `sidebar-help.spec.ts`: build `APP_VERSION` from `BRAND.name` (escape for RegExp); `CHANGELOG_DESTINATION` from `brandUrl("/changelog")`. If the destination is unreachable in CI, stop asserting on `popup.url()` and instead capture the outgoing navigation request URL (the pattern `plugin-management.spec.ts:248-252` already uses), or route/fulfil the brand origin in the test; do not depend on the live site.
- `root-error-recovery.spec.ts` plus the vacuous negative assertions in `sidebar-project-name-whitespace.spec.ts:58` and `explorer-pane-placement.spec.ts:255`: use `` `${BRAND.name} ran into a problem.` `` so they keep meaning something.
- `plugin-management.spec.ts` `expectPluginSourceDocsOpen`: use `brandUrl("/docs/plugins/reference")` prefix/origin (`new URL(BRAND.websiteUrl).origin`); keep the `#plugin-sources` hash check. Same reachability caveat as above; the request-event wait is fine, the later `waitForURL` on origin may need loosening or request-based checking if the site is down.
- Sweep (left alone on purpose): fixtures and fake data that are not rendered copy (`Paseo E2E` git user names, `Paseo duplicate` project names, `Paseo docs` markdown fixtures, `Paseo` identifiers like `createPaseoWorktree`); `plugin-requirements.ts:98` and `plugin-hosts.spec.ts:15,26` assert strings from protocol/plugin code (`packages/protocol/src/plugin-requirements.ts`, `packages/app/src/plugins/hosts/index.ts`) that are not run through `rebrandTranslations`, so they must stay "Paseo". Flag for the coder to confirm, not change: `packages/desktop/e2e/pair-device-relay.spec.ts:128` routes `/:(6767)\b/` (upstream default port; branded default is `BRAND.defaultDaemonPort` 6777) and the sweep found no other user-facing Paseo/paseo.sh literals in `packages/desktop/e2e` (only `seedPaseoHome` helper names in `browser-tabs.e2e.mjs`).

## Tasks

- [ ] `packages/app/e2e/support/helpers/pair-device.ts`: brand relay link label (lines 93, 210), "Paseo Desktop" text (178), docs URL at 213 via `brandUrl("/docs/security")`.
- [ ] `packages/app/e2e/support/helpers/settings.ts:325`: brand the "Inject ... tools" switch name.
- [ ] `packages/app/e2e/browser/sidebar-help.spec.ts`: brand `APP_VERSION` and `CHANGELOG_DESTINATION`; make the changelog check independent of live-site reachability if needed.
- [ ] `packages/app/e2e/browser/root-error-recovery.spec.ts`, `sidebar-project-name-whitespace.spec.ts`, `explorer-pane-placement.spec.ts`: brand "ran into a problem." text.
- [ ] `packages/app/e2e/browser/plugin-management.spec.ts` (`expectPluginSourceDocsOpen`, ~lines 248-262): brand URL origin/prefix.
- [ ] Confirm `packages/desktop/e2e/pair-device-relay.spec.ts:128` port literal; change to `BRAND.defaultDaemonPort` only if it targets the daemon default.

## Verification

- Run each changed spec individually (no full suite): e.g. `npx playwright test packages/app/e2e/browser/sidebar-help.spec.ts` from `packages/app` per `docs/testing.md`, plus `packages/desktop/e2e/pair-device-relay.spec.ts` via the desktop renderer e2e script; rerun the failing CI shards/jobs for the full signal.
- `npm run typecheck`, `npm run lint -- <changed files>`, `npm run format` after changes.
- `rg "Paseo|paseo\.sh" packages/app/e2e packages/desktop/e2e` leaves only the non-copy fixtures/identifiers listed above.
- Related: bug 002-builtin-plugin-pollutes-e2e-fixtures (same CI run, separate cause); do not fold fixes together.

<!-- TODO: confirm whether zekoder.net/changelog and /docs/plugins/reference are live from CI before choosing the assertion style for sidebar-help.spec.ts:75 and plugin-management.spec.ts. -->
