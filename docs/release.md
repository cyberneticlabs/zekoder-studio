# Release

This repository has two release processes. **Zekoder desktop releases** (next section) are the only
release process agents run here. Everything after [Upstream Paseo release flow](#upstream-paseo-release-flow)
is the inherited upstream process (npm, Docker, mobile, GitHub-hosted desktop assets). It is kept so
upstream syncs merge cleanly and does not apply to Zekoder desktop.

## Zekoder desktop releases

Pushing an annotated version tag builds, smokes and publishes the Zekoder desktop apps to
`gs://zekoder-releases/desktop/releases/`. The tag is the version: `v0.1.0` packages Zekoder `0.1.0`,
independent of the upstream workspace version in `package.json`.

| Tag             | Channel | Who receives it                                      |
| --------------- | ------- | ---------------------------------------------------- |
| `vX.Y.Z`        | stable  | stable and beta users                                |
| `vX.Y.Z-beta.N` | beta    | beta users, until a newer final stable supersedes it |

Only these two shapes are valid (no leading zeros, other prefixes, other prereleases or build
metadata). The workflow rejects anything else before building.

- Only a version-tag push starts distribution. Branch pushes, manual dispatch and GitHub Release
  events never build.
- The workflow checks out the exact tagged commit. Nothing runs `npm version` or any `release:*`
  or `version:all:*` script, and nothing is published to npm, Docker, the stores or GitHub assets.
- Targets: macOS arm64 and x64 (DMG + ZIP), Windows x64 and arm64 (NSIS + ZIP), Linux x64
  (AppImage, deb, rpm, tar.gz). The Linux AppImage keeps the `Zekoder-x86_64.AppImage` name so updates
  overwrite it in place.
- All five targets must build and pass their packaged smoke before anything is published. A catalog
  pointer never moves if any target or the notes fail validation.

### Agent-only tagging

Only agents create and push release tags, and only after an explicit go-ahead from the user. A request
to "prepare a release" or invoking a release skill is not that go-ahead.

**Preparation** (agent, reversible, no remote writes except the draft):

1. Resolve the release source (default `origin/main`) to one commit. Confirm its CI is green and
   `npm run format`, `npm run lint` and `npm run typecheck` pass on it.
2. Choose the tag with the user: `vX.Y.Z` or `vX.Y.Z-beta.N`. Agents never choose a major version, and
   never bump a version to retry a failed run.
3. Check that the repository variables and secrets below are configured.
4. Create the GitHub Release as a **draft** for that tag with high-level notes, a `--prerelease`
   flag that matches the channel (beta only), and show the notes to the user for review:

   ```bash
   gh release create vX.Y.Z --repo cyberneticlabs/zekoder-studio --draft \
     --target "$SOURCE_SHA" --title "Zekoder X.Y.Z" --notes-file notes.md   # add --prerelease for beta
   ```

**Go-ahead** (user says go ahead):

```bash
git tag -a vX.Y.Z "$SOURCE_SHA" -m "Zekoder X.Y.Z"
git push origin vX.Y.Z
```

Then watch the run to completion and apply the completion checklist below.

Rules:

- Tags are annotated and immutable. The tagger date becomes the release's `publishedAt` and the start
  of the stable rollout clock, so a rerun reproduces identical feeds.
- Never use `npm run release:*` or `version:all:*`, force-push or move a tag, push a retry tag, or
  dispatch the workflow. None of them apply to Zekoder desktop.
- Last-minute source changes need user approval and a new reviewed commit; they never go into a tag
  after the go-ahead.

### Release notes

The draft's body is the product notes. The pipeline copies it byte for byte to
`release-notes.md` in the snapshot, stamps it into each updater feed for the existing update UI, and
links it from the catalog. It must exist and be nonempty before the tag is pushed.

Write what a user would notice: new features, updates to existing features, and broad bug categories
such as security or performance fixes. Never paste commit lists, hashes, PR numbers or
conventional-commit bullets; the pipeline rejects those and GitHub's generated "What's changed" text.

### What the workflow does

`.github/workflows/desktop-release.yml` documents each job in its header. In short:

1. `preflight` validates the tag, resolves the upstream Paseo commit (second parent of the latest
   `chore(sync): merge upstream paseo` merge) and the pinned plugin lock, and skips straight to
   finalization when the catalog already lists the tag.
2. `release-notes` copies the draft into an artifact. It is the only job that reads the private draft.
3. `build` runs the five targets in parallel with `--publish never` and uploads each target's files and
   a provenance record as Actions artifacts. It verifies the packaged app version, and on a notarized
   macOS build the signature, team identifier, notarization ticket and Gatekeeper assessment.
4. `publish` is the only job with cloud identity (GitHub OIDC, no keys). It re-checks that the tag still
   resolves to the built commit, prepares the immutable snapshot with `scripts/desktop-release/prepare-release.mjs`
   and uploads it with `scripts/desktop-release/publish-release.mjs`: missing objects with
   `generation=0`, byte-identical objects reused, anything different aborts, every object read back,
   and `manifest.json` updated last by compare-and-swap.
5. `finalize` (the only job that can write GitHub Releases) turns the draft into the visible release
   after the catalog lists the tag. It is safe to rerun.

### Storage and channels

- Catalog: `https://storage.googleapis.com/zekoder-releases/desktop/releases/manifest.json`
  (`Cache-Control: max-age=60`). A missing catalog means no update is offered.
- Snapshot: `desktop/releases/<tag>/<platform>/<arch>/` holds the installers, blockmaps and feeds, and
  `desktop/releases/<tag>/release-notes.md` holds the notes. Objects are immutable and cached for a year.
- The stable pointer only moves to stable tags. The beta pointer moves to the highest stable or beta tag,
  so beta users receive the final stable. Pointers never move backward, whatever order tags publish in.
- Stable releases ramp for 36 hours from `publishedAt` for automatic checks; manual checks and betas
  admit immediately. The ramp is fixed in the published feeds. There is no rollout re-stamp: the old
  `desktop-rollout.yml` workflow is retired for this repository.
- `scripts/desktop-release/release-data.mjs` owns the catalog schema and pointer-selection rules.

### Credentials and configuration

| Name                                                    | Kind     | Purpose                                                                |
| ------------------------------------------------------- | -------- | ---------------------------------------------------------------------- |
| `ZEKODER_RELEASE_BUCKET`                                | variable | `zekoder-releases`                                                     |
| `GCP_WORKLOAD_IDENTITY_PROVIDER`, `GCP_SERVICE_ACCOUNT` | variable | Dedicated desktop OIDC identity, writes limited to `desktop/releases/` |
| `APPLE_CERTIFICATE`, `APPLE_CERTIFICATE_PASSWORD`       | secret   | Fork-owned Developer ID certificate (base64 `.p12`)                    |
| `APPLE_ID`, `APPLE_PASSWORD`, `APPLE_TEAM_ID`           | secret   | Notarization (app-specific password)                                   |
| `WINDOWS_CSC_LINK`, `WINDOWS_CSC_KEY_PASSWORD`          | secret   | Optional fork-owned Windows code-signing certificate                   |

- **macOS signing is all or nothing.** With all five `APPLE_*` secrets the build is signed and
  notarized (provenance `notarized`) and fails after building unless the app is signed by
  `APPLE_TEAM_ID`, stapled and accepted by Gatekeeper. With none it ships unsigned (provenance
  `unsigned`, meaning no Developer ID signature and not notarized) and skips those checks. With some
  but not all, the build fails before building and names the missing secrets, so a half-configured
  Apple account cannot silently ship unsigned. The rule applies to every channel, stable included.
  Shipping betas first is process, not something the workflow enforces.
  Unsigned builds differ by architecture: electron-builder ad-hoc signs arm64 (the app will not launch
  otherwise) and leaves x64 unsigned. The workflow also turns off hardened runtime for unsigned
  builds, because library validation rejects the Electron Framework under an ad-hoc signature. Never
  set `-c.mac.identity=null`: it skips the arm64 ad-hoc signature and the app will not launch.
- **Windows installers are unsigned** unless `WINDOWS_CSC_LINK` is set, matching the previous release
  behavior. Users see a Microsoft SmartScreen warning on first run of an unsigned installer. With the
  certificate configured, the build fails unless the installer's Authenticode status is `Valid`. The
  run's provenance record names the policy (`unsigned` or `signed`) for each Windows target.
- The Windows arm64 installer is cross-built on an x64 runner, so its packaged smoke is skipped by
  `after-pack.js`; the packaged version check still runs.
- Never commit certificates, passwords or tokens, and never create service account key files.

### Unsigned macOS builds

Ship these before the Apple Developer account is approved, as `-beta.N` first. A beta admits
immediately and leaves the stable pointer alone, so stable users are not offered a build that cannot
update itself. The beta pointer later moves to the first signed stable.

- **First launch.** Gatekeeper blocks the app. On macOS 15 and later, open System Settings > Privacy &
  Security and choose Open Anyway. On earlier versions, Control-click the app and choose Open. On
  either, `xattr -dr com.apple.quarantine /Applications/Zekoder.app` clears the quarantine flag.
- **Updates do not install, so the app does not try.** The catalog check ignores signatures, but
  Squirrel.Mac rejects an unsigned or ad-hoc app. On darwin the desktop app runs `codesign -dv` on its
  own bundle once per launch (`detectUnsignedMacApp` in `packages/desktop/src/features/auto-updater.ts`).
  A bundle that is not signed at all, has `Signature=adhoc`, or has no Team ID is treated as unsigned:
  the check still reports the new version, with an `errorMessage` telling the user to download and
  reinstall manually, and it neither downloads nor installs. The updater UI shows that message as an
  error. A failed probe counts as signed, so a normal build never loses its updates to a probe fault.
- **Reaching a signed build is a manual reinstall.** Squirrel compares the new signature with the
  running app's, so unsigned to signed fails the same way. Give users the signed installer from the
  tag's snapshot.

### Completion checklist

- [ ] The run for the tag shows all five `build` jobs, `publish` and `finalize` green.
- [ ] The catalog lists the tag with all five targets; fetch a feed and one installer per target and
      compare SHA-256 and size with the catalog.
- [ ] The expected pointer moved: `channels.beta` for a beta, both channels for a final stable that is
      newest; the other pointer is unchanged when it is already newer.
- [ ] `releaseNotesUrl` resolves and matches the draft's body.
- [ ] The GitHub Release is visible, with `prerelease` matching the channel.
- [ ] macOS evidence matches the policy. Notarized: `codesign`, `TeamIdentifier`, `stapler validate`,
      `spctl` in the run log. Unsigned: no such step ran and the `::notice::` line is present. Either
      way each macOS provenance record names `notarized` or `unsigned`. Windows policy line (`unsigned`
      or `signed`) in each Windows provenance record.
- [ ] Each packaged version equals the tag version without the `v`.

### Failures and recovery

- Rerun failed jobs on the same run (`gh run rerun <run-id> --failed`). The same commit is built, the
  stored Actions artifacts are reused, and the publisher reuses byte-identical GCS objects. Do not
  choose "re-run all jobs" after a partial publish: a rebuild produces different signed bytes and the
  publisher aborts rather than overwrite a stored object.
- A run that cannot finish (for example the workflow file itself is wrong) leaves the draft hidden and
  the catalog untouched. Fix the source, review it, and release the next version; the abandoned tag
  stays unpublished and is never reused.
- A failed `finalize` is retried alone; the catalog already lists the tag.

### Retained binaries and rollback

Every published snapshot is retained unchanged in the bucket, including every installer. To roll a
user back by hand, give them the older installer from the tag's snapshot (the catalog lists every
URL). Do not change the updater's no-downgrade policy: a user on a bad release moves forward when a
higher version ships, so the fix for a bad release is a new patch version.

### macOS system floor

The desktop app requires macOS 13 or newer. Keep both release guards when the floor changes:

- `packages/desktop/electron-builder.yml` writes the macOS version to `LSMinimumSystemVersion` for new installs.
- `scripts/merge-mac-manifest.mjs` holds the matching Darwin kernel version, which `prepare-release.mjs` writes to `minimumSystemVersion` in every macOS feed. Existing clients check this before downloading an update.

macOS 13 maps to Darwin 22. The two values use different version domains; do not copy the macOS version into the update manifest.

### Rollout limits

- **No pause / kill switch.** To stop new admissions, ship a superseding release. Clients revalidate on quit and will not install the superseded download, but a client that already completed installation cannot be recalled; ship a hotfix `+1` patch.
- **No automatic rollback.** `allowDowngrade = false`. Bad release = ship a hotfix.
- **Bootstrap caveat.** Clients running a build older than the rollout feature ignore `rolloutHours` and admit immediately. Rollout protection only applies to clients running the rollout-aware version or later.
- **Up to ~30 min automatic admission latency.** Renderer polls every 30 minutes, so a stable user may take up to that long to be evaluated against the rollout window. Clicking **Check** is manual and bypasses rollout admission.

### Local packaging

```bash
npm run build:desktop -- --publish never --mac --arm64     # macOS host
npm run build:desktop -- --publish never --win --x64       # Windows host (or --arm64)
npm run build:desktop -- --publish never --linux --x64     # Linux host
```

Local packaging never publishes. Only the tag workflow does.

## Upstream Paseo release flow

Everything below is inherited from upstream Paseo. Agents do not use it for Zekoder desktop releases,
and the upstream workflows named below no longer publish from this repository (their publishing jobs
run only in `getpaseo/paseo`).

All upstream workspaces share one version and release together.

## Two steps

A release has exactly two steps. The agent does the first, the user authorizes the second.

**Preparation** (local, reversible — agent does this):

- format, lint, typecheck all green
- resolve the release source to one commit and confirm that commit's existing CI is green
- classify the diff from the previous stable to the release source as patch or minor, then show the
  target version and rationale to the user
- draft the changelog, show it to the user, wait for review
- run the pre-release sanity check, surface findings to the user

**Go-ahead** (user says "go ahead"):

- commit the approved release inputs locally
- run the release, which publishes npm and pushes the prepared branch and tag
- create the release heartbeat immediately and babysit it to completion

Rules that apply to both steps:

- Last-minute changes always need approval. Every time.
- No code changes bundled into the changelog commit or the release commit. Code shims live in their own commit, reviewed on their own merits.
- A sanity-check finding is information, not a directive. The agent surfaces it; the user decides.
- Invoking a release skill is intent to start the flow, not blanket authorization to publish.
- If the user asks for a release preview, show the prospective changelog/release contents and answer questions, but do not commit, tag, publish, or run release commands until they explicitly authorize the release.

## Release source and CI

The default release source is `origin/main`. Fetch `origin`, then record the
resolved commit. The default release checkout is a clean local `main` whose
`HEAD` equals `origin/main`.

An explicit user instruction can select another ref, such as a hotfix commit or
tag. Resolve that ref once and apply every source, diff, and CI check to that
commit instead of `origin/main`.

Before making release-preparation commits, confirm the existing CI run for the
resolved commit is green. Pending CI is watched to completion. Release
preparation then stays local through the changelog, any explicitly requested ACP
catalog update, lockfile preparation, and the version commit. After approval,
commit the prepared inputs locally and run the release command. Its branch and
tag push is the one remote release batch and starts CI for the complete release
commit.

## Release branch discipline

While you finalize a release on `main`, use a temporary `next` branch for work intended for the following
release. This applies to both beta and stable releases.

- Create each new `next` from freshly fetched `origin/main`. Reuse it while active.
- "This goes to next" means create the PR against `next` or retarget an existing
  PR, and keep that destination through delivery.
- Keep `next` current by merging `origin/main` into it as release fixes land.
  Avoid rebasing this shared branch because agents and open PRs depend on its history.
- After the release ships, bring `next` up to date and open a `next` → `main` PR.
  Pass CI and merge without squashing away the individual PR commits needed for
  the changelog. Retarget remaining PRs based on `next` to `main` and delete the integrated
  `next`. Create it fresh when needed again.

**Setup still needed:** CI, Docker, and Nix PR checks currently target only `main`,
and GitHub permits only squash merges. Enable checks and required-check protection
for `next`, CI on its pushes, and merge commits for the integration PR. Handle PR
base changes (`edited` events) so retargeting runs checks against the new base;
GitHub's default PR events do not cover this. Deployment triggers stay unchanged.

### Hotfix from a release tag

If `main` contains changes you do not want to release, branch from the affected
release tag and cherry-pick only the required fixes. Run CI on that branch, then
use the normal release flow with it as the explicit source, choosing a new patch
or beta version. Ensure the fixes and changelog also reach `main` and any active
`next`, preserving newer development and version changes there. This is a
short-lived hotfix branch, not another maintained release track.

## ACP catalog updates

ACP catalog work enters a release through an explicit user request:

- **Check ACP drift** — run `npm run acp:version-drift:check`. When drift exists,
  run `npm run acp:version-drift:update`, verify the catalog, and include the
  update in the local release-preparation commits.
- **Update ACP** — run `npm run acp:version-drift:update`, verify the catalog, and
  include the update in the local release-preparation commits.

The release authorization covers the requested ACP commit. It ships in the same
release push as the changelog and version commit.

## Two paths

There are two supported release paths:

1. **Direct stable release**: you are ready to ship the resolved release source to everyone immediately (default `origin/main`).
2. **Beta flow**: release candidates on the `beta` channel. Each beta folds into the series' single changelog entry, publishes npm only on the explicit `beta` dist-tag, and stays behind the Stable/Beta switch on `/download`.

Paseo has one linear release track even though npm dist-tags are independent
pointers. The npm invariant is:

- A beta release moves only `beta`; `latest` remains on the newest stable.
- A stable release moves both `latest` and `beta` to that stable version. This
  keeps users who install `@getpaseo/cli@beta` on the newest Paseo release after
  a beta is promoted or superseded by a direct stable release.

## Release version decision

Every fresh release starts by classifying the full diff from the previous
stable to the resolved release source. The highest-impact change determines the
version:

- **Minor** — a user would experience the release as a significant upgrade. This
  includes substantial new workflows, providers, forges, platforms, integrations,
  or meaningful expansions of existing capabilities. Foundational internal work
  also qualifies when it materially changes reliability, performance,
  compatibility, deployment, or operation; diff size alone does not.
- **Patch** — fixes, polish, small enhancements, and reliability or performance
  improvements within existing capabilities. Follow-up corrections to a minor
  release are patches.

The release agent selects patch or minor during preparation and presents the
target version with the changelog for approval. Agents never select a major
version autonomously. A major release requires an explicit user instruction and
approval; Paseo remains on major version zero until that deliberate decision.

Version bumps are never used to retry a failed build. Retry the existing version
as described in **Fixing a failed release build**.

## Standard release (stable)

Before running any stable release command:

- Make sure the resolved release source passed CI, the approved release inputs are committed locally on the intended branch, and the working tree is clean.
- **Run `npm run format`, `npm run lint`, and `npm run typecheck` and commit any resulting changes BEFORE you start any `release:*` command.** `release:check` runs `npm install --workspaces --include-workspace-root` as part of `release:prepare`, which can mutate `package-lock.json` (e.g. churning `"dev": true` markers on optional deps). The next step, `version:all:*`, runs `npm version` which aborts when the working tree is dirty. If this happens mid-flight you have to commit the lockfile churn before retrying — and the pre-commit format hook will reject a lockfile-only commit because oxfmt internally skips `package-lock.json` while lefthook's glob still matches it. Avoid the whole mess by running format/lint/typecheck first, then `release:prepare` once on its own to absorb any lockfile churn into a normal commit, then start the release.
- Do not use a release command as a substitute for checking whether the current commit is actually ready.

```bash
# Run exactly one, matching the approved decision:
npm run release:patch
npm run release:minor
```

This bumps the version across all workspaces, runs checks, publishes to npm, and pushes the branch + tag. The tag push triggers `Android APK Release`, `Docker`, and `Release Notes Sync` on GitHub Actions in the upstream repository; the workflows create the GitHub Release as a draft while builds and release-note sync run. EAS picks up the same tag via the EAS GitHub app and starts the iOS + Android store builds in parallel (see "Mobile builds (EAS)" below) — there is no mobile-release workflow under `.github/workflows`.

After the stable release succeeds, move npm's `beta` pointer to the new stable
version for every published package. This changes dist-tags only; do not
republish the packages:

```bash
PASEO_VERSION=$(node -p "require('./package.json').version")
for package in highlight relay protocol client plugin server cli; do
  npm dist-tag add "@getpaseo/$package@$PASEO_VERSION" beta
done
```

Verify both npm tags now resolve to `PASEO_VERSION` before considering the
stable release complete.

The Docker workflow builds images from the checked-out source tree on pull requests and on `main` as non-publishing checks. Stable `vX.Y.Z` tag pushes publish `ghcr.io/getpaseo/paseo:X.Y.Z` and `ghcr.io/getpaseo/paseo:latest`; beta `vX.Y.Z-beta.N` tag pushes publish only `ghcr.io/getpaseo/paseo:X.Y.Z-beta.N` and never move `latest`.

The production relay is the Elixir service in [getpaseo/paseo-relay](https://github.com/getpaseo/paseo-relay), with its own deployment process. Paseo releases and pushes to this repository do not deploy it. The Cloudflare relay code and workflow in this repository are legacy and are not used in production.

**Stable means stable.** If the user says "stable" or "ship stable", do not ask whether they want a beta first. They picked stable; treat it as a direct stable release. Only run the beta flow when the user explicitly says "beta".

## Manual step-by-step

```bash
npm run typecheck            # Verify the exact commit you intend to release
npm run release:check        # Typecheck, build, dry-run pack
# Run exactly one approved version command:
npm run version:all:patch
npm run version:all:minor
npm run release:publish      # Publish to npm
npm run release:push         # Push HEAD + tag (triggers CI workflows)
# Then move npm's beta dist-tag to this stable version using the command above.
```

## Beta flow

```bash
npm run release:beta:patch       # Start the next patch beta line
npm run release:beta:minor       # Start the next minor beta line
# ... test the APK prerelease asset from GitHub Releases ...
npm run release:beta:next        # Optional: cut X.Y.Z-beta.2, beta.3, ...
npm run release:promote          # Promote X.Y.Z-beta.N to stable X.Y.Z
```

- Beta tags are published GitHub prereleases like `v0.1.41-beta.1`
- Betas publish npm packages with `--tag beta`, so `npm install @getpaseo/cli@beta` opts in while plain `npm install @getpaseo/cli` stays on `latest`
- Betas publish APKs for testing. They also build iOS, upload it to TestFlight, add it to the `Paseo Beta` external group, and submit it for Beta App Review. They do not submit mobile builds to the production stores.
- `release:promote` creates a fresh stable tag like `v0.1.41`; the final release never reuses the beta tag
- Require the Linux artifact CI checks with both restricted and usable user namespaces to pass before publication; see [packaged desktop smoke](testing.md#packaged-desktop-smoke). Keep the installed-package and AppImage checks together.
- **A beta series has one changelog entry.** Each beta folds into it and renames its heading to the new `## X.Y.Z-beta.N`, which `Release Notes Sync` mirrors into that prerelease body. Promotion renames it to the stable heading. See the Changelog policy section.

Use the beta path when you need to:

- smoke a build yourself before promoting it to everyone
- test a build manually in a Linux or Windows VM
- send a build to a user who is hitting a specific problem
- iterate on `beta.1`, `beta.2`, `beta.3`, and so on before deciding to ship broadly

## Mobile builds (EAS)

iOS and Android store builds are not in `.github/workflows`. They are triggered by the EAS GitHub app the moment the `v*` tag is pushed:

- **Android (Play Store)** — EAS builds with profile `production` and auto-submits to the Play Store via `eas submit` (EAS-managed credentials, no Fastlane).
- **iOS (TestFlight + App Store)** — EAS builds with profile `production`, uploads to TestFlight, and a Fastlane lane submits the build for App Store review.
- **Android APK (GitHub Release asset)** — separate, via `.github/workflows/android-apk-release.yml`. This is the only Android-related workflow that lives in this repo.

EAS uses the local app version source. `packages/app/app.config.js` derives the native version from the package version. Android `versionCode` is `major * 1_000_000 + minor * 1_000 + patch`. iOS reserves 1,000 build slots per app version: beta `N` uses slot `N`, and stable uses slot `999`. For example, `0.2.6-beta.2` appears in App Store Connect as version `0.2.6` build `2006002`; stable uses build `2006999`. Rebuilding the same tag produces the same native build number; if a store has already accepted a binary and you need a different binary, cut the next beta or patch instead of relying on EAS remote auto-increment.

Beta tags run `Release iOS Beta`. The workflow uploads the build to TestFlight, distributes it to the persistent `Paseo Beta` external group, and submits it for Beta App Review. Testers and the group are managed once in App Store Connect; releases require no dashboard action.

There is no mobile-release workflow under `.github/workflows`. The EAS GitHub app reads the workflows under `packages/app/.eas/workflows` and handles tag triggering directly.

### Watching mobile builds from the terminal

Use the EAS CLI from `packages/app/`:

```bash
cd packages/app

# Recent builds (newest first). Pipe to jq for status only.
npx eas build:list --limit 8 --non-interactive --json | jq '.[] | {platform, status, appVersion, gitCommitHash}'

# Recent EAS workflow runs. This is the source of truth for submit/review jobs.
npx eas workflow:runs --json | jq '.[] | {status, workflowName, trigger, gitCommitHash, startedAt, finishedAt}'

# Filter by platform.
npx eas build:list --platform ios --limit 5 --non-interactive --json
npx eas build:list --platform android --limit 5 --non-interactive --json

# Inspect a specific build.
npx eas build:view <build-id>

# Inspect the full release workflow, including submit_ios, submit_android,
# and submit_ios_for_review.
npx eas workflow:view <workflow-run-id> --json

# Read failed submit/review job logs.
npx eas workflow:logs <workflow-job-id> --all-steps --non-interactive

# Stream logs for a build.
npx eas build:view <build-id> --json | jq '.logFiles[]'
```

A build's `gitCommitHash` must match the release tag commit. `status` walks through `NEW` → `IN_QUEUE` → `IN_PROGRESS` → `FINISHED` (or `ERRORED`/`CANCELED`). The EAS workflow run's `gitCommitHash` and `trigger` must also match the release tag.

Once a build is `FINISHED`, EAS still has release-critical work to do: Android must submit to the Play Store, and iOS must upload to TestFlight **and** submit the build for App Store review. The release is not done until all platforms are on their way through the stores.

For the `Release Mobile` EAS workflow, these jobs must pass:

- `build_ios` — iOS binary built
- `submit_ios` — iOS binary uploaded to App Store Connect/TestFlight
- `submit_ios_for_review` — iOS build submitted for App Store review via Fastlane
- `build_android` — Android store binary built
- `submit_android` — Android binary submitted to the Play Store

Do not treat `build_ios: SUCCESS` or `submit_ios: SUCCESS` as a completed iOS release. `submit_ios_for_review: FAILURE` means the iOS release is blocked even if the build is visible in TestFlight.

To confirm the submission landed, inspect the EAS workflow with `npx eas workflow:view <workflow-run-id> --json`. App Store Connect (review state for the matching version/build) and the Play Console track are the final ground truth.

## Release completion and heartbeat

A release is **in progress** after npm publication and tag push. Report it as
**shipped** only after every applicable build, publication, asset, manifest, and
store submission passes the completion checklist.

Immediately after every beta, stable, or promotion tag push, create a heartbeat
that resumes the release in the current conversation. Create it automatically
with `create_heartbeat`. The heartbeat owns the release until it either reaches
the completion checklist or finds a failure that needs new user authority.

Each heartbeat checks the release tag commit, all GitHub Actions runs for the
release branch and tag, npm dist-tags, the GitHub Release body and APK asset,
the published Docker image, and the applicable EAS workflow. Inspect the GitHub
Release itself and confirm that the Android APK asset is present.

For stable releases, also confirm every required mobile build, upload, store
submission, and review-submission job for the release commit. For betas, confirm
the beta EAS workflow completed its TestFlight distribution and Beta App Review
path. Delete the heartbeat only after every applicable checklist item passes,
then report the release as shipped.

Pattern:

```jsonc
// mcp__paseo__create_heartbeat arguments
{
  "name": "vX.Y.Z release babysit heartbeat",
  "cron": "*/10 * * * *",
  "timezone": "UTC",
  "maxRuns": 120,
  "expiresIn": "24h",
  "prompt": "Resume the vX.Y.Z release babysit for commit <sha>. Check npm tags; every GitHub Actions run for the release branch and tag; the published GitHub Release body, expected APK asset; the Docker image; and the matching EAS workflow. Completion requires every applicable checklist item. For stable, require build_ios, submit_ios, submit_ios_for_review, build_android, and submit_android to succeed. For beta, require the beta TestFlight distribution and Beta App Review path. If work is pending, wait for the next heartbeat. If a failure can be retried safely for the same version, follow the failed-release procedure; otherwise report the blocker. When every applicable completion-checklist item passes, delete THIS heartbeat, report shipped, and stop.",
}
```

Run an immediate status check after creating the heartbeat. The heartbeat handles
later transitions and stops itself when the release is complete.

## Release notes on GitHub

The GitHub Release body is populated automatically by the `Release Notes Sync` workflow (`.github/workflows/release-notes-sync.yml`). It triggers on every `v*` tag push and on any push to `main` that touches `CHANGELOG.md`, then runs `scripts/sync-release-notes-from-changelog.mjs` to mirror the matching changelog entry into the release body. You don't need to write release notes on GitHub manually — keep `CHANGELOG.md` correct and the workflow will sync it. To force a re-sync, dispatch the workflow with the tag input.

## Website behavior

- The website download page defaults to GitHub's latest published **stable** release.
- A published beta prerelease is offered behind the Stable/Beta switch on `/download` (`?channel=beta`), never as the default. The switch only appears while the newest prerelease leads stable on its core version, so promoting `X.Y.Z-beta.N` to `X.Y.Z` retires the beta channel from the page until the next beta line opens.
- Homebrew, the Play Store, the App Store, and `app.paseo.sh` have no beta. The Beta view drops those rows, and the whole Web section, rather than showing an inert "stable only" placeholder. When a surface gains a beta path — say a public TestFlight link — add its row back in `packages/website/src/routes/download.tsx`.
- The default download target only moves when you publish the final stable release tag like `v0.1.41`.
- The public `/changelog` page renders `CHANGELOG.md` as-is, so the in-flight `-beta.N` entry shows there once it lands on `main` — that's intended, it's where beta users check what's coming. Only the **default download target** stays pinned to the latest stable; the download links read GitHub's releases API, not the changelog, so a `-beta.N` heading on top never affects them.
- The download page's "What's new" link deep-links the **minor group** anchor (`/changelog#release-0.3`), not the exact entry: the beta entry is renamed on each beta and on promotion, so the minor group remains the durable target. A version with no entry in the bundled changelog — a tag whose changelog commit hasn't redeployed the site yet — links the plain `/changelog` instead of a dead anchor.
- The website itself is deployed by `Deploy Website` (Cloudflare Workers), which redeploys on the `release: published` event emitted when a stable draft is published and on pushes to `main` that touch `CHANGELOG.md` or `packages/website/**`. Its job condition excludes beta prereleases.

## Fixing a failed release build

**NEVER bump the version to fix a build problem.** New versions are reserved for meaningful product changes (features, fixes, improvements). Build/CI failures are fixed on the current version.

Zekoder desktop failures follow [Failures and recovery](#failures-and-recovery): rerun the failed jobs of the same run, never move or force-push a tag, never dispatch a build.

The upstream Android APK and Docker retries below are the only retry procedures left in this section.

**Do not rely on `workflow_dispatch` for tagged code fixes.** The `workflow_dispatch` trigger runs the workflow file from the default branch but checks out the code at the tag ref (`ref: ${{ inputs.tag }}`). That means fixes committed to `main` won't change the tagged source tree being built. `workflow_dispatch` only helps when the fix lives in the workflow file itself.

For Docker-only retries, **do not push or force-push a `v*` release tag**. Use the Docker workflow dispatch instead:

```bash
gh workflow run docker.yml \
  --ref main \
  -f paseo_version=X.Y.Z-beta.N \
  -f publish=true
```

This replaces `ghcr.io/getpaseo/paseo:X.Y.Z-beta.N` in place. The Docker exception is safe because the
dispatch runs from `--ref main` and uses the explicit `paseo_version`; it does
not check out or move the `v*` release tag.

To retry a failed Android APK release, push a retry tag on the commit you want to build:

```bash
git tag -f android-v0.1.28 HEAD && git push origin android-v0.1.28 --force
```

## Notes

- `version:all:*` bumps root + syncs workspace versions and `@getpaseo/*` dependency versions
- The npm `version` lifecycle regenerates F-Droid changelog files from `CHANGELOG.md` for stable releases only (`npm run fdroid:changelogs`) and stages them, so the release tag carries them. Betas are a no-op. A stable run **aborts the release** if `CHANGELOG.md` has no entry for the version being cut — commit the changelog entry first. See [docs/android.md](android.md) for why these files are generated per ABI.
- `release:prepare` refreshes workspace `node_modules` links to prevent stale types
- `npm run dev:desktop` and `npm run build:desktop` target the Electron desktop package in `packages/desktop`
- If `release:publish` partially fails, re-run it — npm skips already-published versions
- If `release:publish:beta` partially fails, re-run it — npm skips already-published versions and keeps prereleases off `latest` because every publish uses `--tag beta`
- The website uses GitHub's latest published release API for download links, so published beta prereleases do not replace the stable download target.

## Changelog format

Release notes depend on the changelog heading format. The heading **must** be strictly followed:

```
## X.Y.Z - YYYY-MM-DD
## X.Y.Z-beta.N - YYYY-MM-DD
```

No prefix (`v`), no extra text. `Release Notes Sync` matches the `## X.Y.Z` (or `## X.Y.Z-beta.N`) line for the pushed tag to extract the version. A malformed heading breaks the release-notes sync for that tag.

`CHANGELOG.md` on `main` is also what the app's **What's new** sheet fetches and renders, so the file is a shipped product surface, not just a release input. `##` starts a release and `###` starts a section; the app reads section titles from the document, so renaming or adding one needs no app change. Everything under a section is rendered as Markdown: prose, lists, links, inline code, fenced code, block quotes, tables, and images. Raw HTML does not render — the shared Markdown parser runs with `html: false`, so a `<video>`, `<iframe>` or `<embed>` tag reaches the reader as visible markup. Keep media out of the changelog, or link to it. A GitHub callout renders as a block quote with its `[!NOTE]` marker still in the text. A release entry is what a user reads on a phone the moment they are offered the update — write it for them.

## Changelog policy

- `CHANGELOG.md` holds stable releases and at most one entry for the current beta series.
- The first beta of a version inserts a top entry like `## 0.1.60-beta.1 - YYYY-MM-DD`.
- Each subsequent beta rewrites that entry in place: the heading becomes the new beta number and date, and the body describes the full change from the previous stable release to this beta. Never add a second beta entry.
- The entry is a list of changes, not of PRs. When a later beta reverts, reworks, or follows up on something an earlier beta added, rewrite the bullet to the current behavior or delete it. A stable user never saw the earlier beta behavior, so fixes to it are not "Fixed" bullets.
- Anything that already shipped to stable through a patch release on an older line stays out of the beta entry.
- Stable promotion renames the entry to `## 0.1.60 - YYYY-MM-DD` after a final review.

Older prerelease bodies on GitHub keep the notes they were synced with; `Release Notes Sync` only writes the release whose tag matches the top entry.

## Changelog ownership

- **The agent running the release writes the changelog entry — beta or stable.** The release context and final wording stay with that agent.
- **Commit history is only an index of the changes. Never draft the changelog from commit subjects or diffs alone.** For every PR in the release range, read the full PR description and every issue it links to before deciding what changed, why users care, or how changes should be grouped. Use the implementation only to verify the resulting understanding.
- Every entry, beta or stable, is drafted from the previous stable release to the release source. For a later beta, read the PRs since the previous beta tag, then rework the existing entry so each bullet still describes current behavior. Review the result against the changelog policy below, show it to the user, and wait for approval before committing it.

## Changelog wording

The changelog is shown on the Paseo homepage. Each bullet is a compact factual record of
product behavior that changed.

- **Name the exact change.** Prefer `Added <capability>`, `Removed <behavior>`,
  `Changed <behavior>`, or `Fixed <failure> when <condition>`.
- **Keep the scope exact.** A conditional bug is not a general reliability problem. Do not
  broaden one failure into claims that Paseo is now faster, smoother, responsive, or reliable.
- **Use concrete product and runtime terms.** Git polling, persisted cache, provider catalog,
  and WebSocket reconnects can identify the affected behavior. Component names, internal
  modules, code symbols, and implementation techniques cannot: omit `WorkingIndicator`,
  `reconcileAndEmitWorkspaceUpdates`, remounts, memoization, and controlled inputs.
- **State the consequence only when the change itself is unclear.** Keep the condition that
  makes the consequence true. Do not replace a precise change with a broad benefit claim.
- **Do not invent context.** Mention an upgrade, platform, workload, or user action only when
  the PR or linked issue establishes that scope.

| Avoid                                                        | Write                                                 |
| ------------------------------------------------------------ | ----------------------------------------------------- |
| Paseo stays responsive with many idle Git workspaces         | Removed periodic Git polling for idle workspaces      |
| Incompatible saved app data no longer crashes after upgrades | Fixed crash when persisted cache was incompatible     |
| Splitting layouts no longer remounts the active agent        | Fixed scroll position resetting when splitting a pane |
| Mobile model selector is faster and more straightforward     | Added search to the mobile model selector             |

Test each bullet against the source PR and issue: can a reviewer point to the exact behavior
that changed, the failure that was fixed, or the capability that was added? If the bullet only
claims a general improvement, rewrite it with the concrete change.

- **Use the entry's release scope.** Include changes within the matching range in **Changelog scope**.
- **Collapse internal iterations within that scope.** Present a feature added and fixed in one range as working.
- **Cut low-signal entries.** "Toolbar buttons have consistent sizing" is too granular. Combine small polish items or drop them.

## Changelog conciseness

Every bullet must be scannable at a glance. The changelog is not release documentation — it's a list.

- **One sentence per bullet, max.** If a bullet contains two sentences, the second one is doing work that belongs in product docs, not the changelog. Cut it.
- **No trailing periods.** Bullets are list items, not prose. Drop the period at the end of every bullet, including the period inside any bolded lead-in. `**Configurable terminal scrollback**` not `**Configurable terminal scrollback.**`.
- **One line per bullet.** If a bullet wraps to three lines in a narrow column, it's too long.
- **Split bullets that pack multiple distinct changes.** If a bullet uses "and", "plus", a comma list, or an em-dash to chain several independent improvements, break them into separate bullets — even when they share a theme or author. One bullet = one user-facing change.
- **Trim qualifying clauses.** Drop "with a hint shown when…", "matching the CLI's behaviour", "across common install shapes". If the detail doesn't change whether a user cares, cut it.
- **Stop after identifying the change.** Do not explain LAN/WAN topology, TLS handshakes, IPC, or other architecture in a changelog bullet. Put necessary background in product docs.
- **Attribution follows the split.** When you split a dense bullet, move each PR/author to the bullet it belongs to. Never duplicate the same PR across multiple bullets.

## Changelog attribution

Every changelog bullet must credit contributors and link to the PR(s) that delivered the change. This is not one-PR-per-line — a single bullet describes a user-facing change and may reference multiple PRs.

Format: append `([#123](https://github.com/getpaseo/paseo/pull/123) by [@user](https://github.com/user))` at the end of each bullet. For changes spanning multiple PRs or contributors:

```markdown
- Voice mode now works on tablets with proper microphone permissions. ([#210](https://github.com/getpaseo/paseo/pull/210), [#215](https://github.com/getpaseo/paseo/pull/215) by [@alice](https://github.com/alice), [@bob](https://github.com/bob))
```

Rules:

- **Always link the PR number** as `[#N](https://github.com/getpaseo/paseo/pull/N)`.
- **Always link the contributor's GitHub profile** as `[@user](https://github.com/user)`.
- **One bullet = one user-facing change**, regardless of how many PRs went into it. Group related PRs on the same bullet.
- **De-duplicate contributors.** If the same person authored multiple PRs in one bullet, list them once.
- **Only credit external contributors.** Skip attribution for [@boudra](https://github.com/boudra). The changelog credits community contributions — core team work is the default.
- **Credit the commit author, not the PR opener.** A maintainer often opens a PR that lands work authored by someone else (cherry-pick, rebase of a contributor's branch, manual extraction from a stacked PR). The squash commit preserves the original commit's author, but `gh pr view N --json author` returns the PR opener — using that field will silently mis-credit the work to the maintainer (and then the "skip @boudra" rule drops the attribution entirely). Always resolve attribution from commit authors.

  Use this command to get the GitHub logins for each PR:

  ```bash
  gh pr view N --json commits --jq '[.commits[].authors[].login] | unique | .[]'
  ```

  This returns every distinct GitHub login that authored or co-authored a commit in the PR. Use those logins for attribution. Fall back to `gh pr view N --json author` only if the commits command returns nothing (which should not happen for merged PRs).

  When listing PR numbers, `git log --format='%H %s' v<previous>..<release-source-sha> | grep -E '\(#[0-9]+\)$'` pulls the PR number out of squash commit subjects.

## Changelog ordering

Entries within each section (Added, Improved, Fixed) are ordered by user impact:

1. **User-facing features and changes first** — things users will notice, want to try, or that change their workflow.
2. **Quality-of-life improvements** — polish, performance, smoother interactions.
3. **Internal/infra changes last** — only include if they have a tangible user benefit (e.g. "faster startup" is user-facing even if the fix was internal).

## Pre-release sanity check

Before cutting a **stable** release, the release agent reviews the diff as a last line of defence against shipping bugs. Skip this for betas — the beta itself is the smoke test, and gating each beta on a code review defeats the point of using betas as fast release candidates.

Review the diff between the latest release tag and the resolved release source. Focus on:

1. **Breaking changes** — especially in the WebSocket protocol, agent lifecycle, and any server↔client contract.
2. **Backward compatibility** — the important direction is old app clients talking to newly updated daemons. Users update desktop and daemon first, then keep running the old app for a while. Flag anything that breaks old clients against new daemons or requires both sides to update in lockstep.
3. **Regressions** — anything that looks like it could break existing functionality.

Use `git diff <latest-release-tag>..<release-source-sha>` as the review input. This is a deep sanity check, not a full code review. If anything looks risky, investigate before proceeding and surface the finding to the user.

## Changelog scope

Changelog scope follows the release being described:

Every entry covers `previous stable release → release source`: first beta, later beta, direct stable release, and promotion alike. The beta entry always reads as the stable entry would if the beta were promoted today.

## Completion checklist

### Beta release

- [ ] The resolved release source is the intended commit (default `origin/main`) and its existing CI is green
- [ ] Every PR in the release range has been opened, and its full description and every linked issue have been read before drafting the changelog
- [ ] Fold this beta into the series' single `CHANGELOG.md` entry (heading `## X.Y.Z-beta.N - YYYY-MM-DD`, previous stable → release source), review it against the changelog policy, get approval, and commit it before cutting the release
- [ ] The diff from the previous stable to the resolved release source is classified as patch or minor, with the target version and rationale approved
- [ ] Release preparation stayed local until the approved release command pushed the complete branch and tag
- [ ] `npm run release:beta:patch`, `npm run release:beta:minor`, or `npm run release:beta:next` completes successfully
- [ ] Every GitHub Actions run for the complete release commit and tag is green
- [ ] npm shows the version under the `beta` dist-tag, not `latest`
- [ ] The GitHub prerelease has the changelog body and the Android APK asset
- [ ] GitHub `Android APK Release` workflow for the same tag is green
- [ ] GitHub `Docker` workflow is green and the versioned beta image is published without moving `latest`
- [ ] GitHub `Release Notes Sync` mirrored the beta entry into the prerelease body
- [ ] EAS `Release iOS Beta` completed its build, TestFlight distribution, external beta group, and Beta App Review path
- [ ] The release heartbeat was created after the tag push and deleted only after every item above passed

### Stable release (or promotion)

- [ ] Run the pre-release sanity check (see above) and address any findings
- [ ] The diff from the previous stable to the resolved release source is classified as patch or minor, with the target version and rationale approved
- [ ] The resolved release source is the intended commit (default `origin/main`) and its existing CI is green
- [ ] Every PR in the release range has been opened, and its full description and every linked issue have been read before drafting the changelog
- [ ] Ensure the approved release inputs are committed locally and the git worktree is clean before running any release command
- [ ] Ensure local `npm run typecheck` passes on that exact commit before running any release command
- [ ] Update `CHANGELOG.md` with user-facing release notes (features, fixes — not refactors). Promotion renames the series' `## X.Y.Z-beta.N` entry to `## X.Y.Z - YYYY-MM-DD` and re-checks it covers the full release
- [ ] Verify the changelog heading follows strict `## X.Y.Z - YYYY-MM-DD` format
- [ ] Release preparation stayed local until the approved release command pushed the complete branch and tag
- [ ] `npm run release:patch`, `npm run release:minor`, or `npm run release:promote` completes successfully
- [ ] Every GitHub Actions run for the complete release commit and tag is green
- [ ] Move npm's `beta` dist-tag to the new stable version for every published package and verify both `latest` and `beta` resolve to it
- [ ] The GitHub Release has the changelog body and the Android APK asset
- [ ] GitHub `Android APK Release` workflow for the same tag is green
- [ ] GitHub `Docker` workflow is green and both the versioned and `latest` images are published
- [ ] GitHub `Release Notes Sync` is green and the release body matches the stable changelog entry
- [ ] EAS `Release Mobile` workflow for the same tag is green
- [ ] EAS iOS `build_ios` completes for the same tag
- [ ] EAS iOS `submit_ios` succeeds, uploading the build to App Store Connect/TestFlight
- [ ] EAS iOS `submit_ios_for_review` succeeds, putting the build into App Store review
- [ ] EAS Android `build_android` completes for the same tag
- [ ] EAS Android `submit_android` succeeds, putting the build on its Play Store track
- [ ] The release heartbeat was created after the tag push and deleted only after every item above passed
