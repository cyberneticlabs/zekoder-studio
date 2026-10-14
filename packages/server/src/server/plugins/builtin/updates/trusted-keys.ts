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
 * Entries are copied verbatim from zekoder-plugins `scripts/plugin-release-keys.json` (`keys`
 * list). Only public keys belong here. Empty until the release key is published, which keeps the
 * updater disabled (no network calls).
 */
export const TRUSTED_KEYS: readonly TrustedKey[] = [];

export const MANIFEST_URL =
  "https://storage.googleapis.com/zekoder-releases/plugins/zekoder/manifest.json";
