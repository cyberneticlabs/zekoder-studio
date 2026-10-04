# Checklist — 002-zekoder-rebrand

## Feature gates

- [ ] `npm run typecheck`, `npm run lint`, `npm run format:check` clean.
- [ ] Only changed test files run locally, one at a time, `--bail=1`. Full suite in CI.
- [ ] No protocol wire change: `git diff main -- packages/protocol/src` touches only `branding.ts`, `agent-deep-link.ts`, `ssh-transport.ts` and their tests.
- [ ] No renamed packages, directories, env vars, IPC channels or CLI binary.
- [ ] No secrets, signing material or publish-target changes. LICENSE and attribution untouched.
- [ ] Identifiers distinct from upstream: mobile `net.zekoder.app[.debug]`, desktop `net.zekoder.desktop`, `zekoder://`, `~/.zekoder`, 6777.
- [ ] Branded desktop never auto-updates from the upstream feed (gate off).

## 01-brand-core

- [ ] `rg -n '"~/.paseo"' packages/*/src` empty; CLI hub credentials uses the shared resolver.
- [ ] `paseo:` deep links still parse; builder emits `zekoder:`; redaction covers both.
- [ ] Dev daemon still on 6768 with `.dev/paseo-home` (env overrides unchanged).

## 02-brand-assets

- [ ] `node branding/generate-assets.mjs --check` exits 0; new test listed in `.github/workflows/ci.yml:55`.
- [ ] Every generated PNG square at its table size; `icon.ico` 7 sizes; `icon.icns` opens with `iconutil`.
- [ ] Desktop set uses the rounded tile with ~10% margin; mobile/web icons full-bleed white.
- [ ] Butterfly/favicon SVG sources removed; `PaseoLogo` API unchanged, no new `useUnistyles()`, renders in light and dark theme.

## 03-brand-surfaces

- [ ] `npx expo config --json` shows new name/scheme/ids for both variants.
- [ ] No app-side UI string contains `Paseo` (i18n rewrite plus the three hardcoded strings); locale files unchanged. Daemon-originated text is out of scope.
- [ ] Desktop appId `net.zekoder.desktop`, ShipIt dir `net.zekoder.desktop.ShipIt`; auto-update gate off.
- [ ] Electron renderer scheme still `paseo` (CORS); OS protocol registration `zekoder`.
- [ ] Bundle-name coupling (bin shims, after-pack/sign, linux sandbox, smoke scripts, nix) all say Zekoder; `nix.yml` asserts CFBundleIdentifier `net.zekoder.desktop`; no `sh.paseo.desktop` left in `.github`, `nix`, `packages/desktop`.
