# Package 02 — brand-assets

- **Branch:** `002-zekoder-rebrand-02-brand-assets`
- **Depends on:** none (runs in parallel with 01)
- **Contracts:** none consumed or owned. 03 runs after this package and only edits non-asset lines of `app.config.js`.

## Worktree setup

```bash
git worktree add ../worktrees/002-zekoder-rebrand-02-brand-assets -b 002-zekoder-rebrand-02-brand-assets main
cd ../worktrees/002-zekoder-rebrand-02-brand-assets && npm install
```

## Context

- Source marks: `.zekoder/features/002-zekoder-rebrand/assets/logo-{blue,dark,white}.png` — 860x666, 8-bit
  RGBA (PNG color type 6), non-interlaced; the mark spans the full canvas. Blue `#1461BD`, dark `#333333`, white `#FFFFFF`.
- No image dependency is declared anywhere (`sharp`/`pngjs` exist only transitively). The host has no
  ImageMagick or PIL. Write the script with Node built-ins only (`node:zlib`, `node:fs`, `Buffer`).
- Conventions: Node ESM `.mjs`, main guard via `scripts/is-main-module.mjs`, `node:test` tests listed
  explicitly in `.github/workflows/ci.yml:55` (model: `scripts/sync-fdroid-changelogs.test.mjs`).
- Favicons today: `packages/app/src/hooks/use-favicon-status.ts:11-24,48` loads six 48px PNGs
  `favicon-{light,dark}{,-running,-attention}.png`. The status dot geometry in the current SVGs is
  center (570,570), r=130 on a 700 canvas; running `#3b82f6`, attention `#22c55e`. Keep that geometry and those colors.
- `PaseoLogo` (`packages/app/src/components/icons/paseo-logo.tsx`): props `{size=64, color}`, fills with
  `color ?? theme.colors.foreground`, read today through `useUnistyles()` — forbidden per `docs/unistyles.md`. Used by welcome, startup splash, open-project screens and tool-call icons.
  RN `Image` `tintColor` works on native and react-native-web, so a white PNG mark tinted at render keeps that API.
- Unreferenced stale sources: `packages/app/assets/images/favicon-*.svg`, `butterfly-green.svg`, `butterfly-white.svg`.
  Grep before deleting; if anything references them, keep and report.

## Output table (every file at an exact square size)

Compositions: **app** = blue mark, width 62% of canvas, centered on opaque white (fits the maskable safe
circle); **tile** = macOS Big Sur style: transparent canvas, white rounded square inset ~10% per side
(824/1024, corner radius ~22.5% of the tile), blue mark at 62% of the tile width, no shadow; **fg** = blue mark, width 55%, transparent (Android adaptive safe zone); **mark-blue / mark-white**
= mark fitted to 92% width, centered, transparent; **dot** = add status dot.

| Path                                                                               | Size(s)                                                            | Composition                                                      |
| ---------------------------------------------------------------------------------- | ------------------------------------------------------------------ | ---------------------------------------------------------------- |
| `packages/app/assets/images/icon.png`                                              | 1024                                                               | app                                                              |
| `packages/app/assets/images/android-icon-foreground.png`                           | 1024                                                               | fg                                                               |
| `packages/app/assets/images/splash-icon.png` / `splash-icon-dark.png`              | 200                                                                | mark-blue / mark-white                                           |
| `packages/app/assets/images/notification-icon.png`                                 | 96                                                                 | mark-white (monochrome)                                          |
| `packages/app/assets/images/favicon.png`                                           | 48                                                                 | mark-blue                                                        |
| `favicon-light{,-running,-attention}.png`                                          | 48                                                                 | mark-blue (+ dot)                                                |
| `favicon-dark{,-running,-attention}.png`                                           | 48                                                                 | mark-white (+ dot)                                               |
| `packages/app/assets/images/brand-mark.png`                                        | 512x397                                                            | white mark, aspect kept (only non-square file; used for tinting) |
| `packages/app/public/apple-touch-icon.png`, `pwa-icon-192.png`, `pwa-icon-512.png` | 180, 192, 512                                                      | app                                                              |
| `packages/desktop/assets/icon.png`, `icon-dev.png`                                 | 512, 1254                                                          | tile                                                             |
| `packages/desktop/assets/32x32.png`, `64x64.png`, `128x128.png`, `128x128@2x.png`  | 32, 64, 128, 256                                                   | tile                                                             |
| `packages/desktop/assets/icon.ico`                                                 | 16, 24, 32, 48, 64, 128, 256                                       | tile, PNG-embedded entries                                       |
| `packages/desktop/assets/icon.icns`                                                | 16–1024 (`icp4 icp5 icp6 ic07 ic08 ic09 ic10 ic11 ic12 ic13 ic14`) | tile, PNG-embedded                                               |

## Tasks

- [ ] 1. Copy the three source marks to `branding/source/logo-{blue,dark,white}.png` (new owned top-level dir; the
     `.zekoder` copy is plan history, not a build input).
- [ ] 2. Write `branding/generate-assets.mjs`: PNG decode (reject anything but 8-bit RGBA non-interlaced), area-average
     downscale, alpha-over composite, anti-aliased filled circle, PNG encode, ICO and ICNS writers. Drive it from one
     output table matching the table above. Flags: default writes all files; `--out <dir>` writes under another root;
     `--check` regenerates in memory and compares **decoded pixels** (not bytes; zlib output varies across Node
     versions) with the committed files, exiting non-zero on any mismatch. Export the pure helpers for the test.
- [ ] 3. Add `branding/generate-assets.test.mjs` (`node:test`): generate into a temp `--out` dir; every PNG decodes
     to its table size and is square (except `brand-mark.png`); `icon.png` corner pixel is opaque white; a favicon
     running variant has `#3b82f6` at the dot center; desktop `icon.png` corner pixel is transparent and its center-edge (x=50%, y=12%) is opaque white; ICO header lists 7 entries with the table sizes; ICNS starts
     with `icns`, total length matches, and holds the 11 types. Append it to the `node --test` list at `.github/workflows/ci.yml:55`.
- [ ] 4. Run `node branding/generate-assets.mjs` and commit every generated file. Run `--check`; it must exit 0.
- [ ] 5. Delete the stale SVGs listed in Context (after the grep).
- [ ] 6. Rewrite `PaseoLogo` body: RN `Image` with `require("../../../assets/images/brand-mark.png")` (relative,
     same style and eslint-disable comment as `use-favicon-status.ts`), `resizeMode="contain"`, size `size`x`size`,
     `tintColor: color ?? <theme foreground>`. Keep the file name, export name and props. Drop `useUnistyles()`: read
     the foreground through a `StyleSheet.create((theme) => ...)` style (the pattern `docs/unistyles.md` recommends)
     and apply `color` as an override style. If that is not trivial, keep the existing call unchanged and add no new one.
- [ ] 7. `packages/app/app.config.js` asset lines only: `android.adaptiveIcon.backgroundColor` `#FFFFFF`;
     splash `dark.image: "./assets/images/splash-icon-dark.png"`; `expo-notifications` `color` `#1461BD`. Nothing else in that file.
- [ ] 8. Add a short `branding/README.md`: what the source marks are, the one command to regenerate, the `--check` flag.
- [ ] 9. `npm run typecheck`, `npm run lint -- <changed files>`, `npm run format:files -- <changed non-binary files>`.

## Verification

- `node --test branding/generate-assets.test.mjs`; `node branding/generate-assets.mjs --check` exits 0.
- `node --test scripts/ci-workflow.test.mjs` (CI workflow contract still holds after the ci.yml edit).
- `sips -g pixelWidth -g pixelHeight` on each generated PNG matches the table; `iconutil -c iconset packages/desktop/assets/icon.icns -o /tmp/zk.iconset` succeeds.
- Visual check: open `icon.png`, `favicon-dark-running.png`, `notification-icon.png` and confirm the mark is centered and uncropped.
- Web: `npm run dev:app` against a dev daemon, confirm the welcome screen shows the tinted mark in light and dark theme.

## Progress

- Status: planned
- Notes:
