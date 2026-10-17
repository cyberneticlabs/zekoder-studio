---
id: 014-fork-license-decision
type: followup
title: Decide the Zekoder fork's proprietary licence and Apache-2.0 compliance
status: planned
createdAt: 2026-10-17
openedAt: 2026-10-17T09:42:36.442Z
updatedAt: 2026-10-17T09:43:58.083Z
origin: zekoder-planner-agent
filedFromTask: null
branch: followup-014-fork-license-decision
promoted: false
packages: []
relatedFeatures: []
relatedBugs: []
relatedFollowups:
  - 012-linux-package-upstream-metadata
resolvedBy: null
statusHistory: []
---
# Fork licence decision: proprietary Zekoder Studio on an Apache-2.0 upstream

## Summary

Decide how Zekoder Studio (Cybernetic Labs Ltd, help@zekoder.com) is licensed, and what Apache-2.0, MIT and third-party obligations constrain that choice. Decision record to be finalised later; not legal advice, a lawyer must confirm before anything ships.

## Why it's out of scope now

The fork ships under inherited upstream licence text while the owner plans a proprietary licence. Changing it needs a legal review, a public-repo visibility call, and a dependency audit first. None of that blocks current feature work. Related: 012-linux-package-upstream-metadata (packaging metadata carries licence fields too).

## Inventory of current licence statements

Upstream history (`git log --follow LICENSE`): `ea5c94a51` 2026-02-05 added MIT; `c4523c70b` 2026-02-25 (touched LICENSE, content unconfirmed); `a8734a972` 2026-08-27 "Update project licensing (#3944)" moved to Apache-2.0 (also edited README*, docs/architecture.md, docs/product.md, package.json). So upstream code from 2026-02-05 up to 2026-08-27 was MIT-licensed when received; later code is Apache-2.0. Check which fork base commit predates 2026-08-27, since MIT-era code keeps its MIT notice (permission notice must stay in copies or substantial portions).

| Place | Statement |
| --- | --- |
| `LICENSE:1-10` | "Copyright (c) 2025-present Mohamed Boudra"; third-party components keep own licences, rest Apache-2.0 (full text follows) |
| `package.json` (root), `packages/desktop/package.json:7` | `Apache-2.0` |
| `packages/expo-two-way-audio/package.json`, its `LICENSE` | MIT, Cantab Research Ltd. 2023 (vendored third party) |
| `plugin-examples/modal-ui/package.json`, its `LICENSE` | Apache-2.0 |
| `packages/highlight/src/astro/LICENSE` | MIT, Zulfazli (Fazelllyyy) 2026 (vendored third party) |
| `packages/{app,cli,client,docs,highlight,plugin,protocol,relay,server,website}/package.json`, `plugins/zekoder/package.json` | NO `license` field |
| `README.md:230-232` (also `README.ja.md`, `README.ko.md`, `README.zh-CN.md:220`) | "## License / Apache-2.0" |
| `packages/website/src/content/alternatives/*.md` | Marketing comparison tables state "Open source (Apache-2.0)" for Paseo (e.g. `conductor.md:84`); wrong or misleading if proprietary |
| `packages/desktop/electron-builder.yml:13` | `copyright: "Copyright (c) 2024-2026 Cybernetic Labs Ltd ..."`; nsis block (~line 118) has no `license` key, so installers show no EULA |
| `packages/app/src/screens/settings-screen.tsx:~509-535` | `ForkCreditRow` links to github.com/getpaseo/paseo (credit only, not a licence notice) |
| `nix/package.nix:151`, `nix/desktop-package.nix:260` | `lib.licenses.agpl3Plus`; introduced by `bb560809c` (Nix support, #130) and `0759932da` (#923), both upstream commits. Stale upstream metadata, contradicts Apache-2.0 |
| NOTICE file | None in repo (no `NOTICE*` found). Confirm upstream has none, so Apache §4d is not triggered today |
| SPDX headers in source | None found in a quick grep (confirm) |
| Third-party notices in desktop build | None bundled: `electron-builder.yml` has no licence or THIRD_PARTY extraResource |
| Published npm packages | `@getpaseo/*` (cli, server, protocol, client, highlight, relay, plugin) have `publishConfig` but no `license` field; fork plugin `plugins/zekoder/package.json` is `private: true` here, yet the brief says it is published as `@cyberneticlabs/paseo-zekoder`, so confirm where that publish manifest lives |
| Repo | `origin` = `cyberneticlabs/zekoder-studio`, PUBLIC; `upstream` = `getpaseo/paseo` |

Dependency licences from `package-lock.json` (all workspaces, incl. dev): MIT 3320, ISC 211, Apache-2.0 125, BSD, BlueOak, plus these needing review:
- LGPL-3.0-or-later: `@img/sharp-libvips-*` (prebuilt libvips for sharp; non-dev). Dynamic/replaceable linking is usually fine but needs LGPL notice and a way to relink; check whether sharp is actually bundled into any shipped binary.
- MPL-2.0: `lightningcss*` (via tailwind/fontless, build tooling, likely not shipped). `dompurify` is `MPL-2.0 OR Apache-2.0`: choose Apache.
- `(BSD-3-Clause OR GPL-2.0)` node-forge: choose BSD. `jszip` `(MIT OR GPL-3.0-or-later)`: choose MIT.
- BUSL-1.1: `@expo/logger`, `@expo/steps` (dev only, EAS build tooling; not shipped, check usage terms).
- `SEE LICENSE IN ...`: `@anthropic-ai/claude-agent-sdk` and platform binaries. This is Anthropic's proprietary commercial terms, NOT open source. Redistribution inside a bundled product must be checked against Anthropic terms. Highest-risk item.
- `None`/missing: `khroma`, `tosource`, `requireg`, `vaul-vue`, `xmlhttprequest-ssl`, `react-native-uitextview`, `@cyberneticlabs/zekoder-docs`, and others; the lock field is empty, so read each package's own file.
- No AGPL/GPL-only runtime dependency seen in the lock field (rough check only, not a substitute for the tool in decision 3).

## Decisions to make

1. Licence of fork-owned code (plugins/zekoder, branding, fork modules):
   - Proprietary EULA: full control; fork-only files carry it, upstream files stay Apache. Cannot relicense upstream code itself, only add terms to your own contributions and the combined product.
   - Source-available (BSL, Elastic, custom): visible source, restricted use. Incompatible with the "open source" wording in docs and marketing.
   - Keep Apache-2.0 for parts (e.g. plugin SDK, examples) and proprietary for others: simplest for contributors, needs a per-directory licence map.
2. Licence of the combined distributed product (desktop/mobile binaries). Apache-2.0 permits proprietary derivative works if you:
   - ship a copy of Apache-2.0 (§4a);
   - keep upstream copyright, patent, trademark and attribution notices in source forms (§4c);
   - mark modified files with prominent change notices (§4b); decide a policy (header on touched upstream files, or a documented CHANGES list);
   - carry any upstream NOTICE text (§4d); none found, verify at the fork base;
   - make no use of the "Paseo" name or marks beyond describing origin (§6); audit remaining "Paseo" strings in UI, package names (`@getpaseo/*`), CLI binary `paseo`, URLs;
   - accept the patent termination clause (§3) if you sue over the work's patents;
   - keep the MIT notice for MIT-era upstream code and each dependency's own notice (MIT/BSD/ISC require it in binary distributions too).
   Also the mobile store terms: store distribution of Apache/LGPL code is fine, GPL is the usual blocker.
3. Third-party dependency audit. Propose `npx license-checker --production --summary` (or `license-checker-rseidelsohn` / `licensee`) per shipped workspace (desktop, server, app, cli, plugin) with `--failOn` for `GPL;AGPL;SSPL`, allow-listing reviewed LGPL/MPL. Enforce in CI as a job on the existing workflow, and generate a `THIRD_PARTY_LICENSES` file for the desktop build via electron-builder `extraResources`. Resolve the Anthropic SDK terms and the `None` packages manually.
4. Repo visibility. Public repo with proprietary licence is contradictory: public means source visible, and GitHub ToS lets viewers fork. Options: make repo private, or keep public with an explicit source-available licence. Copies of already-published commits stay Apache-2.0 for anyone who obtained them; relicensing is not retroactive. Decide before adding any proprietary LICENSE to the public tree.
5. Keeping upstream syncs clean: leave upstream `LICENSE` untouched (merge conflicts avoided); add fork-owned `LICENSE-ZEKODER` (or `EULA.md`) and a `NOTICE` crediting Paseo (Mohamed Boudra, Apache-2.0, getpaseo/paseo); add a per-directory licence map in README. Decide `license` values: fork-only packages `UNLICENSED` or `SEE LICENSE IN LICENSE-ZEKODER`; packages that are mostly upstream stay `Apache-2.0`; add the missing fields. Do not publish proprietary code to the public npm registry under `@getpaseo/*`.
6. Nix `agpl3Plus` mismatch: fix either way. If proprietary, set `lib.licenses.unfree` (needs `allowUnfree` for users) for the fork packages; if Apache stays, use `lib.licenses.asl20`. Sync with 012-linux-package-upstream-metadata.

## Tasks (blocked on the decisions above)

- Legal: lawyer reviews inventory, decisions 1, 2, 4 and the Anthropic SDK redistribution terms.
- Add `LICENSE-ZEKODER` (or EULA) and `NOTICE` at repo root; leave `LICENSE` as is.
- Edit `package.json` (root), `packages/desktop/package.json:7`, and add `license` to `packages/{app,cli,client,docs,highlight,plugin,protocol,relay,server,website}/package.json` and `plugins/zekoder/package.json`.
- Edit `README.md:230` and `README.ja.md`, `README.ko.md`, `README.zh-CN.md:220` to match the chosen licence and visibility.
- Edit `packages/website/src/content/alternatives/*.md` licence table rows and "open source" wording.
- Edit `nix/package.nix:151` and `nix/desktop-package.nix:260`.
- Edit `packages/desktop/electron-builder.yml` (nsis `license`, dmg licence, extraResources for third-party notices); keep `ForkCreditRow` in `packages/app/src/screens/settings-screen.tsx` and add an in-app licences screen if needed.
- Add `license-checker` script and CI job; generate `THIRD_PARTY_LICENSES` in the desktop build.
- Rename or remove remaining "Paseo" trademark uses per decision 2 (separate followup if large).
- Flip GitHub repo visibility if chosen.

## Verification

- Lawyer sign-off recorded (link or note in this doc).
- `rg -n "agpl3Plus"` returns nothing; every workspace `package.json` has a `license` value; README and website match.
- CI licence job green with the allow-list; `THIRD_PARTY_LICENSES` present in a built desktop artifact.
- Built installer shows the chosen licence/EULA; upstream `LICENSE` byte-identical to upstream at the fork base.

Confirmed 2026-10-17: upstream `main` has no NOTICE file at its root. The fork tracks upstream past the 2026-08-27 Apache-2.0 switch (`a8734a972` is an ancestor of the synced upstream), so inherited upstream code is under Apache-2.0. `@cyberneticlabs/paseo-zekoder` is not published from this repo yet; followup `010-publish-paseo-zekoder-to-npm` owns that, and its `license` field must follow this decision.
