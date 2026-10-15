---
id: 002-plugin-signing-key-rotation
type: followup
title: Rotate the plugin signing key without affecting current users
status: planned
createdAt: 2026-10-07
openedAt: 2026-10-07T16:11:47.626Z
updatedAt: 2026-10-15T15:21:33.459Z
origin: zekoder-debt-agent
filedFromTask: null
branch: followup-002-plugin-signing-key-rotation
promoted: false
packages: []
relatedFeatures:
  - 004-plugin-auto-update
  - 013-plugin-auto-update-publishing
  - 008-plugin-source-consolidation
relatedBugs: []
relatedFollowups: []
resolvedBy: null
statusHistory: []
---

# Followup 002-plugin-signing-key-rotation: Rotate the plugin signing key without affecting current users

## Summary

Make the plugin release signing key rotatable with zero user impact: ship the new public key in `TRUSTED_KEYS`, dual-sign the manifest in the release workflow during the overlap, prove the dual-key overlap in tests, swap the CI secret, retire the old key later, and document the runbook. The release side (dual-sign, secret swap) used to live in a separate repo followup; it now lives here because the plugin source and its release workflow are in this repo (feature 008-plugin-source-consolidation).

## Why it's out of scope now

User decision 2026-10-07: feature 004-plugin-auto-update ships only the list-shaped hooks (`TRUSTED_KEYS` as a list of zekoder-plugins keyring entries `{keyId, alg, publicKey, addedAt}`; one signed envelope `plugins/zekoder/manifest.json` carrying `signatures: [{keyId, alg, sig}]` beside the base64 `payload`, no separate `.sig`; accept any trusted `ed25519` entry). The format is owned by feature 013-plugin-auto-update-publishing (imported from the former zekoder-plugins repo), whose release pipeline is now `scripts/plugin-release.mjs` and `.github/workflows/plugin-release.yml` in this repo. Rotation is a separate, later step and depends on 004 shipping.

## Proposed approach

Rotation order (the runbook this followup documents):

1. Add the new `{keyId, alg, publicKey, addedAt}` entry (copied from zekoder-plugins `scripts/plugin-release-keys.json`) to `TRUSTED_KEYS` and ship it in a desktop release. Wait until supported app versions have it.
2. CI (`.github/workflows/plugin-release.yml`, `plugin-release` environment) dual-signs the manifest during the overlap: the envelope's `signatures[]` holds entries for both keys. `sign` in `scripts/plugin-release.mjs` emits a second signature when the `ZEKODER_PLUGIN_SIGNING_KEY_NEXT` secret and `ZEKODER_PLUGIN_SIGNING_KEY_NEXT_ID` variable are set (both key ids must be in the keyring and match their derived public keys); single-key behavior stays the default when `_NEXT` is unset. `verify` keeps the existing rule: at least one known keyId verifies.
3. CI switches to the new key only (secret swap: promote `_NEXT` to primary, delete the old secret, drop the `_NEXT` naming).
4. In a later desktop release, remove the old key from `TRUSTED_KEYS` once every supported app version trusts the new key.

Apps older than the first release that trusts the new key keep running the bundled/last good plugin; they ignore signatures from unknown keyIds and report `signature-invalid` for new-only manifests. No breakage.

Files (004 has not shipped; paths come from 004 package 01 and are approximate until it lands):

- `packages/server/src/server/plugins/builtin/updates/trusted-keys.ts` (approximate, created by 004 package 01): the `TRUSTED_KEYS` list.
- `packages/server/src/server/plugins/builtin/updates/manifest.ts` (approximate): `verifyEnvelope`, already any-trusted-entry.
- `packages/server/src/server/plugins/builtin/updates/index.test.ts` (approximate): updater tests.
- `docs/plugins.md` (exists): owns plugin update/signing per 004.
- `scripts/plugin-release.mjs` and `scripts/plugin-release-keys.json` (the keyring `{keys:[{keyId, alg, publicKey, addedAt}]}`): `sign`/`verify` and the public keys.
- `.github/workflows/plugin-release.yml`: passes the `_NEXT` secret and `_NEXT_ID` variable to the sign step.
- `docs/release.md`: the plugin release runbook section gets the rotation steps.

## Tasks

- [ ] Add overlap tests in `packages/server/src/server/plugins/builtin/updates/index.test.ts` (approximate path): trusted list `[old, new]` with manifest signed by old-only, new-only, both; and trusted list `[old]` (older app) against new-only manifest, which is rejected with `signature-invalid` and leaves state unchanged.
- [ ] Add a rotation comment and a per-key "minimum app version" note beside `TRUSTED_KEYS` in `packages/server/src/server/plugins/builtin/updates/trusted-keys.ts` (approximate path).
- [ ] Document the rotation runbook in `docs/plugins.md`: steps above, the minimum app version trusting each key (table), behavior for older apps, and the retirement criterion. Integrate into the existing plugin update/signing section; do not append a loose paragraph.
- [ ] CI dual-sign: extend `sign` in `scripts/plugin-release.mjs` to emit two `signatures[]` entries when `ZEKODER_PLUGIN_SIGNING_KEY_NEXT` + `_NEXT_ID` are set (require both ids in the keyring, public keys matching), keep `verify` passing when at least one known signature verifies and failing when none do, and expose the `_NEXT` secret/variable to the sign step in `.github/workflows/plugin-release.yml`.
- [ ] Document the release-side rotation in `docs/release.md` (plugin release section): keygen, add the new public key to `scripts/plugin-release-keys.json`, desktop release trusting both keys, set `_NEXT`, dual-sign, switch the primary to the new key, retire the old key after supported app versions carry the new one. Order must keep every supported app trusting the new key before any release is signed only with it.
- [ ] When actually rotating: add the new public key to `TRUSTED_KEYS`, release desktop, later remove the old key in a following release. <!-- TODO: concrete keyIds and release versions are filled in at rotation time. -->

## Verification

- `npx vitest run packages/server/src/server/plugins/builtin/updates/index.test.ts --bail=1 > /tmp/test-output.txt 2>&1` passes with the old-only, new-only, both, and older-app cases.
- `npm run typecheck` and `npm run lint` clean.
- `docs/plugins.md` runbook lists min app version per key and older-app behavior.
- CI dual-sign, with throwaway keys: `keygen` two keys to `/tmp`, a temporary keyring with both; `sign` with both set yields two `signatures[]` entries and `verify` passes; remove one key from the keyring and `verify` still passes; remove both and it fails; with no `_NEXT` set it still produces one signature.

## Related

- Feature 004-plugin-auto-update (dependsOn): provides the hooks.
- Feature 013-plugin-auto-update-publishing: owns the signed-release pipeline and manifest envelope this followup extends.
- Feature 008-plugin-source-consolidation: moved the plugin source and release workflow into this repo and merged the former repo's rotation followup (CI dual-sign, secret swap) into this item.
