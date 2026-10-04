<!-- discovery-stamp: sha=547d0c3a98e8650c39c31acdb16a69811fe4c8dd globs=["packages/app/app.config.js", "packages/app/public/**", "packages/app/assets/images/**", "packages/app/src/i18n/**", "packages/app/src/components/icons/paseo-logo.tsx", "packages/app/src/hooks/use-favicon-status.ts", "packages/app/src/runtime/host-runtime.ts", "packages/app/src/components/add-host-modal.tsx", "packages/app/src/**/*paseo.sh*", "packages/desktop/electron-builder.yml", "packages/desktop/package.json", "packages/desktop/src/main.ts", "packages/desktop/src/diagnostics/updater.ts", "packages/desktop/bin/**", "packages/desktop/scripts/**", "packages/desktop/assets/**", "packages/desktop/e2e/*smoke*.js", "packages/server/src/server/paseo-home.ts", "packages/server/src/server/config.ts", "packages/server/src/server/persisted-config.ts", "packages/server/src/server/bootstrap.ts", "packages/protocol/src/agent-deep-link.ts", "packages/protocol/src/ssh-transport.ts", "packages/cli/src/commands/hub/credentials.ts", "nix/desktop-package.nix", "docs/android.md", "docs/development.md"] updatedAt=2026-10-04T13:42:43Z -->
# Branding touchpoints

State as of discovery (before feature 002 lands). After 002, the central constants live in `packages/protocol/src/branding.ts` (`BRAND`, `brandUrl`).

## Identity
- `packages/app/app.config.js` (CJS, cannot import protocol dist) — `variants` (name/packageId by `APP_VARIANT`, production + development only), `scheme`; iOS bundleIdentifier and Android package both = `variant.packageId`. `slug`/`owner`/`extra.eas.projectId` are EAS-bound.
- `packages/app/public/manifest.json`, `public/index.html` (apple title; `<title>%WEB_TITLE%</title>` follows expo.name).
- `packages/desktop/electron-builder.yml` — appId, productName, executableName, protocols, artifactName x4, vendor, `--class`, publish (release feed).
- `packages/desktop/src/main.ts` — `APP_SCHEME` (:111) is the renderer origin `paseo://app`, allowed by server CORS `packages/server/src/server/bootstrap.ts:739`; changing it breaks connections to daemons without that origin. `APP_NAME` (:114, `PASEO_TEST_APP_NAME` override), setDesktopName/class (:347-348).
- `packages/desktop/src/diagnostics/updater.ts:8` — ShipIt cache dir name tracks appId.
- Executable-name coupling (productName drives `<Name> Helper.app`): `desktop/bin/paseo`, `bin/paseo.cmd`, `scripts/after-pack.js`, `scripts/after-sign.js`, `scripts/linux-sandbox/index.js`, `e2e/packaged-app-smoke.js`, `e2e/linux-artifact-smoke.js`, `nix/desktop-package.nix`, `.github/workflows/nix.yml` (CFBundleIdentifier assert).
- Native module ids `sh.paseo.scroll|diffprototype|trace` are internal, independent of app id.

## Defaults
- Home: `packages/server/src/server/paseo-home.ts` `resolvePaseoHome` (used by server, CLI, desktop). Duplicate in `packages/cli/src/commands/hub/credentials.ts`.
- Port: `server/src/server/config.ts` `DEFAULT_PORT` + `resolveListenAddress`; `persisted-config.ts` `DEFAULT_PERSISTED_CONFIG.daemon.listen` (pinned by persisted-config.test.ts); `protocol/src/ssh-transport.ts` `DEFAULT_SSH_DAEMON_PORT`; `app/src/runtime/host-runtime.ts` `LOCALHOST_FALLBACK_ENDPOINT` (override `EXPO_PUBLIC_LOCAL_DAEMON`); `app/src/components/add-host-modal.tsx`.
- Desktop manages its daemon via `desktop/src/daemon/daemon-manager.ts` with `home = resolvePaseoHome`; no port passed (server default); app talks over IPC local transport.
- Dev overrides are env-only (`PASEO_HOME`, `PASEO_LISTEN`, `PORT`; `paseo.json`, `scripts/dev-*.sh`), dev = `.dev/paseo-home` + 6768.
- Workspace-local `.paseo/` dirs (worktrees, hub) are a separate concept from the home dir.

## Deep links
- `packages/protocol/src/agent-deep-link.ts` builds/parses `<scheme>://h/<serverId>/agent/<agentId>`; callers `cli/src/commands/open.ts`, `app/src/utils/host-routes.ts`, `desktop/src/agent-navigation.ts`, `desktop/src/main.ts`. No `setAsDefaultProtocolClient`; OS registration comes from electron-builder `protocols` and Expo `scheme`.
- Redaction regexes: `server/src/server/session/daemon/diagnostics.ts`, `app/src/diagnostics/app-diagnostic-report.ts`.

## Assets
- `packages/app/assets/images/` — icon 1024, android-icon-foreground 1024 (adaptive bg color in app.config), splash-icon 200, notification-icon 96 (+ color in expo-notifications plugin), favicon 48, `favicon-{light,dark}{,-running,-attention}` 48 (swapped by `app/src/hooks/use-favicon-status.ts`; dot at 570,570 r130 of 700, running #3b82f6, attention #22c55e). `editor-apps/`, `icons/` are third-party.
- `packages/app/public/` — apple-touch 180, pwa-icon 192/512 (manifest purpose `any maskable`).
- `packages/desktop/assets/` — icon.png 512, icon-dev.png 1254 (dev, stamped by `desktop/src/features/stamped-icon.ts`), 32/64/128/128@2x (linux icon dir), icon.ico, icon.icns. `editor-targets/` third-party.
- No image tooling is declared (sharp/pngjs only transitive); host has sips/iconutil but no ImageMagick/PIL.
- Product logo component: `app/src/components/icons/paseo-logo.tsx` (welcome, startup splash, open-project, tool-call icon for Paseo MCP tools).

## Strings and links
- i18n: 9 locales in `app/src/i18n/resources/*.ts`, ~36-39 "Paseo" each, loaded in `app/src/i18n/i18next.ts`.
- Product `paseo.sh` links: ~12 constants under `packages/app/src` (welcome, changelog, docs, download). Hosting defaults `relay.paseo.sh`, `app.paseo.sh`, `hub.paseo.sh` live in server/CLI config (separate audit).
- Desktop update URLs `app/src/desktop/updates/desktop-updates.ts` point at getpaseo GitHub releases and depend on mac artifactName.
