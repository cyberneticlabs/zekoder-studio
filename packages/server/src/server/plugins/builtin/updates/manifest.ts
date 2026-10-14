import { createPublicKey, verify } from "node:crypto";
import semver from "semver";
import { z } from "zod";
import type { TrustedKey } from "./trusted-keys.js";
import type { BuiltinPluginUpdateChannel } from "./types.js";

const ARTIFACT_URL_PREFIX = "https://storage.googleapis.com/zekoder-releases/plugins/zekoder/";

const versionSchema = z.string().refine((value) => semver.valid(value) === value, {
  message: "not a semver version",
});

const releaseSchema = z.object({
  version: versionSchema,
  tag: z.string(),
  channel: z.enum(["stable", "beta"]),
  commit: z.string(),
  publishedAt: z.string(),
  artifact: z.object({
    url: z.string().refine(isArtifactUrl, { message: "artifact url outside the release prefix" }),
    sha256: z.string().regex(/^[0-9a-fA-F]{64}$/),
    size: z.number().int().nonnegative(),
  }),
  treeChecksum: z.string(),
  requires: z.object({
    paseo: z.string().refine((value) => semver.validRange(value) !== null, {
      message: "not a semver range",
    }),
  }),
});

const payloadSchema = z.object({
  schemaVersion: z.literal(1),
  pluginId: z.string(),
  sequence: z.number().int().nonnegative(),
  publishedAt: z.string(),
  channels: z.object({ stable: z.string().nullable(), beta: z.string().nullable() }),
  releases: z.record(z.string(), releaseSchema),
  revoked: z.array(z.object({ version: z.string(), reason: z.string(), revokedAt: z.string() })),
});

const envelopeSchema = z.object({
  schemaVersion: z.literal(1),
  payload: z.string(),
  signatures: z.array(z.object({ keyId: z.string(), alg: z.string(), sig: z.string() })),
});

export type ManifestEnvelope = z.infer<typeof envelopeSchema>;
export type ManifestPayload = z.infer<typeof payloadSchema>;
export type ManifestRelease = z.infer<typeof releaseSchema>;

function isArtifactUrl(value: string): boolean {
  try {
    // URL normalisation resolves dot segments, so a prefix check on `href` is sound.
    const url = new URL(value);
    return (
      url.protocol === "https:" &&
      !url.username &&
      !url.password &&
      url.href.startsWith(ARTIFACT_URL_PREFIX)
    );
  } catch {
    return false;
  }
}

export function parseEnvelope(raw: unknown): ManifestEnvelope {
  return envelopeSchema.parse(raw);
}

/** Parses verified payload bytes. Throws when the payload is not a valid manifest for the plugin. */
export function parsePayload(bytes: Uint8Array, pluginId: string): ManifestPayload {
  const payload = payloadSchema.parse(JSON.parse(Buffer.from(bytes).toString("utf8")));
  if (payload.pluginId !== pluginId) {
    throw new Error(`manifest is for plugin ${payload.pluginId}, expected ${pluginId}`);
  }
  for (const [key, release] of Object.entries(payload.releases)) {
    if (release.version !== key) {
      throw new Error(`release key ${key} does not match its version ${release.version}`);
    }
  }
  return payload;
}

function verifySignature(payload: Buffer, key: TrustedKey, signature: string): boolean {
  try {
    const raw = Buffer.from(key.publicKey, "base64");
    const publicKey = createPublicKey({
      key: { kty: "OKP", crv: "Ed25519", x: raw.toString("base64url") },
      format: "jwk",
    });
    const sig = Buffer.from(signature, "base64");
    return sig.length === 64 && verify(null, payload, publicKey, sig);
  } catch {
    return false;
  }
}

/**
 * Returns the decoded payload bytes when at least one `ed25519` signature from a trusted key
 * verifies over them. Unknown key ids are ignored.
 */
export function verifyEnvelope(
  envelope: ManifestEnvelope,
  trustedKeys: readonly TrustedKey[],
): Uint8Array | null {
  const payload = Buffer.from(envelope.payload, "base64");
  for (const entry of envelope.signatures) {
    if (entry.alg !== "ed25519") continue;
    const key = trustedKeys.find((candidate) => candidate.keyId === entry.keyId);
    if (key && verifySignature(payload, key, entry.sig)) return payload;
  }
  return null;
}

export interface CandidateSelection {
  /** Highest release the channel, revocation and compatibility rules allow, regardless of what is installed. */
  latestAvailable: string | null;
  /** The release to download and stage, if any. */
  candidate: ManifestRelease | null;
  /** Set only when nothing is selectable and a newer release was excluded by `requires.paseo` alone. */
  incompatible: ManifestRelease | null;
}

export function isCompatibleWithDaemon(range: string, daemonVersion: string): boolean {
  const parsed = semver.parse(daemonVersion);
  if (!parsed) return false;
  return semver.satisfies(`${parsed.major}.${parsed.minor}.${parsed.patch}`, range);
}

export function selectCandidate(input: {
  payload: ManifestPayload;
  channel: BuiltinPluginUpdateChannel;
  bundledVersion: string;
  installed: readonly string[];
  failed: readonly string[];
  daemonVersion: string;
}): CandidateSelection {
  const { payload, channel, bundledVersion, installed, failed, daemonVersion } = input;
  const revoked = new Set(payload.revoked.map((entry) => entry.version));
  const failedSet = new Set(failed);
  // A failed version is only replaced by a newer one, so it raises the floor like a good install.
  const floor = [
    bundledVersion,
    ...installed.filter((version) => !revoked.has(version) && !failedSet.has(version)),
    ...failed,
  ].reduce((highest, version) => (semver.gt(version, highest) ? version : highest));

  const inChannel = Object.values(payload.releases)
    .filter((release) => channel === "beta" || release.channel === "stable")
    .filter((release) => !revoked.has(release.version))
    .filter((release) => semver.gt(release.version, bundledVersion))
    .sort((a, b) => semver.rcompare(a.version, b.version));

  const compatible = inChannel.filter((release) =>
    isCompatibleWithDaemon(release.requires.paseo, daemonVersion),
  );
  const incompatible = inChannel.filter((release) => !compatible.includes(release));
  const candidate =
    compatible.find(
      (release) => semver.gt(release.version, floor) && !failedSet.has(release.version),
    ) ?? null;
  const excluded = incompatible.find((release) => semver.gt(release.version, floor)) ?? null;

  return {
    latestAvailable: compatible[0]?.version ?? null,
    candidate,
    incompatible: candidate === null ? excluded : null,
  };
}
