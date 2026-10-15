import { createHash, generateKeyPairSync, sign, type KeyObject } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { mkdir, mkdtemp, readdir, rm, writeFile } from "node:fs/promises";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import os from "node:os";
import path from "node:path";
import { gzipSync } from "node:zlib";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { createTestLogger } from "../../../../test-utils/test-logger.js";
import { BuiltinPluginUpdater } from "./index.js";
import { computeTreeChecksum } from "./tree-checksum.js";
import { MANIFEST_URL, type TrustedKey } from "./trusted-keys.js";

const PREFIX = "https://storage.googleapis.com/zekoder-releases/plugins/zekoder/";
const MANIFEST_PATH = "/zekoder-releases/plugins/zekoder/manifest.json";

// --- tar fixture -----------------------------------------------------------------------------

interface TarEntry {
  name: string;
  type?: "file" | "dir" | "symlink";
  content?: string;
  linkname?: string;
}

function tarHeader(entry: TarEntry): Buffer {
  const header = Buffer.alloc(512);
  const content = Buffer.from(entry.type === "file" || !entry.type ? (entry.content ?? "") : "");
  const typeflags = { file: "0", dir: "5", symlink: "2" };
  const typeflag = typeflags[entry.type ?? "file"];
  header.write(entry.name, 0, "utf8");
  header.write("0000644\0", 100);
  header.write("0000000\0", 108);
  header.write("0000000\0", 116);
  header.write(`${content.length.toString(8).padStart(11, "0")}\0`, 124);
  header.write("00000000000\0", 136);
  header.write("        ", 148);
  header.write(typeflag, 156);
  header.write(entry.linkname ?? "", 157);
  header.write("ustar\0", 257);
  header.write("00", 263);
  let checksum = 0;
  for (const byte of header) checksum += byte;
  header.write(`${checksum.toString(8).padStart(6, "0")}\0 `, 148);
  return header;
}

function buildTarball(entries: TarEntry[]): Buffer {
  const blocks: Buffer[] = [];
  for (const entry of entries) {
    blocks.push(tarHeader(entry));
    if ((entry.type ?? "file") === "file") {
      const content = Buffer.from(entry.content ?? "");
      blocks.push(content, Buffer.alloc((512 - (content.length % 512)) % 512));
    }
  }
  blocks.push(Buffer.alloc(1024));
  return gzipSync(Buffer.concat(blocks));
}

const BASE_FILES: Record<string, string> = {
  "zekoder/paseo-plugin.json": JSON.stringify({ id: "zekoder" }),
  "zekoder/server/index.js": "export default 1;\n",
  "zekoder/client/index.js": "export default 2;\n",
};

function fileEntries(files: Record<string, string>): TarEntry[] {
  return Object.entries(files).map(([name, content]) => ({ name, content }));
}

async function treeChecksumOf(files: Record<string, string>): Promise<string> {
  const dir = await mkdtemp(path.join(os.tmpdir(), "zk-tree-"));
  try {
    for (const [name, content] of Object.entries(files)) {
      const target = path.join(dir, name);
      await mkdir(path.dirname(target), { recursive: true });
      await writeFile(target, content);
    }
    return computeTreeChecksum(path.join(dir, "zekoder"));
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

// --- keys, manifest, server ------------------------------------------------------------------

interface TestKey {
  privateKey: KeyObject;
  trusted: TrustedKey;
}

function makeKey(keyId: string): TestKey {
  const { publicKey, privateKey } = generateKeyPairSync("ed25519");
  const x = publicKey.export({ format: "jwk" }).x as string;
  return {
    privateKey,
    trusted: {
      keyId,
      alg: "ed25519",
      publicKey: Buffer.from(x, "base64url").toString("base64"),
      addedAt: "2026-10-01T00:00:00Z",
    },
  };
}

interface ReleaseSpec {
  version: string;
  channel?: "stable" | "beta";
  requires?: string;
  entries?: TarEntry[];
  files?: Record<string, string>;
  treeFiles?: Record<string, string>;
  url?: string;
  key?: string;
}

interface PublishedRelease {
  version: string;
  tarball: Buffer;
  json: Record<string, unknown>;
}

async function makeRelease(spec: ReleaseSpec): Promise<PublishedRelease> {
  const files = spec.files ?? BASE_FILES;
  const tarball = buildTarball(spec.entries ?? fileEntries(files));
  const treeChecksum = await treeChecksumOf(spec.treeFiles ?? files);
  const url =
    spec.url ?? `${PREFIX}releases/v${spec.version}/zekoder-plugin-v${spec.version}.tar.gz`;
  return {
    version: spec.version,
    tarball,
    json: {
      version: spec.key ?? spec.version,
      tag: `v${spec.version}`,
      channel: spec.channel ?? "stable",
      commit: "abc123",
      publishedAt: "2026-10-01T00:00:00Z",
      artifact: {
        url,
        sha256: createHash("sha256").update(tarball).digest("hex"),
        size: tarball.length,
      },
      treeChecksum,
      requires: { paseo: spec.requires ?? ">=0.9.0" },
    },
  };
}

interface Route {
  status: number;
  body: Buffer | string;
}

class Fixture {
  readonly routes = new Map<string, Route>();
  readonly requests: string[] = [];
  private server!: Server;
  private port = 0;

  async listen(): Promise<void> {
    this.server = createServer((req, res) => {
      this.requests.push(req.url ?? "");
      const route = this.routes.get(req.url ?? "");
      res.statusCode = route?.status ?? 404;
      res.end(route?.body ?? "");
    });
    await new Promise<void>((resolve) => this.server.listen(0, "127.0.0.1", resolve));
    this.port = (this.server.address() as AddressInfo).port;
  }

  async close(): Promise<void> {
    await new Promise<void>((resolve) => this.server.close(() => resolve()));
  }

  fetch: typeof fetch = (input, init) =>
    fetch(
      String(input).replace("https://storage.googleapis.com", `http://127.0.0.1:${this.port}`),
      init,
    );

  artifactRequests(): number {
    return this.requests.filter((url) => url.endsWith(".tar.gz")).length;
  }

  serve(release: PublishedRelease, body?: Buffer | string, status = 200): void {
    const url = new URL((release.json.artifact as { url: string }).url);
    this.routes.set(url.pathname, { status, body: body ?? release.tarball });
  }

  publish(
    input: {
      releases: PublishedRelease[];
      sequence: number;
      revoked?: string[];
      signers?: Array<{ keyId: string; alg?: string; key: KeyObject } | "unknown-junk">;
      pluginId?: string;
      rawPayload?: string;
      serveArtifacts?: boolean;
    },
    defaultSigner: { keyId: string; key: KeyObject },
  ): void {
    const payload =
      input.rawPayload ??
      JSON.stringify({
        schemaVersion: 1,
        pluginId: input.pluginId ?? "zekoder",
        sequence: input.sequence,
        publishedAt: "2026-10-01T00:00:00Z",
        channels: { stable: null, beta: null },
        releases: Object.fromEntries(input.releases.map((r) => [r.version, r.json])),
        revoked: (input.revoked ?? []).map((version) => ({
          version,
          reason: "bad",
          revokedAt: "2026-10-02T00:00:00Z",
        })),
      });
    const payloadBytes = Buffer.from(payload);
    const signers = input.signers ?? [{ keyId: defaultSigner.keyId, key: defaultSigner.key }];
    const signatures = signers.map((signer) =>
      signer === "unknown-junk"
        ? { keyId: "zk-unknown", alg: "ed25519", sig: Buffer.alloc(64).toString("base64") }
        : {
            keyId: signer.keyId,
            alg: signer.alg ?? "ed25519",
            sig: sign(null, payloadBytes, signer.key).toString("base64"),
          },
    );
    this.routes.set(MANIFEST_PATH, {
      status: 200,
      body: JSON.stringify({
        schemaVersion: 1,
        payload: payloadBytes.toString("base64"),
        signatures,
      }),
    });
    if (input.serveArtifacts !== false) {
      for (const release of input.releases) this.serve(release);
    }
  }
}

// --- harness ---------------------------------------------------------------------------------

const fixture = new Fixture();
let home: string;
let key: TestKey;
const KEY_ID = "zk-plugin-2026-10";

beforeEach(async () => {
  await fixture.listen();
  fixture.routes.clear();
  fixture.requests.length = 0;
  home = await mkdtemp(path.join(os.tmpdir(), "zk-updater-"));
  key = makeKey(KEY_ID);
});

afterEach(async () => {
  await fixture.close();
  await rm(home, { recursive: true, force: true });
});

function makeUpdater(
  overrides: Partial<ConstructorParameters<typeof BuiltinPluginUpdater>[0]> = {},
): BuiltinPluginUpdater {
  return new BuiltinPluginUpdater({
    pluginId: "zekoder",
    paseoHome: home,
    bundledVersion: "0.1.0",
    daemonVersion: "0.11.2",
    manifestUrl: MANIFEST_URL,
    trustedKeys: [key.trusted],
    logger: createTestLogger(),
    fetch: fixture.fetch,
    ...overrides,
  });
}

const signer = () => ({ keyId: KEY_ID, key: key.privateKey });
const pluginDir = () => path.join(home, "builtin-plugin-updates", "zekoder");
const readState = () =>
  JSON.parse(readFileSync(path.join(pluginDir(), "state.json"), "utf8")) as {
    installed: string[];
    failed: string[];
    startFailures: Record<string, number>;
    revoked: string[];
    lastCheckAt: string | null;
    lastError: { code: string; message: string } | null;
    latestAvailable: string | null;
    highestSequence: number | null;
  };

async function writeChannel(contents: string): Promise<void> {
  const dir = path.join(home, "builtin-plugin-updates");
  await mkdir(dir, { recursive: true });
  await writeFile(path.join(dir, "desktop-channel.json"), contents);
}

async function checkWith(
  updater: BuiltinPluginUpdater,
  input: Parameters<Fixture["publish"]>[0],
): Promise<void> {
  fixture.publish(input, signer());
  await updater.checkNow();
}

// --- tests -----------------------------------------------------------------------------------

describe("install", () => {
  test("installs a newer stable release and stages it", async () => {
    const updater = makeUpdater();
    const release = await makeRelease({ version: "0.2.0" });
    await checkWith(updater, { releases: [release], sequence: 1 });

    const state = readState();
    expect(state.lastError).toBeNull();
    expect(state.installed).toEqual(["0.2.0"]);
    expect(state.latestAvailable).toBe("0.2.0");
    expect(state.highestSequence).toBe(1);
    expect(state.lastCheckAt).not.toBeNull();

    const installed = path.join(pluginDir(), "0.2.0");
    expect(existsSync(path.join(installed, "paseo-plugin.json"))).toBe(true);
    expect(existsSync(path.join(installed, "zekoder"))).toBe(false);
    expect((await readdir(pluginDir())).filter((name) => name.includes(".staging-"))).toEqual([]);

    expect(updater.getStatus()).toMatchObject({
      stagedVersion: "0.2.0",
      restartRequired: true,
      runningVersion: "0.1.0",
      source: "bundled",
      latestAvailable: "0.2.0",
      lastError: null,
      enabled: true,
    });
    expect(await updater.resolveActive()).toEqual({
      directory: installed,
      version: "0.2.0",
    });
  });

  test("a fresh updater sees the persisted installs", async () => {
    await checkWith(makeUpdater(), {
      releases: [await makeRelease({ version: "0.2.0" })],
      sequence: 1,
    });
    const second = makeUpdater();
    expect(await second.resolveActive()).toEqual({
      directory: path.join(pluginDir(), "0.2.0"),
      version: "0.2.0",
    });
    expect(second.getStatus().stagedVersion).toBe("0.2.0");
  });

  test("does not make a request when no trusted keys are configured", async () => {
    const updater = makeUpdater({ trustedKeys: [] });
    await updater.checkNow();
    updater.start();
    updater.stop();
    expect(fixture.requests).toEqual([]);
    expect(updater.getStatus().enabled).toBe(false);
  });

  test("ignores a release at or below the bundled version", async () => {
    const updater = makeUpdater();
    await checkWith(updater, { releases: [await makeRelease({ version: "0.1.0" })], sequence: 1 });
    expect(fixture.artifactRequests()).toBe(0);
    expect(readState().installed).toEqual([]);
    expect(readState().lastError).toBeNull();
    expect(updater.getStatus().stagedVersion).toBeNull();
  });

  test("keeps the newest three installed versions and removes stray staging dirs", async () => {
    const updater = makeUpdater();
    const stray = path.join(pluginDir(), "0.9.9.staging-old");
    await mkdir(stray, { recursive: true });
    const releases: PublishedRelease[] = [];
    for (const [index, version] of ["0.1.1", "0.1.2", "0.1.3", "0.1.4"].entries()) {
      releases.push(await makeRelease({ version }));
      await checkWith(updater, { releases, sequence: index + 1 });
    }
    expect(readState().installed.sort()).toEqual(["0.1.2", "0.1.3", "0.1.4"]);
    expect((await readdir(pluginDir())).sort()).toEqual(["0.1.2", "0.1.3", "0.1.4", "state.json"]);
  });
});

describe("manifest and signature", () => {
  test("manifest fetch failure", async () => {
    const updater = makeUpdater();
    fixture.routes.set(MANIFEST_PATH, { status: 500, body: "boom" });
    await updater.checkNow();
    expect(readState().lastError?.code).toBe("manifest-fetch-failed");
    expect(readState().lastCheckAt).not.toBeNull();
  });

  test("invalid envelope", async () => {
    const updater = makeUpdater();
    fixture.routes.set(MANIFEST_PATH, { status: 200, body: JSON.stringify({ nope: true }) });
    await updater.checkNow();
    expect(readState().lastError?.code).toBe("manifest-invalid");
  });

  test.each([
    ["garbage payload", { rawPayload: "not json" }],
    ["plugin id mismatch", { pluginId: "other" }],
    ["schema violation", { rawPayload: JSON.stringify({ schemaVersion: 1 }) }],
  ])("invalid payload: %s", async (_name, extra) => {
    const updater = makeUpdater();
    await checkWith(updater, {
      releases: [await makeRelease({ version: "0.2.0" })],
      sequence: 1,
      ...extra,
    });
    expect(readState().lastError?.code).toBe("manifest-invalid");
    expect(readState().installed).toEqual([]);
  });

  test("artifact url outside the release prefix", async () => {
    const updater = makeUpdater();
    const release = await makeRelease({
      version: "0.2.0",
      url: "https://storage.googleapis.com/zekoder-releases/desktop/x.tar.gz",
    });
    await checkWith(updater, { releases: [release], sequence: 1 });
    expect(readState().lastError?.code).toBe("manifest-invalid");
    expect(fixture.artifactRequests()).toBe(0);
  });

  test("release key that differs from its version", async () => {
    const updater = makeUpdater();
    const release = await makeRelease({ version: "0.2.0", key: "0.3.0" });
    await checkWith(updater, { releases: [release], sequence: 1 });
    expect(readState().lastError?.code).toBe("manifest-invalid");
  });

  test.each([
    ["wrong key material", () => [{ keyId: KEY_ID, key: makeKey("x").privateKey }]],
    ["only an untrusted key id", () => [{ keyId: "zk-other", key: key.privateKey }]],
    ["alg other than ed25519", () => [{ keyId: KEY_ID, alg: "rsa", key: key.privateKey }]],
    ["no signatures", () => []],
  ])("signature-invalid: %s", async (_name, signers) => {
    const updater = makeUpdater();
    await checkWith(updater, {
      releases: [await makeRelease({ version: "0.2.0" })],
      sequence: 1,
      signers: signers(),
    });
    const state = readState();
    expect(state.lastError?.code).toBe("signature-invalid");
    expect(state.highestSequence).toBeNull();
    expect(state.installed).toEqual([]);
    expect(state.lastCheckAt).not.toBeNull();
    expect(fixture.artifactRequests()).toBe(0);
  });

  test("an unknown key id beside a valid trusted signature is accepted", async () => {
    const updater = makeUpdater();
    await checkWith(updater, {
      releases: [await makeRelease({ version: "0.2.0" })],
      sequence: 1,
      signers: ["unknown-junk", signer()],
    });
    expect(readState().installed).toEqual(["0.2.0"]);
  });
});

describe("sequence", () => {
  test("a lower sequence is rejected and leaves state untouched", async () => {
    const updater = makeUpdater();
    const first = await makeRelease({ version: "0.2.0" });
    await checkWith(updater, { releases: [first], sequence: 5, revoked: ["0.1.9"] });
    const before = readState();

    const second = await makeRelease({ version: "0.3.0" });
    await checkWith(updater, { releases: [first, second], sequence: 3 });
    const after = readState();
    expect(after.lastError?.code).toBe("sequence-replay");
    expect({ ...after, lastCheckAt: null, lastError: null }).toEqual({
      ...before,
      lastCheckAt: null,
      lastError: null,
    });
    expect(after.highestSequence).toBe(5);
    expect(after.revoked).toEqual(["0.1.9"]);
    expect(after.installed).toEqual(["0.2.0"]);
  });

  test("a higher sequence is persisted with revoked version strings", async () => {
    const updater = makeUpdater();
    const release = await makeRelease({ version: "0.2.0" });
    await checkWith(updater, { releases: [release], sequence: 1 });
    await checkWith(updater, { releases: [release], sequence: 2, revoked: ["0.1.9"] });
    expect(readState().highestSequence).toBe(2);
    expect(readState().revoked).toEqual(["0.1.9"]);
  });

  test("an equal sequence keeps revoked and retries a failed download", async () => {
    const updater = makeUpdater();
    const release = await makeRelease({ version: "0.2.0" });
    fixture.publish(
      { releases: [release], sequence: 4, revoked: ["0.1.9"], serveArtifacts: false },
      signer(),
    );
    fixture.serve(release, "oops", 500);
    await updater.checkNow();
    expect(readState().lastError?.code).toBe("download-failed");
    expect(readState().highestSequence).toBe(4);
    expect(readState().latestAvailable).toBe("0.2.0");
    expect(readState().installed).toEqual([]);

    // Same sequence, anomalous empty revoked list: the held state wins.
    await checkWith(updater, { releases: [release], sequence: 4 });
    const state = readState();
    expect(state.lastError).toBeNull();
    expect(state.installed).toEqual(["0.2.0"]);
    expect(state.revoked).toEqual(["0.1.9"]);
    expect(state.highestSequence).toBe(4);
  });
});

describe("download and unpack", () => {
  test("truncated artifact", async () => {
    const updater = makeUpdater();
    const release = await makeRelease({ version: "0.2.0" });
    fixture.publish({ releases: [release], sequence: 1, serveArtifacts: false }, signer());
    fixture.serve(release, release.tarball.subarray(0, release.tarball.length - 5));
    await updater.checkNow();
    expect(readState().lastError?.code).toBe("size-mismatch");
  });

  test("oversized artifact", async () => {
    const updater = makeUpdater();
    const release = await makeRelease({ version: "0.2.0" });
    fixture.publish({ releases: [release], sequence: 1, serveArtifacts: false }, signer());
    fixture.serve(release, Buffer.concat([release.tarball, Buffer.alloc(64)]));
    await updater.checkNow();
    expect(readState().lastError?.code).toBe("size-mismatch");
  });

  test("right size with different bytes", async () => {
    const updater = makeUpdater();
    const release = await makeRelease({ version: "0.2.0" });
    fixture.publish({ releases: [release], sequence: 1, serveArtifacts: false }, signer());
    const flipped = Buffer.from(release.tarball);
    flipped[flipped.length - 1] ^= 0xff;
    fixture.serve(release, flipped);
    await updater.checkNow();
    expect(readState().lastError?.code).toBe("sha256-mismatch");
    expect(readState().installed).toEqual([]);
  });

  const manifestEntry: TarEntry = {
    name: "zekoder/paseo-plugin.json",
    content: '{"id":"zekoder"}',
  };
  test.each<[string, TarEntry[]]>([
    [
      "symlink entry",
      [manifestEntry, { name: "zekoder/link", type: "symlink", linkname: "/etc/passwd" }],
    ],
    ["path traversal", [manifestEntry, { name: "zekoder/../evil.txt", content: "x" }]],
    ["traversal outside the root", [manifestEntry, { name: "../evil.txt", content: "x" }]],
    ["absolute path", [manifestEntry, { name: "/tmp/evil.txt", content: "x" }]],
    ["extra top-level entry", [manifestEntry, { name: "extra.txt", content: "x" }]],
    ["missing paseo-plugin.json", [{ name: "zekoder/other.txt", content: "x" }]],
    ["wrong plugin id", [{ name: "zekoder/paseo-plugin.json", content: '{"id":"nope"}' }]],
  ])("unpack-failed: %s", async (_name, entries) => {
    const updater = makeUpdater();
    const release = await makeRelease({ version: "0.2.0", entries, files: BASE_FILES });
    await checkWith(updater, { releases: [release], sequence: 1 });
    expect(readState().lastError?.code).toBe("unpack-failed");
    expect(readState().installed).toEqual([]);
    expect(await readdir(pluginDir())).toEqual(["state.json"]);
    expect(existsSync(path.join(home, "builtin-plugin-updates", "evil.txt"))).toBe(false);
  });

  test("tree checksum mismatch when a file differs from what the manifest describes", async () => {
    const updater = makeUpdater();
    const release = await makeRelease({
      version: "0.2.0",
      files: { ...BASE_FILES, "zekoder/server/index.js": "export default 'tampered';\n" },
      treeFiles: BASE_FILES,
    });
    await checkWith(updater, { releases: [release], sequence: 1 });
    expect(readState().lastError?.code).toBe("tree-checksum-mismatch");
    expect(readState().installed).toEqual([]);
    expect(await readdir(pluginDir())).toEqual(["state.json"]);
  });
});

describe("selection", () => {
  test("incompatible requires.paseo is skipped and reported", async () => {
    const updater = makeUpdater();
    await checkWith(updater, {
      releases: [await makeRelease({ version: "0.2.0", requires: ">=99.0.0" })],
      sequence: 1,
    });
    expect(readState().lastError?.code).toBe("incompatible");
    expect(readState().installed).toEqual([]);
    expect(readState().latestAvailable).toBeNull();
    expect(fixture.artifactRequests()).toBe(0);
  });

  test("a compatible lower release is chosen over an incompatible higher one", async () => {
    const updater = makeUpdater();
    await checkWith(updater, {
      releases: [
        await makeRelease({ version: "0.3.0", requires: ">=99.0.0" }),
        await makeRelease({ version: "0.2.0" }),
      ],
      sequence: 1,
    });
    expect(readState().installed).toEqual(["0.2.0"]);
    expect(readState().lastError).toBeNull();
  });

  test("a prerelease daemon satisfies a range through its stable core", async () => {
    const updater = makeUpdater({ daemonVersion: "0.12.0-beta.2" });
    await checkWith(updater, {
      releases: [await makeRelease({ version: "0.2.0", requires: ">=0.12.0" })],
      sequence: 1,
    });
    expect(readState().installed).toEqual(["0.2.0"]);
  });

  test("resolveActive re-checks compatibility against the current daemon", async () => {
    await checkWith(makeUpdater(), {
      releases: [await makeRelease({ version: "0.2.0", requires: ">=0.11.0" })],
      sequence: 1,
    });
    const older = makeUpdater({ daemonVersion: "0.10.0" });
    expect(await older.resolveActive()).toEqual({ fallbackReason: "incompatible" });
    expect(older.getStatus()).toMatchObject({ stagedVersion: null, restartRequired: false });
  });

  test("beta is skipped on the stable channel", async () => {
    const updater = makeUpdater();
    await checkWith(updater, {
      releases: [await makeRelease({ version: "0.2.0-beta.1", channel: "beta" })],
      sequence: 1,
    });
    expect(readState().installed).toEqual([]);
    expect(fixture.artifactRequests()).toBe(0);

    const stable = await makeRelease({ version: "0.1.5" });
    await checkWith(updater, {
      releases: [await makeRelease({ version: "0.2.0-beta.1", channel: "beta" }), stable],
      sequence: 2,
    });
    expect(readState().installed).toEqual(["0.1.5"]);
  });

  test("the beta channel installs a beta, and prefers a newer stable over an older beta", async () => {
    await writeChannel(JSON.stringify({ channel: "beta" }));
    const updater = makeUpdater();
    const beta = await makeRelease({ version: "0.2.0-beta.1", channel: "beta" });
    await checkWith(updater, { releases: [beta], sequence: 1 });
    expect(readState().installed).toEqual(["0.2.0-beta.1"]);

    await checkWith(updater, {
      releases: [beta, await makeRelease({ version: "0.2.0" })],
      sequence: 2,
    });
    expect(readState().installed).toEqual(["0.2.0-beta.1", "0.2.0"]);
    expect(await updater.resolveActive()).toMatchObject({ version: "0.2.0" });
  });

  test.each([
    ["beta", JSON.stringify({ channel: "beta" }), "beta"],
    ["stable", JSON.stringify({ channel: "stable" }), "stable"],
    ["garbage", "{nope", "stable"],
    ["unknown value", JSON.stringify({ channel: "nightly" }), "stable"],
    ["missing", null, "stable"],
  ])("channel file %s", async (_name, contents, expected) => {
    if (contents !== null) await writeChannel(contents);
    const updater = makeUpdater();
    expect(updater.getStatus().channel).toBe(expected);
    await checkWith(updater, { releases: [], sequence: 1 });
    expect(updater.getStatus().channel).toBe(expected);
  });

  test("status channel reports the channel the last check read", async () => {
    const updater = makeUpdater();
    await checkWith(updater, { releases: [], sequence: 1 });
    await writeChannel(JSON.stringify({ channel: "beta" }));
    expect(updater.getStatus().channel).toBe("stable");
    await checkWith(updater, { releases: [], sequence: 2 });
    expect(updater.getStatus().channel).toBe("beta");
  });
});

describe("channel change", () => {
  test("a changed channel file triggers a check on the new channel without waiting", async () => {
    const updater = makeUpdater({ channelPollMs: 10 });
    const beta = await makeRelease({ version: "0.2.0-beta.1", channel: "beta" });
    await checkWith(updater, { releases: [beta], sequence: 1 });
    expect(readState().installed).toEqual([]);

    updater.start();
    try {
      await writeChannel(JSON.stringify({ channel: "beta" }));
      await vi.waitFor(() => expect(readState().installed).toEqual(["0.2.0-beta.1"]), {
        timeout: 5_000,
      });
      expect(updater.getStatus().channel).toBe("beta");
    } finally {
      updater.stop();
    }
  });

  test("an unchanged channel file does not trigger extra checks", async () => {
    const updater = makeUpdater({ channelPollMs: 10 });
    await checkWith(updater, { releases: [], sequence: 1 });
    const before = fixture.requests.length;
    updater.start();
    await new Promise((resolve) => setTimeout(resolve, 100));
    updater.stop();
    expect(fixture.requests.length).toBe(before);
  });
});

describe("revocation, start failures and status", () => {
  test("a revoked downloaded version is dropped for the previous good one", async () => {
    const updater = makeUpdater();
    const older = await makeRelease({ version: "0.2.0" });
    const newer = await makeRelease({ version: "0.3.0" });
    await checkWith(updater, { releases: [older], sequence: 1 });
    await checkWith(updater, { releases: [older, newer], sequence: 2 });
    expect(await updater.resolveActive()).toMatchObject({ version: "0.3.0" });

    await checkWith(updater, { releases: [older, newer], sequence: 3, revoked: ["0.3.0"] });
    expect(readState().revoked).toEqual(["0.3.0"]);
    expect(await updater.resolveActive()).toMatchObject({ version: "0.2.0" });
    expect(updater.getStatus().stagedVersion).toBe("0.2.0");
  });

  test("with no other good copy the result is a revoked fallback and bundled is staged", async () => {
    const updater = makeUpdater();
    const release = await makeRelease({ version: "0.2.0" });
    await checkWith(updater, { releases: [release], sequence: 1 });
    updater.recordRunning({ source: "downloaded", version: "0.2.0", fallbackReason: null });
    expect(updater.getStatus()).toMatchObject({
      runningVersion: "0.2.0",
      source: "downloaded",
      stagedVersion: null,
      restartRequired: false,
    });

    await checkWith(updater, { releases: [release], sequence: 2, revoked: ["0.2.0"] });
    expect(updater.getStatus()).toMatchObject({
      stagedVersion: "0.1.0",
      restartRequired: true,
    });
    expect(await updater.resolveActive()).toEqual({ fallbackReason: "revoked" });
    expect(updater.getStatus().stagedVersion).toBe("0.1.0");
    expect(fixture.artifactRequests()).toBe(1);
  });

  test("one start failure still returns the version, the second marks it failed", async () => {
    const updater = makeUpdater();
    await checkWith(updater, { releases: [await makeRelease({ version: "0.2.0" })], sequence: 1 });

    updater.recordRunning({ source: "downloaded", version: "0.2.0", fallbackReason: null });
    await updater.recordStartFailure("0.2.0", "boom");
    expect(readState().startFailures).toEqual({ "0.2.0": 1 });
    expect(readState().lastError).toMatchObject({ code: "start-failed", message: "boom" });
    expect(await updater.resolveActive()).toMatchObject({ version: "0.2.0" });

    await updater.recordStartFailure("0.2.0", "boom again");
    expect(readState().failed).toEqual(["0.2.0"]);
    expect(await updater.resolveActive()).toEqual({ fallbackReason: "previously-failed" });
    expect(updater.getStatus().stagedVersion).toBe("0.1.0");
  });

  test("a failed version is not downloaded again, only a newer one replaces it", async () => {
    const updater = makeUpdater();
    const failing = await makeRelease({ version: "0.2.0" });
    await checkWith(updater, { releases: [failing], sequence: 1 });
    await updater.recordStartFailure("0.2.0", "x");
    await updater.recordStartFailure("0.2.0", "x");
    const requestsBefore = fixture.artifactRequests();

    await checkWith(updater, { releases: [failing], sequence: 2 });
    expect(fixture.artifactRequests()).toBe(requestsBefore);

    const lower = await makeRelease({ version: "0.1.5" });
    await checkWith(updater, { releases: [failing, lower], sequence: 3 });
    expect(fixture.artifactRequests()).toBe(requestsBefore);

    const newer = await makeRelease({ version: "0.3.0" });
    await checkWith(updater, { releases: [failing, lower, newer], sequence: 4 });
    expect(await updater.resolveActive()).toMatchObject({ version: "0.3.0" });
  });

  test("a successful check clears the last error", async () => {
    const updater = makeUpdater();
    fixture.routes.set(MANIFEST_PATH, { status: 500, body: "" });
    await updater.checkNow();
    expect(updater.getStatus().lastError?.code).toBe("manifest-fetch-failed");
    await checkWith(updater, { releases: [], sequence: 1 });
    expect(updater.getStatus().lastError).toBeNull();
  });

  test("checks never overlap", async () => {
    const updater = makeUpdater();
    fixture.publish({ releases: [await makeRelease({ version: "0.2.0" })], sequence: 1 }, signer());
    await Promise.all([updater.checkNow(), updater.checkNow()]);
    expect(fixture.requests.filter((url) => url === MANIFEST_PATH)).toHaveLength(1);
  });
});
