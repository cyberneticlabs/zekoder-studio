# Branding

`source/logo-{blue,dark,white}.png` are the Zekoder marks (860x666, 8-bit RGBA). Blue is `#1461BD`, dark `#333333`.

`generate-assets.mjs` builds every raster from them with Node built-ins only: app, splash, notification and favicon images, PWA icons, the F-Droid listing icon, `brand-mark.png` (used by `PaseoLogo`), the desktop PNG set, `icon.ico` and `icon.icns`.

```bash
node branding/generate-assets.mjs          # regenerate all committed files
node branding/generate-assets.mjs --check  # exit non-zero if any committed file's pixels differ
```

`--out <dir>` writes the same tree under another root. Change the sizes or compositions in the output table at the top of the script, then rerun it and commit the results.
