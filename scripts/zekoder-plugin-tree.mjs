// The Zekoder plugin lives in plugins/zekoder and is the built-in plugin's only source.
// This module is the one place that identifies a version of it: the package.json `version`, and
// the checksum of the staged `files` allowlist (README.md and package.json stay outside it).
//
// The desktop release provenance and the plugin release `build` treeChecksum both use
// computeAllowlistChecksum, so they are equal for the same commit. The daemon ports
// computeTreeChecksum to TypeScript in
// packages/server/src/server/plugins/builtin/updates/tree-checksum.ts; its test pins the two.

import { createHash } from "node:crypto";
import {
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
} from "node:fs";
import { execFileSync } from "node:child_process";
import { tmpdir } from "node:os";
import path from "node:path";

export const PLUGIN_DIRECTORY = "plugins/zekoder";

const SEMVER_PATTERN = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/;

function listFiles(directory) {
  const files = [];
  const walk = (current) => {
    for (const entry of readdirSync(current, { withFileTypes: true })) {
      const entryPath = path.join(current, entry.name);
      if (entry.isDirectory()) {
        walk(entryPath);
      } else if (entry.isFile()) {
        files.push(path.relative(directory, entryPath).split(path.sep).join("/"));
      }
    }
  };
  walk(directory);
  return files.sort();
}

export function computeTreeChecksum(directory) {
  const hash = createHash("sha256");
  for (const relativePath of listFiles(directory)) {
    const content = readFileSync(path.join(directory, ...relativePath.split("/")));
    hash.update(`${relativePath}\0${content.length}\0`);
    hash.update(content);
    hash.update("\0");
  }
  return hash.digest("hex");
}

// Copies exactly the allowlisted entries (files or directories) from sourceDir to targetDir.
export function copyAllowlist(sourceDir, targetDir, files) {
  for (const entry of files) {
    const normalized = path.normalize(entry);
    if (path.isAbsolute(normalized) || normalized.split(path.sep).includes("..")) {
      throw new Error(`Allowlist entry escapes the plugin directory: ${entry}`);
    }
    const source = path.join(sourceDir, normalized);
    if (!existsSync(source)) {
      throw new Error(`Allowlist entry is missing from the source repo: ${entry}`);
    }
    const target = path.join(targetDir, normalized);
    mkdirSync(path.dirname(target), { recursive: true });
    cpSync(source, target, { recursive: true });
  }
}

function readPackageJson(dir) {
  const manifestPath = path.join(dir, "package.json");
  if (!existsSync(manifestPath)) {
    throw new Error(`${manifestPath} is missing.`);
  }
  try {
    return JSON.parse(readFileSync(manifestPath, "utf8"));
  } catch (error) {
    throw new Error(`${manifestPath} is not valid JSON: ${error.message}`, { cause: error });
  }
}

export function readZekoderPluginVersion(dir) {
  const { version } = readPackageJson(dir);
  if (typeof version !== "string" || !SEMVER_PATTERN.test(version)) {
    throw new Error(`${path.join(dir, "package.json")} has no valid semver "version".`);
  }
  return version;
}

// The checksum that identifies a plugin version: the staged `files` allowlist, not the directory.
export function computeAllowlistChecksum(dir) {
  const { files } = readPackageJson(dir);
  if (!Array.isArray(files) || files.length === 0 || files.some((f) => typeof f !== "string")) {
    throw new Error(`${path.join(dir, "package.json")} must list "files" to ship.`);
  }
  const staged = mkdtempSync(path.join(tmpdir(), "zekoder-plugin-staged-"));
  try {
    copyAllowlist(dir, staged, files);
    return computeTreeChecksum(staged);
  } finally {
    rmSync(staged, { recursive: true, force: true });
  }
}

// `git remote get-url origin` without any credentials embedded in an https URL.
function originUrl(git) {
  let url;
  try {
    url = git(["remote", "get-url", "origin"]).trim();
  } catch (error) {
    throw new Error(`Could not read the origin remote: ${error.message}`, { cause: error });
  }
  return url.replace(/^(https?:\/\/)[^/@]+@/, "$1");
}

// Provenance of the plugin at `commit`, computed from the commit's tree and never the working
// tree. `git` runs a git command with an argument array against this repo and returns stdout.
export function zekoderPluginProvenanceAt(git, commit) {
  const sha = git(["rev-parse", "--verify", `${commit}^{commit}`]).trim();
  const workDir = mkdtempSync(path.join(tmpdir(), "zekoder-plugin-tree-"));
  try {
    try {
      // -o keeps the binary archive out of the string-typed git helper.
      git(["archive", "--format=tar", "-o", path.join(workDir, "tree.tar"), sha, PLUGIN_DIRECTORY]);
    } catch (error) {
      throw new Error(`Could not read ${PLUGIN_DIRECTORY} at ${sha}: ${error.message}`, {
        cause: error,
      });
    }
    execFileSync("tar", ["-xf", "tree.tar"], { cwd: workDir });
    const dir = path.join(workDir, ...PLUGIN_DIRECTORY.split("/"));
    return {
      repo: originUrl(git),
      ref: PLUGIN_DIRECTORY,
      commit: sha,
      version: readZekoderPluginVersion(dir),
      checksum: computeAllowlistChecksum(dir),
    };
  } finally {
    rmSync(workDir, { recursive: true, force: true });
  }
}
