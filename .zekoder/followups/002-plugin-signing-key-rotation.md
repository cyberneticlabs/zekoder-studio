---
id: 002-plugin-signing-key-rotation
type: followup
title: Rotate the plugin signing key without affecting current users (Studio side)
status: planned
createdAt: 2026-10-07
openedAt: 2026-10-07T16:11:47.626Z
updatedAt: 2026-10-07T16:12:19.184Z
origin: zekoder-debt-agent
filedFromTask: null
branch: followup-002-plugin-signing-key-rotation
promoted: false
packages: []
relatedFeatures:
  - 004-plugin-auto-update
relatedBugs: []
relatedFollowups: []
resolvedBy: null
statusHistory: []
---
# Followup 002-plugin-signing-key-rotation: Rotate the plugin signing key without affecting current users (Studio side)

## Summary

Make the zekoder-plugins CI signing key rotatable with zero user impact: ship the new public key in `TRUSTED_KEYS`, prove the dual-key overlap in tests, retire the old key later, and document the runbook.

## Why it's out of scope now

User decision 2026-10-07: feature 004-plugin-auto-update ships only the list-shaped hooks (`TRUSTED_KEYS` as `{keyId, publicKey}[]`, manifest `.sig` as `{ signatures: [{keyId, sig}] }`, accept any trusted entry). Rotation is a separate, later step and depends on 004 shipping.

## Proposed approach

Rotation order (the runbook this followup documents):

1. Add the new `{keyId, publicKey}` to `TRUSTED_KEYS` and ship it in a desktop release. Wait until supported app versions have it.
2. CI (zekoder-plugins repo) dual-signs the manifest during the overlap: `.sig` lists entries for both keys.
3. CI switches to the new key only (secret swap).
4. In a later desktop release, remove the old key from `TRUSTED_KEYS` once every supported app version trusts the new key.

Apps older than the first release that trusts the new key keep running the bundled/last good plugin; they ignore signatures from unknown keyIds and report `signature-invalid` for new-only manifests. No breakage.

Files (004 has not shipped; paths come from 004 package 01 and are approximate until it lands):

- `packages/server/src/server/plugins/builtin/updates/trusted-keys.ts` (approximate, created by 004 package 01): the `TRUSTED_KEYS` list.
- `packages/server/src/server/plugins/builtin/updates/manifest.ts` (approximate): `verifyManifestSignature`, already any-trusted-entry.
- `packages/server/src/server/plugins/builtin/updates/index.test.ts` (approximate): updater tests.
- `docs/plugins.md` (exists): owns plugin update/signing per 004.

## Tasks

- [ ] Add overlap tests in `packages/server/src/server/plugins/builtin/updates/index.test.ts` (approximate path): trusted list `[old, new]` with manifest signed by old-only, new-only, both; and trusted list `[old]` (older app) against new-only manifest, which is rejected with `signature-invalid` and leaves state unchanged.
- [ ] Add a rotation comment and a per-key "minimum app version" note beside `TRUSTED_KEYS` in `packages/server/src/server/plugins/builtin/updates/trusted-keys.ts` (approximate path).
- [ ] Document the rotation runbook in `docs/plugins.md`: steps above, the minimum app version trusting each key (table), behavior for older apps, and the retirement criterion. Integrate into the existing plugin update/signing section; do not append a loose paragraph.
- [ ] When actually rotating: add the new public key to `TRUSTED_KEYS`, release desktop, later remove the old key in a following release. <!-- TODO: concrete keyIds and release versions are filled in at rotation time. -->

## Verification

- `npx vitest run packages/server/src/server/plugins/builtin/updates/index.test.ts --bail=1 > /tmp/test-output.txt 2>&1` passes with the old-only, new-only, both, and older-app cases.
- `npm run typecheck` and `npm run lint` clean.
- `docs/plugins.md` runbook lists min app version per key and older-app behavior.

## Related

- Feature 004-plugin-auto-update (dependsOn): provides the hooks.
- <!-- TODO: paired zekoder-plugins repo followup (CI dual-sign during overlap, secret swap, runbook); id pending, link once filed. -->
