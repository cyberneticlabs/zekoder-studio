---
id: 007-unsigned-macos-release-policy
type: feature
title: Unsigned macOS release policy
status: merged
createdAt: 2026-10-13
openedAt: 2026-10-13T10:48:41.159Z
updatedAt: 2026-10-13T12:09:51.284Z
completedAt: 2026-10-13T12:09:51.284Z
branch: feature-007-unsigned-macos-release-policy
promoted: false
dependsOn: []
packages: []
contracts: []
mergeMode: local
commit: 4491b94a38b14a899fd6a0ec49dd14f637764e0b
filesTouched:
  - .github/workflows/desktop-release.yml
  - .zekoder/features/007-unsigned-macos-release-policy.md
  - docs/release.md
  - scripts/ci-workflow.test.mjs
verifiedBaseSha: d3b5b071cf87d3de6ff6982587aa8ed8804eb3d2
relatedFeatures:
  - 003-desktop-gcs-release-pipeline
relatedBugs: []
relatedFollowups:
  - 007-unsigned-macos-update-offer
statusHistory:
  - from: planned
    to: merged
    at: 2026-10-13T12:09:51.284Z
---
# Feature 007-unsigned-macos-release-policy: Unsigned macOS release policy

> **Light-tier plan.** One area (desktop release workflow + its doc), one branch (`feature-007-unsigned-macos-release-policy`), one document.

## User's request (verbatim)

Add an "unsigned" macOS signing policy to the Zekoder desktop release pipeline so a release can ship before the Apple Developer account is approved. When the APPLE_* secrets are absent, the macOS job should declare SIGNING_POLICY=unsigned (mirroring the existing Windows unsigned policy in .github/workflows/desktop-release.yml), pass -c.mac.notarize=false, skip the codesign/stapler/spctl verification step, and record the policy as `unsigned` in provenance (check scripts/desktop-release/release-ci.mjs validation for any hard-coded `notarized` requirement). When the secrets are present, behavior stays signed + notarized as today. Update docs/release.md (signing section) to document the policy, the first-launch Gatekeeper workaround (right-click Open / xattr -dr com.apple.quarantine), and that unsigned macOS builds likely cannot auto-update (Squirrel.Mac needs a signed app; verify how the app updater behaves in that case). Open questions to verify during planning: whether electron-builder ad-hoc signs arm64 builds when no identity is configured and notarize is false, and whether the unsigned macOS builds should go out first as -beta.N. No tag is created or pushed as part of this work; tagging stays behind the user's explicit go-ahead per docs/release.md.

## Refined scope

- Workflow: the macOS leg of `build` gets a three-way policy: all five `APPLE_*` secrets present -> `notarized` (unchanged); none present -> `unsigned`; some but not all -> fail with the missing names (a half-configured account must not silently ship unsigned).
- Docs-only on the updater: document the behavior found in planning, change no app code.
- The all/none/partial rule applies to every channel, stable `vX.Y.Z` included. Beta-first is a documented recommendation enforced by process, not by the workflow.
- `release-ci.mjs` needs no change: `--signing` is an unvalidated string, `provenance.json` just records it, and nothing downstream (`prepare-release.mjs`, `release-data.mjs`) reads it.

## Out of scope

No tag, no workflow dispatch, no release version or channel choice, no secrets. No updater/app code. No replacement verification step for unsigned builds. No KB edit (the desktop-releases KB line about Apple secrets is refreshed after this lands).

## Findings from discovery (verified in code, `electron-builder` 26.8.1 / `electron-updater` 6.8.3)

- **arm64 ad-hoc**: yes, in `app-builder-lib/out/macPackager.js` `sign()`. With no identity found (empty `CSC_LINK`, no keychain identity) and `identity` not `null`, arm64 falls back to an ad-hoc signature. x64 does not: it logs "skipped macOS application code signing" and ships unsigned. Never pass `-c.mac.identity=null`: it skips signing on arm64 too, and an unsigned arm64 app will not launch.
- **Empty env is fine**: `CSC_LINK=""` is accepted ("allow to specify as empty string"); with `APPLE_ID` etc. empty, `getNotarizeOptions` returns nothing, so builder would already skip notarization. `-c.mac.notarize=false` makes that explicit. CLI strings are coerced to booleans by builder's config validation (checked by running `validateConfiguration`).
- **Hardened runtime**: `electron-builder.yml` sets `hardenedRuntime: true`. It exists for notarization and, with an ad-hoc signature (no Team ID), library validation can reject the Electron Framework at launch. The plan passes `-c.mac.hardenedRuntime=false` on the unsigned leg. Unverified on hardware: the arm64 row's packaged smoke (`after-sign.js`, native macos-14) is the check.
- **Updater**: the catalog check is signature-agnostic, so an unsigned build is offered updates (`hasUpdate: true`). `electron-updater`'s `MacUpdater` then hands the downloaded zip to Squirrel.Mac (`nativeUpdater.checkForUpdates`), which validates signatures and errors for an unsigned or ad-hoc app. `app-update-service.ts` catches that and returns `Update failed: <message>`, logging via `reportInstallError`. Nothing crashes, but the app advertises an update it cannot install. Filed as followup 007-unsigned-macos-update-offer; this feature changes no updater code.
- **Beta first**: recommended. A beta tag admits instantly and leaves the stable pointer alone, so stable users are not offered a build that cannot self-update. Caveat to document: the beta pointer later moves to the first signed stable, and unsigned -> signed is also a manual reinstall (Squirrel checks the new signature against the running app's).

## Approach

Reuse the Windows unsigned pattern in the same `Declare signing policy` step; pass flags through one env var instead of duplicating the build step.

## Tasks

- [x] `.github/workflows/desktop-release.yml`, `Declare signing policy and require owned identities` `darwin` case: count present `HAS_APPLE_*`; 5 -> `SIGNING_POLICY=notarized`; 0 -> `SIGNING_POLICY=unsigned`, `echo "BUILDER_SIGNING_FLAGS=-c.mac.notarize=false -c.mac.hardenedRuntime=false" >> "$GITHUB_ENV"` and a `::notice::` like Windows'; otherwise `::error::` listing the missing secrets and `exit 1`. Replace the "always signed and notarized" comment.
- [x] Same file, `Build and smoke desktop release` run block: `-c.publish.channel=...` is currently the last line of the command with no trailing `\`: add the backslash to that line, then append `${BUILDER_SIGNING_FLAGS:-}` on a new line (deliberately unquoted so it splits into flags; comment why). Leave the `env:` block alone.
- [x] Same file, `Verify macOS signature and notarization`: change the condition to `matrix.platform == 'darwin' && env.SIGNING_POLICY == 'notarized'`.
- [x] `scripts/ci-workflow.test.mjs`: one test next to the existing desktop-release tests. Scope the policy assertions to the `darwin)` case (regex from `darwin)` to `;;`) so the Windows branch's own `SIGNING_POLICY=unsigned` cannot satisfy them: it must contain `SIGNING_POLICY=unsigned`, `-c.mac.notarize=false` and `-c.mac.hardenedRuntime=false`. Also assert the build command appends `BUILDER_SIGNING_FLAGS` and the macOS verify step is gated on `SIGNING_POLICY == 'notarized'`.
- [x] `docs/release.md`, rewriting in place (integrate, do not append): the opening sentence's "signs"; the `build` bullet in "What the workflow does" (macOS signature checks apply when notarized); the macOS bullet under the credentials table (replace "fail before building when a secret is missing" with the all/none/partial rule and the arm64 ad-hoc / x64 unsigned result); the completion checklist macOS line (evidence depends on policy; provenance names `unsigned` or `notarized`); the "signed and notarized installers" phrase in rollback. Define provenance `unsigned` as "no Developer ID signature and not notarized", so it does not contradict the arm64 ad-hoc signature builder adds. State that the all/none/partial rule applies to every channel, stable included, and that beta-first is process, not enforced by the workflow. Add an "Unsigned macOS builds" subsection after the credentials list: first launch (macOS 15+: Open Anyway in System Settings > Privacy & Security; earlier: Control-click > Open; either: `xattr -dr com.apple.quarantine /Applications/Zekoder.app`), the updater behavior above, manual reinstall to reach a signed build, and the beta-first recommendation. Doc voice per CLAUDE.md.
- [x] Run the Verification commands; fix anything they report.

## Verification

- `node --test scripts/ci-workflow.test.mjs scripts/desktop-release/release-ci.test.mjs` (both register in CI's "Validate CI contracts" step).
- `npm run format:files -- docs/release.md .github/workflows/desktop-release.yml scripts/ci-workflow.test.mjs`, then `npm run lint -- scripts/ci-workflow.test.mjs`, then `npm run typecheck`.
- Read the workflow diff once: the notarized path must be byte-for-byte the same behavior as today when all five secrets exist.
- The real proof is a tag run with no Apple secrets (user-gated; this work creates no tag): all five builds green, macOS provenance `signing: "unsigned"`, no `codesign`/`stapler`/`spctl` step run.
