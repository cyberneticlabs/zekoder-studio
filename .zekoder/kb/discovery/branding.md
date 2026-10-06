# Branding touchpoints

State after feature 002 (Zekoder rebrand). Brand values are centralized; edit them there, not at call sites.

## Central sources
- `packages/protocol/src/branding.ts` — `BRAND` (name, websiteUrl, deepLinkScheme, defaultDaemonPort 6777, defaultHomeDirName `.zekoder`) and `brandUrl(path?)`. Plain constants, no imports; import as `@getpaseo/protocol/branding` (needs `npm run build:client`).
- `branding/generate-assets.mjs` — builds every raster icon (app, splash, notification, favicons, PWA, `brand-mark.png`, desktop PNG/ICO/ICNS) from `branding/source/logo-*.png`, Node built-ins only. `--check` compares decoded pixels; its test runs in CI (`.github/workflows/ci.yml` contracts step). Never hand-edit generated images; change the output table and rerun.
- `packages/app/src/i18n/rebrand.ts` — `rebrandTranslations` rewrites `Paseo` -> `BRAND.name` in string values at load time (`i18next.ts`). Locale files stay identical to upstream; do not edit them for branding.

## Literal ids (cannot import BRAND)
- `packages/app/app.config.js` — `Zekoder` / `net.zekoder.app`, debug `Zekoder Debug` / `net.zekoder.app.debug`, `scheme: zekoder`. `slug`/`owner`/`extra.eas.projectId` still EAS-bound to upstream.
- `packages/desktop/electron-builder.yml` — appId `net.zekoder.desktop`, productName/executableName `Zekoder`, protocol scheme `zekoder`, `Zekoder-` artifacts. `publish` still targets getpaseo releases (release audit owns it).
- Executable-name coupling (`<Name> Helper.app`): `desktop/bin/paseo{,.cmd}`, `scripts/after-pack.js`, `after-sign.js`, `linux-sandbox/index.js`, `e2e/*smoke*.js`, `nix/desktop-package.nix`, `.github/workflows/nix.yml` (CFBundleIdentifier). `desktop/src/diagnostics/updater.ts` ShipIt dir tracks appId.

## Deliberately unchanged
- Electron renderer origin `APP_SCHEME = "paseo"` (`desktop/src/main.ts`) — server CORS allows `paseo://app`.
- `parseAgentDeepLink` accepts both `zekoder:` and `paseo:`; redaction regexes cover both.
- Env vars (`PASEO_HOME`, `PASEO_LISTEN`), CLI binary `paseo`, package names, workspace `.paseo/` dirs, dev home `.dev/paseo-home` + port 6768.
- Hosting defaults `relay.paseo.sh`, `app.paseo.sh`, `hub.paseo.sh` (separate audit); `paseo.sh/docs/plugins/migration` URL in protocol/server plugin code.
- Desktop auto-update gated off (`BRANDED_AUTO_UPDATE_ENABLED = false` in `desktop/src/features/auto-updater.ts`) until a fork-owned feed exists; followup 001 restores the module-level tests when it flips.

## Remaining stale mentions (not yet branded)
- Root `CLAUDE.md` and `docs/android.md` text still cite `~/.paseo`/6767 in places; `main.ts` dev-worktree userData path `Paseo-<name>`.
- Firebase files under `packages/app/.secrets/` are registered for `sh.paseo`; delete stale ones until Zekoder Firebase apps exist (`docs/android.md`).
