import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import {
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { computeAllowlistChecksum } from "./zekoder-plugin-tree.mjs";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const pluginDir = path.join(repoRoot, "plugins/zekoder");
const releaseScript = path.join(repoRoot, "scripts/plugin-release.mjs");
const keyringPath = path.join(repoRoot, "scripts/plugin-release-keys.json");
const trustedKeysPath = path.join(
  repoRoot,
  "packages/server/src/server/plugins/builtin/updates/trusted-keys.ts",
);

function run(script, args, env = {}) {
  const result = spawnSync(process.execPath, [script, ...args], {
    encoding: "utf8",
    env: { ...process.env, ...env },
  });
  return { status: result.status, stdout: result.stdout.trim(), stderr: result.stderr.trim() };
}

function withTempDir(callback) {
  const dir = mkdtempSync(path.join(tmpdir(), "plugin-release-test-"));
  try {
    return callback(dir);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

// A throwaway plugin directory with the given version in package.json and PLUGIN_VERSION.
function writePlugin(
  dir,
  { packageVersion, constVersion, files = ["paseo-plugin.json", "shared/"] },
) {
  mkdirSync(path.join(dir, "shared"), { recursive: true });
  writeFileSync(
    path.join(dir, "package.json"),
    JSON.stringify({ name: "fixture", version: packageVersion, files }),
  );
  writeFileSync(
    path.join(dir, "paseo-plugin.json"),
    JSON.stringify({ id: "zekoder", requirements: { paseo: ">=0.9.2" } }),
  );
  writeFileSync(
    path.join(dir, "shared/plugin-version.ts"),
    `export const PLUGIN_VERSION = "${constVersion}";\n`,
  );
  writeFileSync(path.join(dir, "README.md"), "docs\n");
}

test("check-tag accepts the stable and beta tag forms", () => {
  withTempDir((dir) => {
    writePlugin(dir, { packageVersion: "1.2.3", constVersion: "1.2.3" });
    const stable = run(releaseScript, ["check-tag", "zekoder-plugin-v1.2.3", "--src", dir]);
    assert.deepEqual([stable.status, stable.stdout], [0, "1.2.3 stable"]);

    writePlugin(dir, { packageVersion: "1.2.3-beta.4", constVersion: "1.2.3-beta.4" });
    const beta = run(releaseScript, ["check-tag", "zekoder-plugin-v1.2.3-beta.4", "--src", dir]);
    assert.deepEqual([beta.status, beta.stdout], [0, "1.2.3-beta.4 beta"]);
  });
});

test("check-tag rejects the desktop tag grammar and malformed tags", () => {
  withTempDir((dir) => {
    writePlugin(dir, { packageVersion: "1.2.3", constVersion: "1.2.3" });
    for (const tag of [
      "v1.2.3",
      "v1.2.3-beta.1",
      "zekoder-plugin-1.2.3",
      "zekoder-plugin-v1.2",
      "zekoder-plugin-v01.2.3",
      "zekoder-plugin-v1.2.3-rc.1",
      "zekoder-plugin-v1.2.3-beta",
    ]) {
      const result = run(releaseScript, ["check-tag", tag, "--src", dir]);
      assert.equal(result.status, 1, tag);
      assert.match(result.stderr, /is not zekoder-plugin-vX\.Y\.Z/, tag);
    }
  });
});

test("check-tag fails when the tag, package.json and PLUGIN_VERSION disagree", () => {
  withTempDir((dir) => {
    writePlugin(dir, { packageVersion: "1.2.4", constVersion: "1.2.3" });
    const packageMismatch = run(releaseScript, [
      "check-tag",
      "zekoder-plugin-v1.2.3",
      "--src",
      dir,
    ]);
    assert.equal(packageMismatch.status, 1);
    assert.match(packageMismatch.stderr, /package\.json version 1\.2\.4/);

    writePlugin(dir, { packageVersion: "1.2.3", constVersion: "1.2.4" });
    const constMismatch = run(releaseScript, ["check-tag", "zekoder-plugin-v1.2.3", "--src", dir]);
    assert.equal(constMismatch.status, 1);
    assert.match(constMismatch.stderr, /PLUGIN_VERSION 1\.2\.4/);
  });
});

test("check-tag accepts the version this checkout ships", () => {
  const { version } = JSON.parse(readFileSync(path.join(pluginDir, "package.json"), "utf8"));
  const channel = version.includes("-beta.") ? "beta" : "stable";
  const result = run(releaseScript, ["check-tag", `zekoder-plugin-v${version}`]);
  assert.deepEqual([result.status, result.stdout], [0, `${version} ${channel}`]);
});

test("build stages exactly the files allowlist and reports the desktop provenance checksum", () => {
  withTempDir((out) => {
    const result = run(releaseScript, ["build", "9.9.9", out]);
    assert.equal(result.status, 0, result.stderr);
    const report = JSON.parse(result.stdout);
    assert.equal(report.file, path.join(out, "zekoder-plugin-v9.9.9.tar.gz"));
    assert.equal(report.treeChecksum, computeAllowlistChecksum(pluginDir));

    const entries = execFileSync("tar", ["-tzf", report.file], { encoding: "utf8" })
      .split("\n")
      .filter(Boolean)
      .map((entry) => entry.replace(/\/$/, ""));
    assert.ok(entries.every((entry) => entry === "zekoder" || entry.startsWith("zekoder/")));
    assert.ok(entries.includes("zekoder/paseo-plugin.json"));
    assert.ok(entries.includes("zekoder/index.server.ts"));
    assert.ok(!entries.includes("zekoder/README.md"));
    assert.ok(!entries.includes("zekoder/package.json"));
    assert.ok(!entries.some((entry) => entry.includes("node_modules")));
  });
});

test("build fails clearly when an allowlist entry is missing", () => {
  withTempDir((dir) => {
    const src = path.join(dir, "src");
    writePlugin(src, {
      packageVersion: "1.0.0",
      constVersion: "1.0.0",
      files: ["paseo-plugin.json", "missing/"],
    });
    const result = run(releaseScript, ["build", "1.0.0", path.join(dir, "out"), "--src", src]);
    assert.equal(result.status, 1);
    assert.match(result.stderr, /plugin-release: .*missing/);
  });
});

test("sign then verify round-trips with a generated key", () => {
  withTempDir((dir) => {
    // The script resolves its keyring next to itself, so a copy gets a keyring of its own.
    const scriptsDir = path.join(dir, "repo/scripts");
    mkdirSync(scriptsDir, { recursive: true });
    for (const file of ["plugin-release.mjs", "zekoder-plugin-tree.mjs"]) {
      cpSync(path.join(repoRoot, "scripts", file), path.join(scriptsDir, file));
    }
    const script = path.join(scriptsDir, "plugin-release.mjs");
    const privateKeyPath = path.join(dir, "private.pem");

    const keygen = run(script, ["keygen", "zk-plugin-test", privateKeyPath]);
    assert.equal(keygen.status, 0, keygen.stderr);
    const entry = JSON.parse(keygen.stdout);
    writeFileSync(
      path.join(scriptsDir, "plugin-release-keys.json"),
      JSON.stringify({ keys: [entry] }),
    );

    const payloadPath = path.join(dir, "payload.json");
    const envelopePath = path.join(dir, "envelope.json");
    writeFileSync(payloadPath, JSON.stringify({ schemaVersion: 1, sequence: 3, channels: {} }));
    const signEnv = {
      ZEKODER_PLUGIN_SIGNING_KEY: readFileSync(privateKeyPath, "utf8"),
      ZEKODER_PLUGIN_SIGNING_KEY_ID: "zk-plugin-test",
    };
    const signed = run(script, ["sign", payloadPath, envelopePath], signEnv);
    assert.deepEqual([signed.status, signed.stdout], [0, "signed with zk-plugin-test"]);
    const verified = run(script, ["verify", envelopePath]);
    assert.equal(verified.status, 0, verified.stderr);
    assert.equal(JSON.parse(verified.stdout).sequence, 3);

    // A tampered payload no longer verifies.
    const envelope = JSON.parse(readFileSync(envelopePath, "utf8"));
    envelope.payload = Buffer.from(JSON.stringify({ schemaVersion: 1, sequence: 4 })).toString(
      "base64",
    );
    writeFileSync(envelopePath, JSON.stringify(envelope));
    const tampered = run(script, ["verify", envelopePath]);
    assert.equal(tampered.status, 1);
    assert.match(tampered.stderr, /signature-invalid/);

    // A key that is not in the keyring cannot sign.
    const foreign = run(script, ["sign", payloadPath, envelopePath], {
      ...signEnv,
      ZEKODER_PLUGIN_SIGNING_KEY_ID: "zk-plugin-other",
    });
    assert.equal(foreign.status, 1);
    assert.match(foreign.stderr, /not in keyring/);
    assert.ok(existsSync(envelopePath));
  });
});

test("keygen refuses to write the private key inside the repo", () => {
  const result = run(releaseScript, ["keygen", "zk-plugin-test", path.join(repoRoot, "stray.pem")]);
  assert.equal(result.status, 1);
  assert.match(result.stderr, /inside the repo/);
  assert.ok(!existsSync(path.join(repoRoot, "stray.pem")));
});

test("the daemon's TRUSTED_KEYS equal the release keyring", () => {
  const { keys } = JSON.parse(readFileSync(keyringPath, "utf8"));
  const source = readFileSync(trustedKeysPath, "utf8");
  const trusted = [
    ...source.matchAll(
      /keyId: "([^"]+)",\s*alg: "([^"]+)",\s*publicKey: "([^"]+)",\s*addedAt: "([^"]+)",/g,
    ),
  ].map(([, keyId, alg, publicKey, addedAt]) => ({ keyId, alg, publicKey, addedAt }));
  assert.ok(keys.length > 0);
  assert.deepEqual(trusted, keys);
});
