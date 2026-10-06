// Vendors the Zekoder plugin (zekoder-plugins/paseo) into plugins/zekoder as a Paseo built-in.
//
// The vendored copy is committed and never edited by hand: a fix upstream is a new pin. This
// script is the only writer of plugins/zekoder/ and plugins/zekoder.lock.json. The lock file
// (repo, ref, commit, version, checksum) is the input the release manifest reads to identify
// the bundled revision.
//
// Only the files named by paseo/package.json `files` are copied. Do not add the plugin's own
// tsconfig.json or package.json: a nested tsconfig changes compiler resolution for the whole
// plugin directory.

import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { isMainModule } from "./is-main-module.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const defaultRootDir = path.resolve(__dirname, "..");

export const DEFAULT_REPO = "git@github.com:cyberneticlabs/zekoder-plugins.git";
export const PLUGIN_ID = "zekoder";
const SOURCE_SUBDIRECTORY = "paseo";
const VENDOR_DIRECTORY = path.join("plugins", PLUGIN_ID);
const LOCK_FILE = path.join("plugins", "zekoder.lock.json");

const SHA_PATTERN = /^[0-9a-f]{40}$/;
const CHECKSUM_PATTERN = /^[0-9a-f]{64}$/;
const SEMVER_PATTERN = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/;

function usageAndExit(code = 1) {
  const usage = `
Usage:
  node scripts/sync-zekoder-plugin.mjs --ref <full-sha|tag> [--repo <ssh-url|local-path>]
  node scripts/sync-zekoder-plugin.mjs --check

Sync: clones the zekoder-plugins repo, replaces plugins/zekoder/ with the files listed in
paseo/package.json "files" at the pinned ref, and writes plugins/zekoder.lock.json.
Branch names are rejected; pin a 40-character commit SHA or an existing tag.

Check: offline. Validates the lock file and recomputes the checksum of plugins/zekoder/.

Options:
  --ref <ref>     Required for sync. Full commit SHA or an existing tag.
  --repo <repo>   Source repo. Defaults to ${DEFAULT_REPO}.
  --check         Verify the vendored copy against the lock. Takes no other arguments.
`;
  process.stderr.write(usage.trimStart());
  process.stderr.write("\n");
  process.exit(code);
}

function parseArgs(argv) {
  const args = { check: false, ref: "", repo: "" };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--check") {
      args.check = true;
    } else if (arg === "--ref" || arg === "--repo") {
      const value = argv[index + 1];
      if (!value || value.startsWith("--")) {
        usageAndExit();
      }
      args[arg.slice(2)] = value;
      index += 1;
    } else if (arg === "--help" || arg === "-h") {
      usageAndExit(0);
    } else {
      process.stderr.write(`Unknown argument: ${arg}\n`);
      usageAndExit();
    }
  }
  if (args.check && (args.ref || args.repo)) {
    process.stderr.write("--check takes no other arguments.\n");
    usageAndExit();
  }
  if (!args.check && !args.ref) {
    process.stderr.write("--ref is required.\n");
    usageAndExit();
  }
  return args;
}

function git(cwd, args) {
  return execFileSync("git", args, {
    cwd,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  }).trim();
}

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

export function validateLock(lock) {
  const errors = [];
  if (typeof lock !== "object" || lock === null || Array.isArray(lock)) {
    return ["lock file must be a JSON object"];
  }
  if (typeof lock.repo !== "string" || lock.repo.trim() === "") {
    errors.push("repo must be a non-empty string");
  }
  if (typeof lock.commit !== "string" || !SHA_PATTERN.test(lock.commit)) {
    errors.push("commit must be a 40-character lowercase hex SHA");
  }
  if (typeof lock.ref !== "string" || lock.ref.trim() === "") {
    errors.push("ref must be the commit SHA or a non-empty tag name");
  } else if (SHA_PATTERN.test(lock.ref) && lock.ref !== lock.commit) {
    errors.push("ref is a SHA that differs from commit");
  }
  if (typeof lock.version !== "string" || !SEMVER_PATTERN.test(lock.version)) {
    errors.push("version must be a semver string");
  }
  if (typeof lock.checksum !== "string" || !CHECKSUM_PATTERN.test(lock.checksum)) {
    errors.push("checksum must be a 64-character lowercase hex sha256");
  }
  return errors;
}

export function readLock(rootDir = defaultRootDir) {
  const lockPath = path.join(rootDir, LOCK_FILE);
  if (!existsSync(lockPath)) {
    throw new Error(`Missing ${LOCK_FILE}. Run the sync first.`);
  }
  try {
    return JSON.parse(readFileSync(lockPath, "utf8"));
  } catch (error) {
    throw new Error(`${LOCK_FILE} is not valid JSON: ${error.message}`, { cause: error });
  }
}

// Offline. Returns a list of problems; an empty list means the vendored copy matches the lock.
export function checkZekoderPlugin({ rootDir = defaultRootDir } = {}) {
  let lock;
  try {
    lock = readLock(rootDir);
  } catch (error) {
    return [error.message];
  }
  const errors = validateLock(lock).map((message) => `${LOCK_FILE}: ${message}`);
  const vendorDir = path.join(rootDir, VENDOR_DIRECTORY);
  if (!existsSync(vendorDir)) {
    errors.push(`${VENDOR_DIRECTORY} is missing`);
    return errors;
  }
  const actual = computeTreeChecksum(vendorDir);
  if (CHECKSUM_PATTERN.test(lock.checksum ?? "") && actual !== lock.checksum) {
    errors.push(
      `${VENDOR_DIRECTORY} does not match the lock (expected ${lock.checksum}, got ${actual}). ` +
        "Never edit the vendored copy by hand; re-pin with the sync script.",
    );
  }
  return errors;
}

function resolveCommit(cloneDir, ref) {
  if (SHA_PATTERN.test(ref)) {
    try {
      return git(cloneDir, ["rev-parse", "--verify", `${ref}^{commit}`]);
    } catch (error) {
      throw new Error(`Commit ${ref} is not reachable in the source repo.`, { cause: error });
    }
  }
  try {
    return git(cloneDir, ["rev-parse", "--verify", `refs/tags/${ref}^{commit}`]);
  } catch (error) {
    throw new Error(
      `Ref "${ref}" is neither a full 40-character commit SHA nor an existing tag. ` +
        "Branches and short SHAs are not allowed.",
      { cause: error },
    );
  }
}

export function syncZekoderPlugin({ ref, repo, rootDir = defaultRootDir }) {
  if (!ref) {
    throw new Error("A ref is required.");
  }
  const source = repo || DEFAULT_REPO;
  const isLocalSource = existsSync(source);
  const workDir = mkdtempSync(path.join(tmpdir(), "zekoder-plugin-sync-"));
  try {
    const cloneDir = path.join(workDir, "clone");
    execFileSync("git", ["clone", "--no-checkout", "--quiet", source, cloneDir], {
      stdio: ["ignore", "inherit", "inherit"],
    });
    const commit = resolveCommit(cloneDir, ref);
    git(cloneDir, ["checkout", "--quiet", "--detach", commit]);

    const pluginDir = path.join(cloneDir, SOURCE_SUBDIRECTORY);
    const manifest = JSON.parse(readFileSync(path.join(pluginDir, "package.json"), "utf8"));
    if (!Array.isArray(manifest.files) || manifest.files.length === 0) {
      throw new Error(`${SOURCE_SUBDIRECTORY}/package.json must list "files" to vendor.`);
    }
    if (typeof manifest.version !== "string" || !SEMVER_PATTERN.test(manifest.version)) {
      throw new Error(`${SOURCE_SUBDIRECTORY}/package.json has no valid semver "version".`);
    }
    const pluginManifest = JSON.parse(
      readFileSync(path.join(pluginDir, "paseo-plugin.json"), "utf8"),
    );
    if (pluginManifest.id !== PLUGIN_ID) {
      throw new Error(
        `Expected paseo-plugin.json id "${PLUGIN_ID}", found "${pluginManifest.id}". Stopping.`,
      );
    }

    const staged = path.join(workDir, "staged");
    mkdirSync(staged, { recursive: true });
    copyAllowlist(pluginDir, staged, manifest.files);
    if (!statSync(path.join(staged, "paseo-plugin.json")).isFile()) {
      throw new Error("paseo-plugin.json must be in the vendored file list.");
    }

    const vendorDir = path.join(rootDir, VENDOR_DIRECTORY);
    rmSync(vendorDir, { recursive: true, force: true });
    mkdirSync(path.dirname(vendorDir), { recursive: true });
    cpSync(staged, vendorDir, { recursive: true });

    const lock = {
      // A local path is a developer machine detail; the lock records where the pin lives.
      repo: isLocalSource ? DEFAULT_REPO : source,
      ref,
      commit,
      version: manifest.version,
      checksum: computeTreeChecksum(vendorDir),
    };
    writeFileSync(path.join(rootDir, LOCK_FILE), `${JSON.stringify(lock, null, 2)}\n`);
    return lock;
  } finally {
    rmSync(workDir, { recursive: true, force: true });
  }
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.check) {
    const errors = checkZekoderPlugin();
    if (errors.length > 0) {
      for (const message of errors) {
        process.stderr.write(`${message}\n`);
      }
      process.exit(1);
    }
    process.stdout.write("Vendored Zekoder plugin matches plugins/zekoder.lock.json.\n");
    return;
  }
  try {
    const lock = syncZekoderPlugin({ ref: args.ref, repo: args.repo });
    process.stdout.write(
      `Vendored zekoder ${lock.version} at ${lock.commit} into ${VENDOR_DIRECTORY}.\n`,
    );
  } catch (error) {
    process.stderr.write(`${error.message}\n`);
    process.exit(1);
  }
}

if (isMainModule(import.meta.url)) {
  main();
}
