// Local fixtures for the desktop release tests: electron-builder style build outputs, a real
// throwaway git repository with the upstream-sync convention, and an in-memory GCS JSON API
// served over loopback HTTP so the publisher is exercised without any cloud access.
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import http from "node:http";
import { tmpdir } from "node:os";
import path from "node:path";
import { dump } from "js-yaml";
import { DESKTOP_TARGETS, feedFilename, requiredPayloads } from "./release-data.mjs";

export function makeTempDir(prefix = "zekoder-desktop-release-") {
  return mkdtempSync(path.join(tmpdir(), prefix));
}

function payloadBytes(version, target, name) {
  return Buffer.from(`payload ${version} ${target.platform}/${target.arch} ${name}`);
}

// Writes <root>/<platform>-<arch>/ with every required payload, its blockmap where required,
// and a builder feed with correct SHA512/size references.
export function writeBuildOutputs(root, tag, { mutate } = {}) {
  const version = tag.slice(1);
  const channel = version.includes("-beta.") ? "beta" : "stable";
  for (const target of DESKTOP_TARGETS) {
    const dir = path.join(root, `${target.platform}-${target.arch}`);
    mkdirSync(dir, { recursive: true });
    const files = [];
    for (const required of requiredPayloads(target, version)) {
      const name = concreteName(required.pattern, version);
      const bytes = payloadBytes(version, target, name);
      writeFileSync(path.join(dir, name), bytes);
      files.push({ name, bytes, required });
    }
    const referenced = files.filter((file) => file.required.feedReferenced);
    const feed = {
      version,
      files: referenced.map((file) => ({
        url: file.name,
        sha512: createHash("sha512").update(file.bytes).digest("base64"),
        size: file.bytes.length,
      })),
      path: referenced[0].name,
      sha512: createHash("sha512").update(referenced[0].bytes).digest("base64"),
      releaseDate: "2020-01-01T00:00:00.000Z",
    };
    writeFileSync(path.join(dir, feedFilename(target.platform, channel)), dump(feed));
  }
  mutate?.(root);
}

// Patterns are anchored literals, optionally with a (x64|amd64)-style alternation.
function concreteName(pattern, version) {
  return pattern.source
    .replace(/^\^|\$$/g, "")
    .replace(/\(\?:([^|)]+)\|[^)]+\)/g, "$1")
    .replace(/\\\./g, ".")
    .replace(/\\\+/g, "+")
    .replace(/\\-/g, "-")
    .replace(version.replace(/\./g, "\\."), version);
}

export function git(cwd, ...args) {
  return execFileSync(
    "git",
    [
      "-c",
      "user.name=Test",
      "-c",
      "user.email=test@example.com",
      "-c",
      "commit.gpgsign=false",
      "-c",
      "tag.gpgsign=false",
      ...args,
    ],
    { cwd, encoding: "utf8" },
  ).trim();
}

export const FIXTURE_LOCK = {
  repo: "git@github.com:cyberneticlabs/zekoder-plugins.git",
  ref: "v0.11.1",
  commit: "380f37b044eb5591ae551773256c5a915d7bc5f0",
  version: "0.11.1",
  checksum: "1b15aeccbfd8c9eb7381b9c651b5b5958bbb342e78bc0a6b66a75ca52ff43c97",
};

// main: base -> [upstream branch commit merged by a conventional sync merge] -> later work.
// Returns the commits so tests can assert provenance.
export function makeSourceRepo({ syncMerge = true, lock = FIXTURE_LOCK } = {}) {
  const dir = makeTempDir("zekoder-desktop-source-");
  git(dir, "init", "-q", "-b", "main");
  mkdirSync(path.join(dir, "plugins"));
  writeFileSync(
    path.join(dir, "plugins", "zekoder.lock.json"),
    `${JSON.stringify(lock, null, 2)}\n`,
  );
  writeFileSync(path.join(dir, "a.txt"), "a");
  git(dir, "add", "-A");
  git(dir, "commit", "-q", "-m", "base");
  let upstreamCommit = null;
  if (syncMerge) {
    git(dir, "checkout", "-q", "-b", "upstream");
    writeFileSync(path.join(dir, "upstream.txt"), "u");
    git(dir, "add", "-A");
    git(dir, "commit", "-q", "-m", "upstream work");
    upstreamCommit = git(dir, "rev-parse", "HEAD");
    git(dir, "checkout", "-q", "main");
    writeFileSync(path.join(dir, "local.txt"), "l");
    git(dir, "add", "-A");
    git(dir, "commit", "-q", "-m", "local work");
    git(
      dir,
      "merge",
      "-q",
      "--no-ff",
      "upstream",
      "-m",
      "chore(sync): merge upstream paseo main (v0.11.0)",
    );
  }
  writeFileSync(path.join(dir, "later.txt"), "x");
  git(dir, "add", "-A");
  git(dir, "commit", "-q", "-m", "release prep");
  return { dir, upstreamCommit, head: git(dir, "rev-parse", "HEAD") };
}

export function tagHead(dir, tag) {
  git(dir, "tag", "-a", tag, "-m", tag);
}

export function githubRelease(tag, body, overrides = {}) {
  return {
    id: 1,
    draft: true,
    prerelease: tag.includes("-beta."),
    tag_name: tag,
    body,
    html_url: `https://github.com/cyberneticlabs/zekoder-studio/releases/tag/untagged-${tag}`,
    ...overrides,
  };
}

export const GOOD_NOTES =
  "## What is new\n\n- A refreshed project switcher.\n- Faster startup.\n\nSecurity and performance improvements throughout.\n";

// In-memory Google Cloud Storage JSON API: media reads, resumable uploads, generation
// preconditions. `hooks.beforeFinalize(name, state)` runs before an upload commits so a test
// can race another writer; `rejectUploads` makes named objects fail permanently.
export async function startFakeGcs({ bucket = "zekoder-releases", token = "test-token" } = {}) {
  const objects = new Map();
  const sessions = new Map();
  const log = [];
  let counter = 0;
  const state = {
    objects,
    log,
    hooks: { beforeFinalize: null },
    rejectUploads: new Set(),
    authFailures: 0,
  };

  function put(name, bytes, meta = {}) {
    counter += 1;
    objects.set(name, { bytes, generation: counter, ...meta });
  }

  function preconditionHolds(name, ifGenerationMatch) {
    const current = objects.get(name);
    return ifGenerationMatch === 0 ? !current : current?.generation === ifGenerationMatch;
  }

  const server = http.createServer((req, res) => {
    const url = new URL(req.url, "http://localhost");
    // Resumable session URIs are pre-authorized by the initiating request, as in real GCS.
    const isSession = url.pathname.startsWith("/upload/session/");
    if (!isSession && req.headers.authorization !== `Bearer ${token}`) {
      state.authFailures += 1;
      res.writeHead(401).end("bad token");
      return;
    }
    const prefix = `/storage/v1/b/${bucket}/o/`;
    if (req.method === "GET" && url.pathname.startsWith(prefix)) {
      const name = decodeURIComponent(url.pathname.slice(prefix.length));
      const object = objects.get(name);
      if (!object) return void res.writeHead(404).end("not found");
      res.writeHead(200, { "x-goog-generation": String(object.generation) });
      return void res.end(object.bytes);
    }
    if (req.method === "POST" && url.pathname === `/upload/storage/v1/b/${bucket}/o`) {
      const name = url.searchParams.get("name");
      const ifGenerationMatch = Number(url.searchParams.get("ifGenerationMatch"));
      req.resume();
      req.on("end", () => {
        log.push({ op: "init", name, ifGenerationMatch });
        if (state.rejectUploads.has(name)) return void res.writeHead(403).end("denied");
        if (!preconditionHolds(name, ifGenerationMatch)) {
          return void res.writeHead(412).end("precondition failed");
        }
        const id = String(sessions.size + 1);
        sessions.set(id, { name, ifGenerationMatch });
        res
          .writeHead(200, { Location: `http://${req.headers.host}/upload/session/${id}` })
          .end("{}");
      });
      return;
    }
    if (req.method === "PUT" && url.pathname.startsWith("/upload/session/")) {
      const session = sessions.get(url.pathname.split("/").pop());
      const chunks = [];
      req.on("data", (chunk) => chunks.push(chunk));
      req.on("end", () => {
        state.hooks.beforeFinalize?.(session.name, state);
        if (!preconditionHolds(session.name, session.ifGenerationMatch)) {
          return void res.writeHead(412).end("precondition failed");
        }
        log.push({ op: "write", name: session.name, ifGenerationMatch: session.ifGenerationMatch });
        put(session.name, Buffer.concat(chunks));
        res.writeHead(200).end("{}");
      });
      return;
    }
    res.writeHead(404).end("unknown route");
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  return {
    ...state,
    base,
    bucket,
    token,
    put,
    close: () => new Promise((resolve) => server.close(resolve)),
  };
}
