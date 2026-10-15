#!/usr/bin/env node
// Zekoder plugin release tooling. Plain Node ESM, no dependencies.
// See docs/release.md ("Zekoder plugin releases").
import {
  createHash,
  createPrivateKey,
  createPublicKey,
  generateKeyPairSync,
  sign as edSign,
  verify as edVerify,
} from "node:crypto";
import { execFileSync } from "node:child_process";
import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, isAbsolute, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  PLUGIN_DIRECTORY,
  computeAllowlistChecksum,
  copyAllowlist,
} from "./zekoder-plugin-tree.mjs";

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(SCRIPT_DIR, "..");
const KEYRING_PATH = join(SCRIPT_DIR, "plugin-release-keys.json");
const URL_PREFIX = "https://storage.googleapis.com/zekoder-releases/plugins/zekoder/";
const NUM = "(0|[1-9][0-9]*)";
const TAG_PREFIX = "zekoder-plugin-v";
const STABLE_RE = new RegExp(`^${TAG_PREFIX}${NUM}\\.${NUM}\\.${NUM}$`);
const BETA_RE = new RegExp(`^${TAG_PREFIX}${NUM}\\.${NUM}\\.${NUM}-beta\\.${NUM}$`);

function fail(msg) {
  console.error(`plugin-release: ${msg}`);
  process.exit(1);
}

function readText(path) {
  return path === "-" ? readFileSync(0, "utf8") : readFileSync(path, "utf8");
}

function parseArgs(argv) {
  const pos = [];
  const opts = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "-") pos.push(a);
    else if (a.startsWith("--")) {
      const v = argv[++i];
      if (v === undefined) fail(`missing value for ${a}`);
      opts[a.slice(2)] = v;
    } else pos.push(a);
  }
  return { pos, opts };
}

// ---------- semver ----------

function parseVersion(v) {
  const m = /^(\d+)\.(\d+)\.(\d+)(?:-beta\.(\d+))?$/.exec(v);
  if (!m) fail(`bad version ${v}`);
  return {
    core: [Number(m[1]), Number(m[2]), Number(m[3])],
    beta: m[4] === undefined ? null : Number(m[4]),
  };
}

function cmpVersion(a, b) {
  const x = parseVersion(a);
  const y = parseVersion(b);
  for (let i = 0; i < 3; i++) if (x.core[i] !== y.core[i]) return x.core[i] - y.core[i];
  if (x.beta === null && y.beta === null) return 0;
  if (x.beta === null) return 1; // stable > its own prereleases
  if (y.beta === null) return -1;
  return x.beta - y.beta;
}

function highest(versions) {
  if (versions.length === 0) return null;
  return versions.reduce((best, v) => (cmpVersion(v, best) > 0 ? v : best));
}

// ---------- repo files ----------

function readPackageVersion(srcDir) {
  return JSON.parse(readFileSync(join(srcDir, "package.json"), "utf8")).version;
}

function readPluginVersionConst(srcDir) {
  const text = readFileSync(join(srcDir, "shared/plugin-version.ts"), "utf8");
  const m = /export const PLUGIN_VERSION = "([^"]+)";/.exec(text);
  if (!m) fail(`PLUGIN_VERSION not found in ${PLUGIN_DIRECTORY}/shared/plugin-version.ts`);
  return m[1];
}

// --src points at a plugin directory other than the repo's own; only the tests use it.
function pluginDir(opts) {
  return resolve(opts.src ?? join(REPO_ROOT, PLUGIN_DIRECTORY));
}

function loadKeyring() {
  const ring = JSON.parse(readFileSync(KEYRING_PATH, "utf8"));
  if (!ring || !Array.isArray(ring.keys) || ring.keys.length === 0) {
    fail("keyring empty — see docs/release.md");
  }
  return ring.keys;
}

// Raw 32-byte Ed25519 public key (standard base64) <-> Node KeyObject.
function publicKeyFromRaw(b64) {
  const raw = Buffer.from(b64, "base64");
  if (raw.length !== 32) fail("public key must decode to 32 bytes");
  return createPublicKey({
    key: { kty: "OKP", crv: "Ed25519", x: raw.toString("base64url") },
    format: "jwk",
  });
}

function rawFromPublicKey(keyObject) {
  return Buffer.from(keyObject.export({ format: "jwk" }).x, "base64url").toString("base64");
}

// ---------- envelope ----------

function decodeEnvelope(envelopeText, { requireKeyring = true } = {}) {
  let env;
  try {
    env = JSON.parse(envelopeText);
  } catch {
    fail("envelope is not valid JSON");
  }
  if (
    !env ||
    env.schemaVersion !== 1 ||
    typeof env.payload !== "string" ||
    !Array.isArray(env.signatures)
  ) {
    fail("envelope malformed");
  }
  const bytes = Buffer.from(env.payload, "base64");
  const keys = requireKeyring ? loadKeyring() : [];
  const ok = env.signatures.some((s) => {
    if (!s || s.alg !== "ed25519") return false;
    const k = keys.find((x) => x.keyId === s.keyId && x.alg === "ed25519");
    if (!k) return false;
    try {
      return edVerify(null, bytes, publicKeyFromRaw(k.publicKey), Buffer.from(s.sig, "base64"));
    } catch {
      return false;
    }
  });
  if (!ok) fail("signature-invalid: no valid signature for this keyring");
  let payload;
  try {
    payload = JSON.parse(bytes.toString("utf8"));
  } catch {
    fail("payload is not valid JSON");
  }
  return payload;
}

function emptyPayload() {
  return { schemaVersion: 1, pluginId: "zekoder", sequence: 0, releases: {}, revoked: [] };
}

function loadCurrent(path) {
  const text = path === "-" || existsSync(path) ? readText(path) : "";
  if (text.trim() === "") return emptyPayload();
  const p = decodeEnvelope(text);
  if (p.pluginId !== "zekoder" || p.schemaVersion !== 1)
    fail("current manifest has unexpected pluginId/schemaVersion");
  return p;
}

function computeChannels(p) {
  const revoked = new Set(p.revoked.map((r) => r.version));
  const live = Object.values(p.releases).filter((r) => !revoked.has(r.version));
  const stable = live.filter((r) => r.channel === "stable").map((r) => r.version);
  return { stable: highest(stable), beta: highest(live.map((r) => r.version)) };
}

function writePayload(p, out) {
  writeFileSync(out, JSON.stringify(p, null, 2) + "\n");
}

function now() {
  return new Date().toISOString().replace(/\.\d{3}Z$/, "Z");
}

// ---------- commands ----------

function cmdCheckTag(tag, opts) {
  if (!tag) fail("usage: check-tag <tag> [--src <dir>]");
  let channel = null;
  if (STABLE_RE.test(tag)) channel = "stable";
  else if (BETA_RE.test(tag)) channel = "beta";
  if (!channel) fail(`tag ${tag} is not ${TAG_PREFIX}X.Y.Z or ${TAG_PREFIX}X.Y.Z-beta.N`);
  const version = tag.slice(TAG_PREFIX.length);
  const srcDir = pluginDir(opts);
  const pkg = readPackageVersion(srcDir);
  const konst = readPluginVersionConst(srcDir);
  if (pkg !== version) fail(`tag ${tag} != ${PLUGIN_DIRECTORY}/package.json version ${pkg}`);
  if (konst !== version) fail(`tag ${tag} != PLUGIN_VERSION ${konst}`);
  console.log(`${version} ${channel}`);
}

function cmdBuild(pos, opts) {
  const [version, outDir] = pos;
  if (!version || !outDir) fail("usage: build <version> <outDir> [--src <dir>]");
  const srcDir = pluginDir(opts);
  const pkg = JSON.parse(readFileSync(join(srcDir, "package.json"), "utf8"));
  if (!Array.isArray(pkg.files) || pkg.files.length === 0)
    fail("package.json has no files allowlist");
  const tmp = mkdtempSync(join(tmpdir(), "zekoder-plugin-"));
  try {
    const stage = join(tmp, "zekoder");
    mkdirSync(stage);
    try {
      copyAllowlist(srcDir, stage, pkg.files);
    } catch (error) {
      fail(error.message);
    }
    mkdirSync(outDir, { recursive: true });
    const file = resolve(outDir, `${TAG_PREFIX}${version}.tar.gz`);
    execFileSync("tar", ["-czf", file, "-C", tmp, "zekoder"]);
    const bytes = readFileSync(file);
    console.log(
      JSON.stringify({
        file,
        sha256: createHash("sha256").update(bytes).digest("hex"),
        size: bytes.byteLength,
        treeChecksum: computeAllowlistChecksum(srcDir),
      }),
    );
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
}

const IDENTITY_KEYS = ["sha256", "size", "treeChecksum", "commit", "requires"];

function identity(r) {
  return JSON.stringify([
    r.artifact?.sha256,
    r.artifact?.size,
    r.treeChecksum,
    r.commit,
    r.requires,
  ]);
}

function cmdNext(opts) {
  if (!opts.current || !opts.release || !opts.out)
    fail("usage: next --current <envelope.json|-> --release <release.json> --out <payload.json>");
  const p = loadCurrent(opts.current);
  const rel = JSON.parse(readFileSync(opts.release, "utf8"));
  for (const k of ["version", "tag", "channel", "commit", "artifact", "treeChecksum"]) {
    if (rel[k] === undefined) fail(`release.json missing ${k}`);
  }
  if (!rel.artifact.url?.startsWith(URL_PREFIX)) fail(`artifact url must start with ${URL_PREFIX}`);
  const pluginManifest = JSON.parse(
    readFileSync(join(pluginDir(opts), "paseo-plugin.json"), "utf8"),
  );
  const paseoReq = pluginManifest.requirements?.paseo;
  if (!paseoReq) fail("paseo-plugin.json requirements.paseo missing");
  const candidate = {
    version: rel.version,
    tag: rel.tag,
    channel: rel.channel,
    commit: rel.commit,
    publishedAt: now(),
    artifact: rel.artifact,
    treeChecksum: rel.treeChecksum,
    requires: { paseo: paseoReq },
  };
  const existing = p.releases[rel.version];
  if (existing) {
    if (identity(existing) === identity(candidate)) {
      console.log("unchanged");
      return;
    }
    fail(
      `version ${rel.version} already published with different content (${IDENTITY_KEYS.join("/")}); abort`,
    );
  }
  p.releases[rel.version] = candidate;
  p.channels = computeChannels(p);
  p.sequence += 1;
  p.publishedAt = candidate.publishedAt;
  writePayload(orderPayload(p), opts.out);
  console.log("updated");
}

function orderPayload(p) {
  return {
    schemaVersion: p.schemaVersion,
    pluginId: p.pluginId,
    sequence: p.sequence,
    publishedAt: p.publishedAt,
    channels: p.channels,
    releases: p.releases,
    revoked: p.revoked,
  };
}

function cmdRevoke(opts) {
  if (!opts.current || !opts.version || !opts.reason || !opts.out) {
    fail(
      "usage: revoke --current <envelope.json> --version <v> --reason <text> --out <payload.json>",
    );
  }
  const p = loadCurrent(opts.current);
  if (!p.releases[opts.version]) fail(`unknown version ${opts.version}`);
  if (p.revoked.some((r) => r.version === opts.version))
    fail(`version ${opts.version} already revoked`);
  const at = now();
  p.revoked.push({ version: opts.version, reason: opts.reason, revokedAt: at });
  p.channels = computeChannels(p);
  p.sequence += 1;
  p.publishedAt = at;
  writePayload(orderPayload(p), opts.out);
  console.log("updated");
}

function cmdSign(payloadPath, outPath) {
  if (!payloadPath || !outPath) fail("usage: sign <payload.json> <out-envelope.json>");
  const keys = loadKeyring();
  const pem = process.env.ZEKODER_PLUGIN_SIGNING_KEY;
  const keyId = process.env.ZEKODER_PLUGIN_SIGNING_KEY_ID;
  if (!pem || !keyId)
    fail("ZEKODER_PLUGIN_SIGNING_KEY and ZEKODER_PLUGIN_SIGNING_KEY_ID are required");
  const entry = keys.find((k) => k.keyId === keyId);
  if (!entry) fail(`key id ${keyId} not in keyring`);
  const priv = createPrivateKey(pem);
  const derived = rawFromPublicKey(createPublicKey(priv));
  if (derived !== entry.publicKey) fail(`private key does not match keyring entry ${keyId}`);
  const bytes = readFileSync(payloadPath);
  const sig = edSign(null, bytes, priv).toString("base64");
  const env = {
    schemaVersion: 1,
    payload: bytes.toString("base64"),
    signatures: [{ keyId, alg: "ed25519", sig }],
  };
  writeFileSync(outPath, JSON.stringify(env, null, 2) + "\n");
  console.log(`signed with ${keyId}`);
}

function cmdVerify(path) {
  if (!path) fail("usage: verify <envelope.json>");
  const p = decodeEnvelope(readFileSync(path, "utf8"));
  console.log(JSON.stringify({ sequence: p.sequence, channels: p.channels }));
}

function cmdKeygen(keyId, privateOut) {
  if (!keyId || !privateOut) fail("usage: keygen <keyId> <privateOut.pem>");
  const out = resolve(privateOut);
  const rel = relative(REPO_ROOT, out);
  if (!(rel.startsWith("..") || isAbsolute(rel)))
    fail("refusing to write the private key inside the repo");
  const { privateKey, publicKey } = generateKeyPairSync("ed25519");
  writeFileSync(out, privateKey.export({ format: "pem", type: "pkcs8" }), { mode: 0o600 });
  chmodSync(out, 0o600);
  console.log(
    JSON.stringify({
      keyId,
      alg: "ed25519",
      publicKey: rawFromPublicKey(publicKey),
      addedAt: new Date().toISOString().slice(0, 10),
    }),
  );
}

const { pos, opts } = parseArgs(process.argv.slice(3));
switch (process.argv[2]) {
  case "check-tag":
    cmdCheckTag(pos[0], opts);
    break;
  case "build":
    cmdBuild(pos, opts);
    break;
  case "next":
    cmdNext(opts);
    break;
  case "revoke":
    cmdRevoke(opts);
    break;
  case "sign":
    cmdSign(pos[0], pos[1]);
    break;
  case "verify":
    cmdVerify(pos[0]);
    break;
  case "keygen":
    cmdKeygen(pos[0], pos[1]);
    break;
  default:
    fail("commands: check-tag build next revoke sign verify keygen");
}
