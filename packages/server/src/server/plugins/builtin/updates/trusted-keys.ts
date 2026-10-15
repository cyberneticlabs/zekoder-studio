/**
 * One entry of the zekoder-plugins release keyring. `publicKey` is the standard base64 of the raw
 * 32-byte Ed25519 public key.
 */
export interface TrustedKey {
  keyId: string;
  alg: "ed25519";
  publicKey: string;
  addedAt: string;
}

/**
 * Must equal the `keys` list in `scripts/plugin-release-keys.json` (pinned by
 * `scripts/plugin-release.test.mjs`). Only public keys belong here. An empty list keeps the updater
 * disabled (no network calls).
 */
export const TRUSTED_KEYS: readonly TrustedKey[] = [
  {
    keyId: "zk-plugin-2026-10",
    alg: "ed25519",
    publicKey: "+YlDPvYLnFIJr1VOWeLAR7Ai5Z6zJ3hJBVchAa88SUo=",
    addedAt: "2026-10-14",
  },
];

export const MANIFEST_URL =
  "https://storage.googleapis.com/zekoder-releases/plugins/zekoder/manifest.json";
