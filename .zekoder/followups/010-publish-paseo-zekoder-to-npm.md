---
id: 010-publish-paseo-zekoder-to-npm
type: followup
title: Publish @cyberneticlabs/paseo-zekoder to npm from plugin-release.yml
status: planned
createdAt: 2026-10-15
openedAt: 2026-10-15T15:15:41.700Z
updatedAt: 2026-10-15T15:15:41.700Z
origin: zekoder-coding-agent
filedFromTask: 008-plugin-source-consolidation-03-registry-import
branch: followup-010-publish-paseo-zekoder-to-npm
promoted: false
packages: []
relatedFeatures:
  - 006-host-zekoder-provisioning
  - 008-plugin-source-consolidation
relatedBugs: []
relatedFollowups: []
resolvedBy: null
statusHistory: []
---
# Followup 010-publish-paseo-zekoder-to-npm: Publish @cyberneticlabs/paseo-zekoder to npm from plugin-release.yml

## Summary

Publish the Zekoder plugin (`plugins/zekoder/`) to npm as `@cyberneticlabs/paseo-zekoder` from the in-repo plugin release workflow, so stock Paseo daemons can install a current version.

## Why it's out of scope now

Feature 008-plugin-source-consolidation moved the plugin source into this repo and gave it one release workflow (`.github/workflows/plugin-release.yml`) that signs and publishes the manifest and artifact to the release bucket. Publishing to npm needs an npm token or trusted-publisher setup for the `@cyberneticlabs` scope, which is a human task and cannot be done by the agent. Until it exists, `packages/app/src/zekoder/host-provisioning.ts` has nothing newer to point at.

Context: `host-provisioning.ts` pins `ZEKODER_PLUGIN_VERSION = "0.11.1"` and builds the install source `npm:@cyberneticlabs/paseo-zekoder@0.11.1` for stock daemons that do not bundle the plugin. The in-repo plugin is now at `0.12.0-beta.1` (`plugins/zekoder/package.json`, `private: true`, package name `paseo-zekoder`). The pin can only move once the release workflow publishes that npm package.

## Proposed approach

- Decide the publish identity (npm trusted publishing from `plugin-release.yml`, or an `NPM_TOKEN` secret in the `plugin-release` environment). Create the secret or trust relationship (human task).
- `plugins/zekoder/package.json`: the published package is named `@cyberneticlabs/paseo-zekoder` and is not `private`. Keep the `files` allowlist, which is also what the release `treeChecksum` hashes. Choose whether to rename in place or to stage a renamed copy for publishing (the checksum covers the `files` allowlist, so `package.json` edits do not change it).
- `.github/workflows/plugin-release.yml`: after the signed release is built and verified, run `npm publish --access public` for the staged package on stable tags. Decide how beta tags publish (a `beta` dist-tag, not `latest`).
- `packages/app/src/zekoder/host-provisioning.ts` and its test: move `ZEKODER_PLUGIN_VERSION` to the published version once it exists (the test asserts an exact semver).
- `docs/release.md`: add the npm publish step and its secret to the plugin release section.

## Tasks

- [ ] Human: create the npm publish identity for `@cyberneticlabs/paseo-zekoder` and store it as an environment secret or trusted-publisher entry.
- [ ] `.github/workflows/plugin-release.yml`: publish the package to npm after the signed release is verified (stable tag to `latest`, beta tag to `beta`).
- [ ] `plugins/zekoder/package.json` (or a staged copy): publishable name and access.
- [ ] `packages/app/src/zekoder/host-provisioning.ts` and `host-provisioning.test.ts`: bump `ZEKODER_PLUGIN_VERSION` to the first version published from this workflow.
- [ ] `docs/release.md`: document the npm publish step.

## Verification

- A tagged plugin release publishes `@cyberneticlabs/paseo-zekoder@<version>` to npm (`npm view @cyberneticlabs/paseo-zekoder version` shows it).
- `npx vitest run packages/app/src/zekoder/host-provisioning.test.ts --bail=1 > /tmp/test-output.txt 2>&1` passes with the new pin.
- A stock daemon provisioned through the app installs the new version from npm.

## Related

- Feature 008-plugin-source-consolidation: moved the source and release workflow in-repo.
- Feature 006-host-zekoder-provisioning: owns `host-provisioning.ts` and the pin.
