# Desktop release contracts

## desktop-release-catalog

- Type: internal
- Kind: store
- Owner: 01
- Consumers: 02, 03
- Public URL: https://storage.googleapis.com/zekoder-releases/desktop/releases/manifest.json
- JSON schemaVersion: 1; channels: {stable: tag|null, beta: tag|null}; releases: object keyed by tag.
- Each release: {tag, version, channel, publishedAt, sourceCommit, upstreamCommit, plugins, releaseNotesUrl, githubReleaseUrl, targets}.
- plugins copies the pinned repo/ref/commit/version/checksum identity from plugins/zekoder.lock.json; never resolve a floating plugin ref.
- targets is an array of {platform: darwin|win32|linux, arch: x64|arm64, feedUrl, artifacts}.
- artifacts: array of {name, kind, url, sha256, size}; all installer/archive/blockmap/feed objects required by that target are present.
- Stable accepts only ^v(0|[1-9][0-9]_)\.(0|[1-9][0-9]_)\.(0|[1-9][0-9]_)$; beta appends -beta\.(0|[1-9][0-9]_) to that core. No other prefixes/prereleases/build metadata.
- Immutable root: desktop/releases/TAG/. Target payloads and generic YAML reside under PLATFORM/ARCH/; notes at release-notes.md. feedUrl points to that target directory, never a mutable channel directory.
- Electron channel filenames remain latest[-mac|-linux].yml for stable and beta[-mac|-linux].yml for beta. Every snapshot includes a beta-channel alias for final stable promotion (same bytes/version), so beta clients can consume stable snapshots. Windows architecture directories eliminate channel.yml collisions. YAML filenames/relative artifact URLs and SHA512 retain electron-builder semantics.
- Matrix: darwin arm64+x64 (DMG+ZIP), win32 x64+arm64 (NSIS+ZIP), linux x64 (AppImage+deb+rpm+tar.gz); publish associated blockmaps and required updater metadata. Keep Zekoder-x64.AppImage basename.
- Every metadata version equals tag without v; packaged app.getVersion() and installer version agree. Stable pointer selects stable releases only; beta pointer selects highest eligible stable or beta version, so beta users receive the final stable. Missing pointer means no update. No automatic downgrade.
- Readers validate schema, tag/version/channel correspondence and HTTPS URLs within the desktop prefix on storage.googleapis.com/zekoder-releases. They select the exact OS+architecture and pin its immutable feed for each check/download.
- Publisher accepts only all five complete target outputs from the same tag commit with nonempty GitHub Release notes and pinned provenance. Uploaded stored bytes, not a rebuilt candidate, determine manifest hashes/sizes.
- Upload missing immutable objects with generation=0; exact existing bytes are reusable. Any differing object aborts; rebuild replay never overwrites signed/notarized artifacts. Reuse already uploaded release outputs on retries.
- Publish catalog last with generation-match CAS; on conflict reload+merge, preserve both channels/history and choose semantic highest tag for stable-only and beta-inclusive channel eligibility. First creation uses generation=0. Serialize publication without canceling/losing queued tags; CAS remains authoritative.
- Cache immutable payloads long-term; catalog max-age=60. No catalog pointer changes if any target/notes validation/upload fails.
- releaseNotesUrl references UTF-8 Markdown copied verbatim from matching GitHub Release body (draft allowed), with SHA256+size tracked as a release artifact; release body is high-level product notes, never generated commit dumps. Also stamp identical Markdown into YAML releaseNotes for existing update UI; retain releaseNotesUrl in catalog.

## gcs-desktop-distribution

- Type: cross-system
- Counterpart: GCP project zekoder-484012 / bucket zekoder-releases
- External dependency: 1
- Owner: 01
- Consumers: 02
- Dedicated apps-repository WIF and desktop service account; writes restricted to desktop/releases/ including generation preconditions; existing public read applies.
- Repository variables: ZEKODER_RELEASE_BUCKET=zekoder-releases, GCP_WORKLOAD_IDENTITY_PROVIDER, GCP_SERVICE_ACCOUNT; publisher authenticates with GitHub OIDC (contents read, id-token write).
- Skills-owned releases/vVERSION/ and releases/manifest.json remain untouched.
