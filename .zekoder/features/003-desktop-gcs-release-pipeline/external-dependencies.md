# External dependencies

## 1. Desktop GCS identity

- Type: GCP IAM and GitHub repository configuration
- Owner: Cybernetic Labs GCP/repository maintainer
- Blocks packages: 01 live publication; 02 release execution
- Related contract: gcs-desktop-distribution
- Provision dedicated provider trusting cyberneticlabs/zekoder-studio tag releases only and desktop service account with least permissions confined to desktop/releases/ in gs://zekoder-releases (project zekoder-484012). Confirm numeric project/provider resource; current skills github/github-repo trust authorizes only cyberneticlabs/zekoder-skills.
- Configure ZEKODER_RELEASE_BUCKET, GCP_WORKLOAD_IDENTITY_PROVIDER, GCP_SERVICE_ACCOUNT; prove denied writes to skills releases/ and allowed generation-guarded desktop writes. No key files.
- This plan does not provision cloud resources or disclose credentials.

## 2. Fork-owned signing identities

- Type: Apple and Windows signing credentials / repository secrets
- Owner: Cybernetic Labs release maintainer
- Blocks packages: 02 signed public builds and 03 install verification
- Related contract: desktop-release-catalog
- Configure owned Apple certificate/password, Apple ID/app-specific password/team and Developer ID notarization for net.zekoder.desktop; audit after-sign.js. Existing workflow env names APPLE_CERTIFICATE, APPLE_CERTIFICATE_PASSWORD, APPLE_ID, APPLE_PASSWORD, APPLE_TEAM_ID can be retained if fork-owned.
- Existing Windows builds are unsigned. Preserve that policy explicitly for initial releases; optional owned CSC_LINK/CSC_KEY_PASSWORD can enable signing without a new signing service. Document SmartScreen implications; Windows signing setup is an open assumption, not a mandatory new infrastructure project. Fail macOS preflight if required owned identities are absent.
- Linux packaging/smoke needs no platform signing identity; macOS signature/notarization and declared Windows signing policy evidence are required before catalog visibility.

## 3. First release and provenance readiness

- Type: agent-operated release preparation and GitHub configuration
- Owner: Cybernetic Labs release maintainer and release agent
- Blocks packages: 02 production tag; 03 live upgrade rehearsal
- Related contract: desktop-release-catalog
- Derive exact upstream revision from the second parent of the latest existing chore(sync): merge upstream paseo merge commit in tagged ancestry (currently 76761c78b), and verify that SHA is an ancestor. Preserve that sync convention; stop with actionable error if no such merge exists. No new repository variable is needed.
- Agent prepares reviewed high-level notes in a matching GitHub draft Release BEFORE pushing the version tag. Stable draft is not a prerelease; beta draft is. Pipeline requires that exact body and resolves actual tag commit instead of relying on draft target_commitish.
- Initial beta and next-beta builds, then stable and next-stable builds, are needed for real signed update rehearsals. User authorization to create drafts, push tags and publish is collected during execution; this planning request authorizes none of those writes.
