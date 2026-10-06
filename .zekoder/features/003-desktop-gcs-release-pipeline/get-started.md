# Desktop release walkthrough

## Prerequisites

Node 22+, npm ci, green source CI, signed-build identities and dedicated GCP OIDC configured. Dependencies in external-dependencies.md must be verified. Catalog may initially be absent. Planning makes no release/cloud writes.

## Run commands

- npm run build:client
- npm run typecheck
- npm run lint
- npm run format before committing implementation.
- Desktop local packaging: npm run build:desktop -- --publish never --mac --arm64 (mac host); --win --x64 or --arm64 (Windows host); --linux --x64 (Linux host). Publishing is performed exclusively by tag workflow; local packaging never publishes.

## Manual walkthrough

1. Agent prepares approved high-level notes in GitHub draft Release v0.1.0-beta.1 and validates source CI/signing/provenance. User authorizes release; agent pushes annotated tag → only desktop distribution starts, exact tag version is packaged.
2. All five matrix targets smoke successfully → notes/body and complete target payloads upload under desktop/releases/v0.1.0-beta.1/, catalog beta pointer switches last. Stable unchanged; every URL/hash resolves.
3. Install beta on each architecture; release next beta through same authorized tag process → app finds/downloads fork binary, shows Markdown product notes, verifies and relaunches with correct version/user state.
4. Release stable v0.1.0 then v0.1.1 → stable settings receive stable only; beta advances to final stable if it exceeds the current beta pointer. Manifest retains both histories and notes links.
5. Inject matrix failure/missing notes in fixture pipeline → catalog unchanged. Rerun failed tag with existing identical objects → complete safely; changed immutable payload → abort.
6. Publish out-of-order versions/concurrent CAS fixtures → greatest semantic pointer survives and both channel histories remain. Branch pushes, manual dispatch, invalid tags and GitHub release events never start distribution.
7. Inspect mac signature/notarization and configured Windows signature (or explicitly documented unsigned policy); update Linux AppImage in place, confirm unsupported package-manager formats report documented limitations. Install retained earlier signed binary manually for rollback test.

## Integration-test mapping

| Steps      | Evidence                                                                                                            |
| ---------- | ------------------------------------------------------------------------------------------------------------------- |
| 1, 2, 5, 6 | scripts/release-version-utils.test.mjs; scripts/desktop-release/release-data.test.mjs; workflow CI matrix/artifacts |
| 3, 4       | auto-updater.test.ts; app-update-service.test.ts; manual native upgrade evidence                                    |
| 7          | existing after-pack smoke diagnostics plus manual OS verification                                                   |
