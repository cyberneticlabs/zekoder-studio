---
id: 002-zekoder-rebrand
type: feature
title: Rebrand the app as Zekoder
status: merged
createdAt: 2026-10-04
openedAt: 2026-10-04T13:31:24.147Z
updatedAt: 2026-10-06T11:20:57.738Z
completedAt: 2026-10-06T11:20:57.738Z
promoted: true
dependsOn: []
packages:
  - id: "01"
    name: brand-core
    file: packages/01-brand-core.md
    branch: 002-zekoder-rebrand-01-brand-core
    dependsOn: []
    status: merged
    commit: 8948da5806ecf9e23ce4c9782431a784893eaf74
    mergeMode: local
    filesTouched:
      - .zekoder/features/002-zekoder-rebrand/packages/01-brand-core.md
      - docs/development.md
      - packages/app/src/components/add-host-modal.tsx
      - packages/app/src/diagnostics/app-diagnostic-report.test.ts
      - packages/app/src/diagnostics/app-diagnostic-report.ts
      - packages/app/src/runtime/host-runtime.test.ts
      - packages/app/src/runtime/host-runtime.ts
      - packages/cli/src/commands/hub/credentials.ts
      - packages/cli/src/commands/onboard.ts
      - packages/cli/src/utils/command-options.ts
      - packages/protocol/src/agent-deep-link.test.ts
      - packages/protocol/src/agent-deep-link.ts
      - packages/protocol/src/branding.test.ts
      - packages/protocol/src/branding.ts
      - packages/protocol/src/ssh-transport.ts
      - packages/server/.env.example
      - packages/server/src/server/config.ts
      - packages/server/src/server/paseo-home.ts
      - packages/server/src/server/persisted-config.test.ts
      - packages/server/src/server/persisted-config.ts
      - packages/server/src/server/session/daemon/daemon-session.test.ts
      - packages/server/src/server/session/daemon/diagnostics.ts
    verifiedBaseSha: cfb2237b629cdd0da0621a33d25a6fc648ecf076
  - id: "02"
    name: brand-assets
    file: packages/02-brand-assets.md
    branch: 002-zekoder-rebrand-02-brand-assets
    dependsOn: []
    status: merged
    commit: ec7196673a3f72b6f91b33517c37bd1329ae7db2
    mergeMode: local
    filesTouched:
      - .github/workflows/ci.yml
      - branding/README.md
      - branding/generate-assets.mjs
      - branding/generate-assets.test.mjs
      - branding/source/logo-blue.png
      - branding/source/logo-dark.png
      - branding/source/logo-white.png
      - packages/app/app.config.js
      - packages/app/assets/images/android-icon-foreground.png
      - packages/app/assets/images/brand-mark.png
      - packages/app/assets/images/butterfly-green.svg
      - packages/app/assets/images/butterfly-white.svg
      - packages/app/assets/images/favicon-dark-attention.png
      - packages/app/assets/images/favicon-dark-attention.svg
      - packages/app/assets/images/favicon-dark-running.png
      - packages/app/assets/images/favicon-dark-running.svg
      - packages/app/assets/images/favicon-dark.png
      - packages/app/assets/images/favicon-dark.svg
      - packages/app/assets/images/favicon-light-attention.png
      - packages/app/assets/images/favicon-light-attention.svg
      - packages/app/assets/images/favicon-light-running.png
      - packages/app/assets/images/favicon-light-running.svg
      - packages/app/assets/images/favicon-light.png
      - packages/app/assets/images/favicon-light.svg
      - packages/app/assets/images/favicon.png
      - packages/app/assets/images/icon.png
      - packages/app/assets/images/notification-icon.png
      - packages/app/assets/images/splash-icon-dark.png
      - packages/app/assets/images/splash-icon.png
      - packages/app/public/apple-touch-icon.png
      - packages/app/public/pwa-icon-192.png
      - packages/app/public/pwa-icon-512.png
      - packages/app/src/components/icons/paseo-logo.tsx
      - packages/desktop/assets/128x128.png
      - packages/desktop/assets/128x128@2x.png
      - packages/desktop/assets/32x32.png
      - packages/desktop/assets/64x64.png
      - packages/desktop/assets/icon-dev.png
      - packages/desktop/assets/icon.icns
      - packages/desktop/assets/icon.ico
      - packages/desktop/assets/icon.png
    verifiedBaseSha: 16d2888f1e73dc8f37fd68e59f42946249370e5b
  - id: "03"
    name: brand-surfaces
    file: packages/03-brand-surfaces.md
    branch: 002-zekoder-rebrand-03-brand-surfaces
    dependsOn:
      - "01"
      - "02"
    status: merged
    commit: 6c964ba1071cdf18256720ab78eb7eb077d0af39
    mergeMode: local
    filesTouched:
      - .github/workflows/nix.yml
      - .zekoder/features/002-zekoder-rebrand/packages/03-brand-surfaces.md
      - .zekoder/followups/001-restore-auto-updater-service-tests.md
      - docs/android.md
      - nix/desktop-package.nix
      - packages/app/app.config.js
      - packages/app/public/index.html
      - packages/app/public/manifest.json
      - packages/app/src/agent-skills/index.tsx
      - packages/app/src/changelog/internal/changelog-sheet.tsx
      - packages/app/src/components/welcome-screen.tsx
      - packages/app/src/desktop/components/desktop-updates-section.tsx
      - packages/app/src/desktop/components/integrations-section.tsx
      - packages/app/src/desktop/components/pair-device-section.tsx
      - packages/app/src/desktop/updates/rosetta-callout-source.tsx
      - packages/app/src/diagnostics/app-diagnostic-report.ts
      - packages/app/src/diagnostics/desktop-diagnostic-report.test.ts
      - packages/app/src/i18n/i18next.ts
      - packages/app/src/i18n/rebrand.ts
      - packages/app/src/i18n/resources.test.ts
      - packages/app/src/screens/project-settings-screen.tsx
      - packages/app/src/screens/schedules-screen.tsx
      - packages/app/src/screens/settings/browser-tools-config.ts
      - packages/app/src/screens/settings/metadata-generation-page.tsx
      - packages/app/src/screens/settings/plugins-page.tsx
      - packages/app/src/screens/startup-splash-screen.tsx
      - packages/app/src/screens/workspace/workspace-route-state.test.ts
      - packages/app/src/screens/workspace/workspace-route-state.ts
      - packages/desktop/bin/paseo
      - packages/desktop/bin/paseo.cmd
      - packages/desktop/e2e/linux-artifact-smoke.js
      - packages/desktop/e2e/packaged-app-smoke.js
      - packages/desktop/e2e/updates.spec.ts
      - packages/desktop/electron-builder.yml
      - packages/desktop/package.json
      - packages/desktop/scripts/after-pack.js
      - packages/desktop/scripts/after-sign.js
      - packages/desktop/scripts/linux-sandbox/index.js
      - packages/desktop/src/daemon/desktop-packaging.test.ts
      - packages/desktop/src/daemon/linux-launcher.posix.test.ts
      - packages/desktop/src/diagnostics/updater.test.ts
      - packages/desktop/src/diagnostics/updater.ts
      - packages/desktop/src/features/auto-updater.test.ts
      - packages/desktop/src/features/auto-updater.ts
      - packages/desktop/src/integrations/cli-install/install.ts
      - packages/desktop/src/integrations/cli-install/shell-rc.ts
      - packages/desktop/src/main.ts
    verifiedBaseSha: ec7196673a3f72b6f91b33517c37bd1329ae7db2
contracts:
  - id: brand-module
    type: internal
    kind: composable
    owner: "01"
    consumers:
      - "03"
mergeMode: local
relatedFeatures: []
relatedBugs: []
relatedFollowups: []
statusHistory:
  - from: planned
    to: in-progress
    at: 2026-10-06T10:52:50.994Z
  - from: in-progress
    to: merged
    at: 2026-10-06T11:20:57.738Z
---
# Feature 002-zekoder-rebrand: Rebrand the app as Zekoder

## User's request (verbatim)

"let's rebrand the app as Zekoder. attached are the logo in png format. we will need to rescale to be exact square, website is zekoder.net. you might need to create an ico file"

Source marks (860x666 RGBA, mark fills the canvas, brand blue sampled `#1461BD`) are committed at
`.zekoder/features/002-zekoder-rebrand/assets/{logo-blue,logo-dark,logo-white}.png`.

## Refined scope

- **Identity, so Zekoder installs beside upstream Paseo:** display name `Zekoder` (`Zekoder Debug` for the
  development variant); bundle/package/app id `net.zekoder.app` (`net.zekoder.app.debug`) for iOS and Android;
  Electron appId `net.zekoder.desktop`; deep-link scheme `zekoder://`; default home `~/.zekoder`; default daemon port `6777`.
  Dev stays on `.dev/paseo-home` and `6768`.
- **One central brand module**, `packages/protocol/src/branding.ts` (`BRAND`, `brandUrl()`), consumed by
  server, CLI, app and desktop. Env var names (`PASEO_HOME`, `PASEO_LISTEN`, `PORT`) and internal names stay;
  only defaults change.
- **Assets** regenerated by a committed zero-dependency script, `branding/generate-assets.mjs`, from the
  source marks: app icons (blue mark on white square), Android adaptive foreground, splash (light + dark),
  monochrome notification icon, favicons (blue on light, white on dark, with running/attention dots),
  PWA/apple-touch icons, desktop PNG set, multi-size `icon.ico` and `icon.icns` (desktop set on a macOS Big Sur
  rounded tile with ~10% margin; mobile/web icons full-bleed). `PaseoLogo` renders the mark.
- **Remove upstream marks:** the butterfly is replaced wherever it is the product logo; unreferenced butterfly
  and favicon SVG sources are deleted.
- **Desktop auto-update disabled** in the branded build until Zekoder has its own feed (guardrail: a branded
  update must never install upstream binaries). One gate in `packages/desktop/src/features/auto-updater.ts`.
- **User-visible text and links:** "Paseo" becomes "Zekoder" in all app-side UI strings (one load-time rewrite in
  i18n setup, no locale file diffs, plus three hardcoded app strings); product `paseo.sh` links become `zekoder.net` links via `brandUrl()`.

## Out of scope

- `packages/website`; release CI, code signing, EAS project/owner/`ascAppId`, fastlane ids and store
  metadata, electron-builder `publish`, desktop update feed URLs (`desktop-updates.ts`), relay/app/hub
  hosting defaults (`relay.paseo.sh`, `app.paseo.sh`, `hub.paseo.sh`) — separate audit.
- Docker images, `nix/module.nix` port defaults, maestro/mobile e2e app ids, dev scripts.
- Renaming packages, directories, the `paseo` CLI binary, env vars, IPC channels, native module ids
  (`sh.paseo.scroll` etc.), workspace-local `.paseo/` markers. UI theme colors.
- GitHub issue / Discord / changelog-source links (they point at upstream, not `paseo.sh`).
- Daemon-originated text still says "Paseo": server worktree errors, daemon self-updater messages, protocol
  plugin-requirement messages, voice prompts. The rebrand covers app-side strings only.
- Desktop manual-download URLs in `packages/app/src/desktop/updates/` (release audit).

## Packages

| # | Package | Branch | Depends on | Summary |
|---|---------|--------|-----------|---------|
| 01 | brand-core | `002-zekoder-rebrand-01-brand-core` | — | `BRAND` module; home, port and deep-link defaults in server/CLI/app/protocol; dev docs |
| 02 | brand-assets | `002-zekoder-rebrand-02-brand-assets` | — | Generator script + test, all regenerated icons, `PaseoLogo`, asset lines in `app.config.js` |
| 03 | brand-surfaces | `002-zekoder-rebrand-03-brand-surfaces` | 01, 02 | App/desktop ids, names, scheme, PWA manifest, UI strings, links, desktop shims and nix, auto-update gate |

```
01-brand-core ──┐
                ├──> 03-brand-surfaces
02-brand-assets ┘
```

01 and 02 run in parallel. 03 consumes `BRAND` (contract `brand-module`) and is serialized after 02
because both edit `packages/app/app.config.js`.

## Key design choices

- The Electron renderer's internal protocol stays `paseo://app` (`desktop/src/main.ts` `APP_SCHEME`). Only
  the OS-registered deep-link scheme changes. That keeps the server CORS allowlist
  (`server/src/server/bootstrap.ts:739`) valid, so the branded desktop still reaches upstream daemons.
- The deep-link parser accepts both `zekoder:` and `paseo:`; the builder emits `zekoder:`. Redaction
  regexes cover both.
- `brandUrl(path)` keeps the existing `paseo.sh` path (`/docs/cli` becomes `https://zekoder.net/docs/cli`).

## Related bugs & followups

None open. Registry holds only feature 001-builtin-zekoder-plugin (planned): separate — plugins area, no
file overlap; no dependency either way.

## Decisions consulted

None on file for branding, identifiers, ports or home dir.
