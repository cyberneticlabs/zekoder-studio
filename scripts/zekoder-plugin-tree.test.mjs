import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { after, test } from "node:test";
import { fileURLToPath } from "node:url";
import {
  computeAllowlistChecksum,
  computeTreeChecksum,
  copyAllowlist,
  readZekoderPluginVersion,
  zekoderPluginProvenanceAt,
} from "./zekoder-plugin-tree.mjs";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const tempDirs = [];

after(() => {
  for (const dir of tempDirs) rmSync(dir, { recursive: true, force: true });
});

function tempDir(prefix) {
  const dir = mkdtempSync(path.join(tmpdir(), prefix));
  tempDirs.push(dir);
  return dir;
}

function write(root, relativePath, content) {
  const target = path.join(root, ...relativePath.split("/"));
  mkdirSync(path.dirname(target), { recursive: true });
  writeFileSync(target, content);
}

function gitIn(cwd) {
  return (args) =>
    execFileSync(
      "git",
      [
        "-c",
        "user.name=Test",
        "-c",
        "user.email=t@example.com",
        "-c",
        "commit.gpgsign=false",
        ...args,
      ],
      { cwd, encoding: "utf8" },
    );
}

function makePlugin(version = "1.2.3") {
  const dir = tempDir("zekoder-plugin-fixture-");
  write(dir, "paseo-plugin.json", '{"id":"zekoder"}\n');
  write(dir, "index.server.ts", "export {};\n");
  write(dir, "shared/value.ts", "export const value = 1;\n");
  write(dir, "README.md", "readme\n");
  write(
    dir,
    "package.json",
    `${JSON.stringify({
      name: "paseo-zekoder",
      version,
      private: true,
      type: "module",
      files: ["paseo-plugin.json", "index.server.ts", "shared/"],
    })}\n`,
  );
  return dir;
}

test("README and package.json changes leave the allowlist checksum unchanged", () => {
  const dir = makePlugin();
  const before = computeAllowlistChecksum(dir);
  write(dir, "README.md", "changed readme\n");
  write(
    dir,
    "package.json",
    `${JSON.stringify({
      name: "paseo-zekoder",
      version: "9.9.9",
      private: true,
      type: "module",
      files: ["paseo-plugin.json", "index.server.ts", "shared/"],
    })}\n`,
  );
  assert.equal(computeAllowlistChecksum(dir), before);
  assert.notEqual(computeTreeChecksum(dir), before);
});

test("a file change under shared/ changes the allowlist checksum", () => {
  const dir = makePlugin();
  const before = computeAllowlistChecksum(dir);
  write(dir, "shared/value.ts", "export const value = 2;\n");
  assert.notEqual(computeAllowlistChecksum(dir), before);
});

test("copyAllowlist rejects escaping and missing entries", () => {
  const dir = makePlugin();
  assert.throws(() => copyAllowlist(dir, tempDir("target-"), ["../x"]), /escapes/);
  assert.throws(() => copyAllowlist(dir, tempDir("target-"), ["nope.ts"]), /missing/);
});

test("readZekoderPluginVersion returns the semver and throws on a bad version", () => {
  assert.equal(readZekoderPluginVersion(makePlugin("0.12.0-beta.1")), "0.12.0-beta.1");
  assert.throws(() => readZekoderPluginVersion(makePlugin("main")), /semver/);
  assert.throws(() => readZekoderPluginVersion(tempDir("empty-")), /missing/);
});

test("the in-repo plugin version matches PLUGIN_VERSION", () => {
  const dir = path.join(repoRoot, "plugins", "zekoder");
  const version = readZekoderPluginVersion(dir);
  const source = readFileSync(path.join(dir, "shared", "plugin-version.ts"), "utf8");
  assert.match(source, new RegExp(`PLUGIN_VERSION = "${version.replace(/[.+]/g, "\\$&")}"`));
});

test("provenance is computed from the commit tree, not the working tree", () => {
  const root = tempDir("zekoder-plugin-repo-");
  const git = gitIn(root);
  git(["init", "-q", "-b", "main"]);
  git(["remote", "add", "origin", "https://user:token@github.com/example/studio.git"]);
  const pluginDir = path.join(root, "plugins", "zekoder");
  mkdirSync(pluginDir, { recursive: true });
  const names = ["paseo-plugin.json", "index.server.ts", "shared", "README.md", "package.json"];
  copyAllowlist(makePlugin("0.5.0"), pluginDir, names);
  git(["add", "-A"]);
  git(["commit", "-q", "-m", "plugin"]);
  const commit = git(["rev-parse", "HEAD"]).trim();
  const expected = computeAllowlistChecksum(pluginDir);

  // A dirty working tree must not leak into the result.
  write(root, "plugins/zekoder/shared/value.ts", "export const value = 99;\n");

  assert.deepEqual(zekoderPluginProvenanceAt(git, commit), {
    repo: "https://github.com/example/studio.git",
    ref: "plugins/zekoder",
    commit,
    version: "0.5.0",
    checksum: expected,
  });
});

test("provenance rejects a commit without the plugin", () => {
  const root = tempDir("zekoder-plugin-empty-repo-");
  const git = gitIn(root);
  git(["init", "-q", "-b", "main"]);
  write(root, "a.txt", "a");
  git(["add", "-A"]);
  git(["commit", "-q", "-m", "base"]);
  assert.throws(() => zekoderPluginProvenanceAt(git, "HEAD"), /Could not read plugins\/zekoder/);
});
