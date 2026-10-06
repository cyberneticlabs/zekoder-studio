# Package 03 — brand-surfaces

- **Branch:** `002-zekoder-rebrand-03-brand-surfaces`
- **Depends on:** 01 (`BRAND`), 02 (serialized: both edit `packages/app/app.config.js`)
- **Consumes contract:** `brand-module`

## Worktree setup

Cut from the batch staging branch after 01 and 02 are merged onto it (the supervisor names it; `<staging>` below).
```bash
git worktree add ../worktrees/002-zekoder-rebrand-03-brand-surfaces -b 002-zekoder-rebrand-03-brand-surfaces <staging>
cd ../worktrees/002-zekoder-rebrand-03-brand-surfaces && npm install && npm run build:client
```

## Context

- Expo: `packages/app/app.config.js` (CJS, no build step, cannot import protocol `dist`): `variants` `:68-93`
  (`name`, `packageId`, picked by `APP_VARIANT`), `scheme: "paseo"` `:105`. iOS `bundleIdentifier` and Android
  `package` both read `variant.packageId`. Literal values here; a test cannot import it cheaply, so verify with
  `npx expo config --json` (task 7). Leave `slug`, `owner`, `extra.eas.projectId` alone (EAS/release).
- Web: `packages/app/public/manifest.json` `name`/`short_name`; `public/index.html:9`
  `apple-mobile-web-app-title`. `<title>%WEB_TITLE%</title>` follows `expo.name` automatically.
- UI strings: 9 locale files (`packages/app/src/i18n/resources/*.ts`, ~36-39 "Paseo" each) loaded in
  `packages/app/src/i18n/i18next.ts:21-31`. Rewrite at load time; do not edit locale files (upstream i18n churn
  would conflict on every sync).
- Links: product `paseo.sh` URLs at `changelog/internal/changelog-sheet.tsx:28`, `agent-skills/index.tsx:27`,
  `desktop/updates/rosetta-callout-source.tsx:14`, `desktop/components/desktop-updates-section.tsx:507`,
  `desktop/components/pair-device-section.tsx:24`, `desktop/components/integrations-section.tsx:14`,
  `screens/project-settings-screen.tsx:90`, `screens/schedules-screen.tsx:324`, `screens/startup-splash-screen.tsx:33`,
  `screens/settings/plugins-page.tsx:36`, `screens/settings/metadata-generation-page.tsx:16`,
  `components/welcome-screen.tsx:192,295` (all under `packages/app/src`). Leave `app.paseo.sh`/`relay.paseo.sh`
  (hosting, out of scope), GitHub/Discord links, `desktop-updates.ts` release URLs.
- Desktop: `packages/desktop/electron-builder.yml` (`appId` L2, `productName` L3, `executableName` L4, `protocols`
  L5-8, `artifactName` L43/62/85/87, `vendor` L64, `--class=Paseo` L78). `desktop/package.json` L5 description,
  L6 homepage, L49 `desktopName`. `desktop/src/main.ts:114` `APP_NAME`, `:347-348` desktop name and class.
  **Keep `APP_SCHEME = "paseo"` (`main.ts:111`)**: it is the renderer's internal origin `paseo://app`, allowed by
  server CORS (`server/src/server/bootstrap.ts:739`); OS deep links arrive through `open-url`/argv and go to the
  protocol parser 01 updated. Add a one-line comment saying so.
- Executable-name coupling (productName/executableName drive bundle names, including `Zekoder Helper.app`):
  `desktop/bin/paseo:24,31,35-37`, `desktop/bin/paseo.cmd:6`, `desktop/scripts/after-pack.js:8`,
  `desktop/scripts/after-sign.js:5`, `desktop/scripts/linux-sandbox/index.js:6`, `desktop/e2e/packaged-app-smoke.js:12`,
  `desktop/e2e/linux-artifact-smoke.js:26,33,48`, `nix/desktop-package.nix:206-243`, `.github/workflows/nix.yml:107`
  (asserts `CFBundleIdentifier`). The bin files keep their names (`paseo` CLI stays).
- macOS updater cache dir tracks appId: `desktop/src/diagnostics/updater.ts:8` `SHIPIT_DIRECTORY_NAME`.
- Shell integration text: `desktop/src/integrations/cli-install/shell-rc.ts:90`, `install.ts:46`.
- Hardcoded app strings outside i18n: `app/src/screens/settings/browser-tools-config.ts:5`,
  `app/src/screens/workspace/workspace-route-state.ts:87`, `app/src/diagnostics/app-diagnostic-report.ts:25`.
- Auto-update: `desktop/src/features/auto-updater.ts:225-239` builds `createAppUpdateService` with
  `isPackaged: () => app.isPackaged`. `app-update-service.ts:249,336,476` short-circuit every check, download and
  install-on-quit when `isPackaged()` is false. electron-builder `publish` still targets getpaseo releases.
- Firebase: `app.config.js:72-90` resolves `google-services.*.json` / `GoogleService-Info.*.plist` from env or
  `./.secrets/`. Those files are registered for `sh.paseo`; with `net.zekoder.app` an Android build fails on a
  package mismatch if a stale file is present (see external-dependencies).

## Tasks

- [x] 1. `app.config.js`: production `name: "Zekoder"`, `packageId: "net.zekoder.app"`; development
  `name: "Zekoder Debug"`, `packageId: "net.zekoder.app.debug"`; `scheme: "zekoder"`. Web: manifest
  `name`/`short_name` `Zekoder`, index.html apple title `Zekoder`. Update `docs/android.md:3-12,78,81` variant table
  and ids, and add one line there: delete stale `packages/app/.secrets/google-services.*` / `GoogleService-Info.*`
  files registered for `sh.paseo` until Zekoder Firebase apps exist.
- [x] 2. UI strings: add `packages/app/src/i18n/rebrand.ts` exporting `rebrandTranslations<T>(resource: T): T`,
  a deep copy replacing the substring `/Paseo/g` with `BRAND.name` in string values only (keys untouched;
  case-sensitive, so `$PASEO_PORT` and lowercase `paseo` CLI commands are unaffected; covers compounds like
  "PaseoDesktop"). Wrap each resource in `i18next.ts`. Add cases to
  `packages/app/src/i18n/resources.test.ts`: `en` `sidebar.help.appName` is `Zekoder`; no string value in any
  rewritten locale contains the substring `Paseo`; a `{{count}}` placeholder survives.
- [x] 2b. Hardcoded strings: in the three files listed in Context, build the text with `BRAND.name` instead of
  the literal "Paseo". Update any test that pins those exact strings (grep the three messages).
- [x] 3. Links: each listed URL becomes `brandUrl("<same path>")` (bare site: `brandUrl()`); welcome link
  label shows `zekoder.net` (derive from `BRAND.websiteUrl`, strip scheme).
- [x] 4. Desktop config: electron-builder `appId: net.zekoder.desktop`, `productName`/`executableName: Zekoder`,
  protocol `name: Zekoder agent link`, `schemes: [zekoder]`, every `Paseo-` artifact prefix to `Zekoder-`,
  `vendor: Zekoder`, `--class=Zekoder`. Leave `publish` and `maintainer`. `desktop/package.json` description
  `Zekoder desktop app (Electron wrapper)`, homepage `https://zekoder.net`, `desktopName: Zekoder.desktop`.
  `main.ts`: `APP_NAME` default `BRAND.name`, `setDesktopName("Zekoder.desktop")`, class `Zekoder`.
  Desktop appId is `net.zekoder.desktop` (mobile stays `net.zekoder.app`).
- [x] 5. Executable coupling: replace `Paseo` with `Zekoder` in every file listed under that Context bullet
  (paths and helper names only). `updater.ts` ShipIt dir becomes `net.zekoder.desktop.ShipIt`. `.github/workflows/nix.yml:107` expected
  CFBundleIdentifier becomes `net.zekoder.desktop`. Shell-rc comment and
  shim message say Zekoder.
- [x] 6. Tests that pin those values: `desktop/src/daemon/desktop-packaging.test.ts:28-39,122-126,173` (also
  assert `appId: net.zekoder.desktop` there), `desktop/src/daemon/linux-launcher.posix.test.ts:32-59`,
  `desktop/src/diagnostics/updater.test.ts`, `app/src/diagnostics/desktop-diagnostic-report.test.ts:36-52`,
  `desktop/src/features/opener.test.ts:30` only if it asserts the OS scheme (it uses the renderer origin — leave if so).
- [x] 6b. Auto-update gate: in `auto-updater.ts` add
  `const BRANDED_AUTO_UPDATE_ENABLED = false; // Zekoder: off until a fork-owned update feed exists (never install upstream builds)`
  and pass `isPackaged: () => BRANDED_AUTO_UPDATE_ENABLED && app.isPackaged`. No other updater change; leave
  `publish` in electron-builder.yml (release audit owns it). Add one case to `desktop/src/features/auto-updater.test.ts`
  only if it already constructs the module-level service; otherwise the service tests already cover the
  `isPackaged() === false` path.
- [x] 7. `npx expo config --json` from `packages/app` (default and `APP_VARIANT=development`) shows the new name,
  scheme, bundle id and package. `npm run build:client`, `npm run typecheck`, `npm run lint -- <changed files>`,
  `npm run format:files -- <changed files>`.

## Verification

One at a time, `--bail=1`, output to `/tmp/test-output.txt`: `packages/app/src/i18n/resources.test.ts`,
`packages/desktop/src/daemon/desktop-packaging.test.ts`, `packages/desktop/src/daemon/linux-launcher.posix.test.ts`,
`packages/desktop/src/diagnostics/updater.test.ts`, `packages/app/src/diagnostics/desktop-diagnostic-report.test.ts`,
`packages/desktop/src/features/opener.test.ts`, `packages/desktop/src/features/auto-updater.test.ts`.
`rg -n 'Paseo' packages/app/src/screens/settings/browser-tools-config.ts packages/app/src/screens/workspace/workspace-route-state.ts packages/app/src/diagnostics/app-diagnostic-report.ts` returns nothing.
`rg -n "paseo\.sh" packages/app/src` returns only `app.paseo.sh`/`relay.paseo.sh` and the comment in `host-picker.tsx`.
`rg -n "\bPaseo\b" packages/desktop/bin packages/desktop/electron-builder.yml packages/desktop/scripts/after-pack.js packages/desktop/scripts/after-sign.js packages/desktop/scripts/linux-sandbox/index.js` returns nothing.
`rg -n 'sh\.paseo\.desktop' .github nix packages/desktop --glob '!node_modules'` returns nothing.
Packaged smoke tests (`packaged-app-smoke.js`, nix build) run in CI only.

## Progress

- Status: implemented, ready for review
- Notes:
