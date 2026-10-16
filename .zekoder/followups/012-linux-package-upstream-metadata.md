---
id: 012-linux-package-upstream-metadata
type: followup
title: Replace upstream maintainer/homepage metadata in Linux and Nix packages
status: planned
createdAt: 2026-10-16
openedAt: 2026-10-16T15:50:17.112Z
updatedAt: 2026-10-16T15:50:17.112Z
origin: zekoder-planner-agent
filedFromTask: null
branch: followup-012-linux-package-upstream-metadata
promoted: false
packages: []
relatedFeatures: []
relatedBugs: []
relatedFollowups: []
resolvedBy: null
statusHistory: []
---
# Followup 012-linux-package-upstream-metadata: Replace upstream maintainer/homepage metadata in Linux and Nix packages

## Summary

Linux deb/rpm and Nix packages of the branded Zekoder desktop still name the upstream Paseo author and the getpaseo homepage; replace with Cybernetic Labs / zekoder.net.

## Why it's out of scope now

Mac/win rebrand (appId `net.zekoder.desktop`, productName, copyright, vendor) shipped first. These Linux/Nix metadata fields were missed and are package-metadata only, with no runtime effect, so they were deferred rather than bundled. Per `plan.md`, upstream internal names and directories stay; only user-visible / package-metadata identity changes.

## Proposed approach

Change metadata strings only. Do not rename `@getpaseo/*` packages, `paseo-desktop` binary/icon names, `bin/paseo`, or any directory.

Confirmed upstream spots:

- `packages/desktop/electron-builder.yml:76` `linux.maintainer: "Mohamed Boudra <hello@moboudra.com>"` goes into deb/rpm metadata. `linux.vendor` is already `Zekoder`.
- `nix/desktop-package.nix:259` `meta.homepage = "https://github.com/getpaseo/paseo"`.
- `nix/package.nix:150` (daemon package) `meta.homepage` also points at getpaseo/paseo. Include if the daemon Nix package is shipped under the Zekoder brand (confirm during implementation; otherwise leave it, it is upstream-internal).
- `packages/desktop/package.json:14` `repository.url` is `https://github.com/getpaseo/paseo.git`. Its `description`, `homepage` (zekoder.net) and `author` (Cybernetic Labs Ltd) are already branded. Decide whether `repository` should stay the upstream-compatible URL (plan.md keeps upstream relationship); default is leave it unless the fork repo URL is known.

Already branded, no change: `appId`, `productName`, `executableName`, `copyright`, deb/rpm `packageName: Zekoder`, `appImage` args, nix `makeDesktopItem` (`desktopName = "Zekoder"`, `startupWMClass = "Zekoder"`), nix `description`.

Sweep found no AppStream/metainfo or checked-in `.desktop` files (`.desktop` comes from electron-builder and nix `makeDesktopItem`). `electron-builder.yml` has no `synopsis`/`description` for deb/rpm, so those fall back to `package.json` description (already Zekoder). No `moboudra`/`Boudra` hits outside line 76 in `nix/`, `flake.nix`, `packages/desktop/scripts`, `packages/desktop/package.json`.

Open questions (put to the user, do not invent):

1. Exact maintainer string/contact for `linux.maintainer`. Owner is Cybernetic Labs; no email is known. Format needed: `"Cybernetic Labs Ltd <email>"`. deb requires an email-style maintainer.
2. License mismatch: `nix/desktop-package.nix:260` says `agpl3Plus`, `packages/desktop/package.json` says `Apache-2.0`, root `LICENSE` carries the upstream copyright. Which is correct for the Zekoder desktop package? Do not change license metadata until the owner answers.
3. Nix `homepage`: `https://zekoder.net` (matches `package.json`) assumed.

## Tasks

- [ ] `packages/desktop/electron-builder.yml:76`: set `linux.maintainer` to the Cybernetic Labs maintainer string from open question 1 (blocked on that answer).
- [ ] `nix/desktop-package.nix:259`: set `meta.homepage` to `https://zekoder.net`. Optionally add `meta.maintainers` only if the user supplies one.
- [ ] `nix/package.nix:150`: same homepage change if the daemon package is Zekoder-branded (see approach).
- [ ] `packages/desktop/src/daemon/desktop-packaging.test.ts` (near line 139, deb/rpm packageName assertions): add assertions that `linux.maintainer` does not contain `moboudra`/`Boudra` and `linux.vendor` is `Zekoder`.

## Verification

- `rg -i "moboudra|Boudra|getpaseo\.(sh|com)|getpaseo/paseo" packages/desktop/electron-builder.yml nix` shows no packaging-metadata hits, except deliberate leftovers (daemon package, `repository.url`) noted in the PR.
- `npx vitest run packages/desktop/src/daemon/desktop-packaging.test.ts --bail=1` passes.
- Linux packaged-app smoke (`packages/desktop/e2e/packaged-app-smoke.js`, Linux CI job) stays green. Build deb/rpm in CI and check `dpkg-deb -I` / `rpm -qpi` show Maintainer/Vendor = Cybernetic Labs / Zekoder.
- `nix eval` of `meta.homepage` for the desktop package returns the Zekoder URL, if Nix is available.
- `npm run typecheck` and `npm run lint` pass.
