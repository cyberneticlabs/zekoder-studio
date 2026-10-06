import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import {
  DEFAULT_REPO,
  checkZekoderPlugin,
  computeTreeChecksum,
  syncZekoderPlugin,
  validateLock,
} from "./sync-zekoder-plugin.mjs";

const scriptPath = path.join(import.meta.dirname, "sync-zekoder-plugin.mjs");

function git(cwd, args) {
  return execFileSync("git", args, {
    cwd,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  }).trim();
}

function write(root, relativePath, content) {
  const target = path.join(root, relativePath);
  mkdirSync(path.dirname(target), { recursive: true });
  writeFileSync(target, content);
}

// Builds a source repo shaped like zekoder-plugins: a paseo/ plugin with extras outside "files".
function createSourceRepo(base) {
  const repo = path.join(base, "source");
  mkdirSync(repo, { recursive: true });
  git(repo, ["init", "--quiet", "--initial-branch=main"]);
  git(repo, ["config", "user.email", "test@example.com"]);
  git(repo, ["config", "user.name", "Test"]);
  write(
    repo,
    "paseo/package.json",
    JSON.stringify({
      name: "paseo-zekoder",
      version: "1.2.3",
      files: ["paseo-plugin.json", "index.server.ts", "server/"],
    }),
  );
  write(repo, "paseo/paseo-plugin.json", JSON.stringify({ id: "zekoder" }));
  write(repo, "paseo/index.server.ts", "export default {};\n");
  write(repo, "paseo/server/a.ts", "export const a = 1;\n");
  write(repo, "paseo/tsconfig.json", "{}\n");
  write(repo, "paseo/README.md", "readme\n");
  write(repo, "paseo/package-lock.json", "{}\n");
  write(repo, "other/unrelated.txt", "x\n");
  git(repo, ["add", "-A"]);
  git(repo, ["commit", "--quiet", "-m", "init"]);
  return { repo, commit: git(repo, ["rev-parse", "HEAD"]) };
}

function withFixture(fn) {
  const base = mkdtempSync(path.join(tmpdir(), "zekoder-sync-test-"));
  try {
    const source = createSourceRepo(base);
    const rootDir = path.join(base, "root");
    mkdirSync(path.join(rootDir, "plugins"), { recursive: true });
    return fn({ base, rootDir, ...source });
  } finally {
    rmSync(base, { recursive: true, force: true });
  }
}

test("sync copies only the files allowlist and writes the lock", () => {
  withFixture(({ rootDir, repo, commit }) => {
    const lock = syncZekoderPlugin({ ref: commit, repo, rootDir });

    const vendored = path.join(rootDir, "plugins", "zekoder");
    assert.ok(existsSync(path.join(vendored, "paseo-plugin.json")));
    assert.ok(existsSync(path.join(vendored, "index.server.ts")));
    assert.ok(existsSync(path.join(vendored, "server", "a.ts")));
    for (const extra of ["tsconfig.json", "README.md", "package.json", "package-lock.json"]) {
      assert.equal(existsSync(path.join(vendored, extra)), false, `${extra} must not be vendored`);
    }

    assert.deepEqual(Object.keys(lock), ["repo", "ref", "commit", "version", "checksum"]);
    assert.equal(lock.commit, commit);
    assert.equal(lock.ref, commit);
    assert.equal(lock.version, "1.2.3");
    assert.equal(lock.checksum, computeTreeChecksum(vendored));
    assert.deepEqual(validateLock(lock), []);

    const raw = readFileSync(path.join(rootDir, "plugins", "zekoder.lock.json"), "utf8");
    assert.equal(raw, `${JSON.stringify(lock, null, 2)}\n`);
  });
});

test("lock repo never records a local path and the checksum is stable", () => {
  withFixture(({ rootDir, repo, commit }) => {
    const first = syncZekoderPlugin({ ref: commit, repo, rootDir });
    assert.equal(first.repo, DEFAULT_REPO);
    assert.equal(first.repo.includes(repo), false);
    const second = syncZekoderPlugin({ ref: commit, repo, rootDir });
    assert.equal(second.checksum, first.checksum);
  });
});

test("sync replaces the vendored directory wholesale", () => {
  withFixture(({ rootDir, repo, commit }) => {
    write(rootDir, "plugins/zekoder/stale.ts", "stale\n");
    syncZekoderPlugin({ ref: commit, repo, rootDir });
    assert.equal(existsSync(path.join(rootDir, "plugins", "zekoder", "stale.ts")), false);
  });
});

test("sync accepts an existing tag and rejects branches and short SHAs", () => {
  withFixture(({ rootDir, repo, commit }) => {
    git(repo, ["tag", "v1.2.3"]);
    const lock = syncZekoderPlugin({ ref: "v1.2.3", repo, rootDir });
    assert.equal(lock.ref, "v1.2.3");
    assert.equal(lock.commit, commit);

    assert.throws(() => syncZekoderPlugin({ ref: "main", repo, rootDir }), /not allowed/);
    assert.throws(
      () => syncZekoderPlugin({ ref: commit.slice(0, 12), repo, rootDir }),
      /not allowed/,
    );
  });
});

test("sync stops when the plugin id is not zekoder", () => {
  withFixture(({ rootDir, repo }) => {
    write(repo, "paseo/paseo-plugin.json", JSON.stringify({ id: "other" }));
    git(repo, ["commit", "--quiet", "-am", "rename"]);
    const commit = git(repo, ["rev-parse", "HEAD"]);
    assert.throws(() => syncZekoderPlugin({ ref: commit, repo, rootDir }), /Expected/);
    assert.equal(existsSync(path.join(rootDir, "plugins", "zekoder")), false);
  });
});

test("--check passes offline without --ref and fails on drift", () => {
  withFixture(({ rootDir, repo, commit }) => {
    syncZekoderPlugin({ ref: commit, repo, rootDir });
    assert.deepEqual(checkZekoderPlugin({ rootDir }), []);

    writeFileSync(
      path.join(rootDir, "plugins", "zekoder", "server", "a.ts"),
      "export const a = 2;\n",
    );
    const errors = checkZekoderPlugin({ rootDir });
    assert.equal(errors.length, 1);
    assert.match(errors[0], /does not match the lock/);
  });
});

test("--check fails on a malformed lock field", () => {
  withFixture(({ rootDir, repo, commit }) => {
    const lock = syncZekoderPlugin({ ref: commit, repo, rootDir });
    const lockPath = path.join(rootDir, "plugins", "zekoder.lock.json");
    for (const [field, value, pattern] of [
      ["commit", "abc123", /commit/],
      ["version", "one", /version/],
      ["checksum", "zz", /checksum/],
      ["repo", "", /repo/],
      ["ref", "", /ref/],
    ]) {
      writeFileSync(lockPath, JSON.stringify({ ...lock, [field]: value }));
      const errors = checkZekoderPlugin({ rootDir });
      assert.ok(
        errors.some((message) => pattern.test(message)),
        `${field} should be reported: ${errors.join("; ")}`,
      );
    }
  });
});

test("CLI rejects --check with other arguments and a missing --ref", () => {
  const run = (args) => {
    try {
      execFileSync("node", [scriptPath, ...args], { stdio: "pipe" });
      return 0;
    } catch (error) {
      return error.status;
    }
  };
  assert.notEqual(run(["--check", "--ref", "main"]), 0);
  assert.notEqual(run([]), 0);
});
