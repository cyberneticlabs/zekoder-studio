import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import test, { after, before } from "node:test";
import { fileURLToPath } from "node:url";
import { prepareRelease } from "./prepare-release.mjs";
import {
  builderChannel,
  fetchNotes,
  finalizeRelease,
  runPreflight,
  setDesktopVersion,
  verifyPackagedVersion,
  verifyTag,
  writeProvenance,
} from "./release-ci.mjs";
import {
  GOOD_NOTES,
  githubRelease,
  git,
  makeSourceRepo,
  makeTempDir,
  tagHead,
  writeBuildOutputs,
} from "./test-fixtures.mjs";

const REPO = "cyberneticlabs/zekoder-studio";
const TAGGED_AT = "2026-10-10T10:00:00.000Z";
const prepareScript = fileURLToPath(new URL("./prepare-release.mjs", import.meta.url));

let source;
const tempDirs = [];

before(() => {
  source = makeSourceRepo();
});

after(() => {
  for (const dir of [source.dir, ...tempDirs]) rmSync(dir, { force: true, recursive: true });
});

function tempDir() {
  const dir = makeTempDir();
  tempDirs.push(dir);
  return dir;
}

function gitRunner(dir) {
  return (args) => execFileSync("git", args, { cwd: dir, encoding: "utf8" });
}

// Annotated tags take their tagger date from GIT_COMMITTER_DATE, which is what makes the
// published-at value reproducible across reruns of the same tag.
function annotatedTag(tag, date = TAGGED_AT) {
  const previous = process.env.GIT_COMMITTER_DATE;
  process.env.GIT_COMMITTER_DATE = date;
  try {
    tagHead(source.dir, tag);
  } finally {
    if (previous === undefined) delete process.env.GIT_COMMITTER_DATE;
    else process.env.GIT_COMMITTER_DATE = previous;
  }
}

test("builder channel names follow the tag channel", () => {
  assert.equal(builderChannel("stable"), "latest");
  assert.equal(builderChannel("beta"), "beta");
});

test("preflight derives version, channel, source and a rerun-stable published-at", async () => {
  annotatedTag("v1.2.3");
  annotatedTag("v1.2.4-beta.1", "2026-10-11T08:30:15.000Z");
  const run = (tag) =>
    runPreflight({
      tag,
      sha: source.head,
      git: gitRunner(source.dir),
      fetchCatalog: async () => null,
    });

  const stable = await run("v1.2.3");
  assert.deepEqual(stable, {
    tag: "v1.2.3",
    version: "1.2.3",
    channel: "stable",
    builder_channel: "latest",
    prerelease: "false",
    source_sha: source.head,
    published_at: TAGGED_AT,
    upstream_commit: source.upstreamCommit,
    already_published: "false",
  });
  assert.deepEqual(await run("v1.2.3"), stable);

  const beta = await run("v1.2.4-beta.1");
  assert.equal(beta.channel, "beta");
  assert.equal(beta.builder_channel, "beta");
  assert.equal(beta.prerelease, "true");
  assert.equal(beta.published_at, "2026-10-11T08:30:15.000Z");
});

test("preflight rejects anything but strict annotated version tags at the started commit", async () => {
  const git_ = gitRunner(source.dir);
  const run = (tag, sha = source.head) =>
    runPreflight({ tag, sha, git: git_, fetchCatalog: async () => null });

  for (const tag of ["desktop-v1.0.0", "v01.0.0", "v1.0.0-rc.1", "v1.0.0+build", "1.0.0", "main"]) {
    await assert.rejects(run(tag), /Unsupported desktop release tag/, tag);
  }

  git(source.dir, "tag", "v1.5.0");
  await assert.rejects(run("v1.5.0"), /lightweight tag/);
  await assert.rejects(run("v9.9.9"), /does not exist/);
  annotatedTag("v1.2.5");
  await assert.rejects(run("v1.2.5", "0".repeat(40)), /workflow was started for/);
});

test("preflight stops when the upstream sync convention is missing", async () => {
  const noSync = makeSourceRepo({ syncMerge: false });
  tempDirs.push(noSync.dir);
  tagHead(noSync.dir, "v1.0.0");
  await assert.rejects(
    runPreflight({ tag: "v1.0.0", sha: noSync.head, git: gitRunner(noSync.dir) }),
    /No "chore\(sync\): merge upstream paseo" merge commit/,
  );
});

test("preflight detects an already published tag and rejects a moved one", async () => {
  annotatedTag("v1.2.6");
  const catalog = (sourceCommit) => ({ releases: { "v1.2.6": { sourceCommit } } });
  const run = (fetchCatalog) =>
    runPreflight({ tag: "v1.2.6", sha: source.head, git: gitRunner(source.dir), fetchCatalog });

  assert.equal((await run(async () => catalog(source.head))).already_published, "true");
  assert.equal((await run(async () => ({ releases: {} }))).already_published, "false");
  await assert.rejects(
    run(async () => catalog("1".repeat(40))),
    /Release tags are immutable/,
  );
});

test("verify-tag refuses a tag that moved after the build started", () => {
  annotatedTag("v1.2.7");
  const git_ = gitRunner(source.dir);
  assert.equal(verifyTag({ tag: "v1.2.7", sha: source.head, git: git_ }).source_sha, source.head);
  assert.throws(
    () => verifyTag({ tag: "v1.2.7", sha: "2".repeat(40), git: git_ }),
    /Refusing to publish a moved tag/,
  );
});

test("set-version stamps only the desktop manifest and its lock entry", () => {
  const root = tempDir();
  mkdirSync(path.join(root, "packages", "desktop"), { recursive: true });
  writeFileSync(
    path.join(root, "packages", "desktop", "package.json"),
    JSON.stringify({ name: "@getpaseo/desktop", version: "0.11.2" }),
  );
  writeFileSync(
    path.join(root, "package-lock.json"),
    JSON.stringify({
      packages: {
        "": { version: "0.11.2" },
        "packages/desktop": { version: "0.11.2" },
        "packages/app": { version: "0.11.2" },
      },
    }),
  );

  assert.deepEqual(setDesktopVersion({ tag: "v0.1.0-beta.3", root }), { version: "0.1.0-beta.3" });
  const manifest = JSON.parse(readFileSync(path.join(root, "packages/desktop/package.json")));
  const lock = JSON.parse(readFileSync(path.join(root, "package-lock.json")));
  assert.equal(manifest.version, "0.1.0-beta.3");
  assert.equal(lock.packages["packages/desktop"].version, "0.1.0-beta.3");
  assert.equal(lock.packages[""].version, "0.11.2");
  assert.equal(lock.packages["packages/app"].version, "0.11.2");
  assert.throws(() => setDesktopVersion({ tag: "desktop-v0.1.0", root }), /Unsupported/);
});

test("fetch-notes captures only a matching nonempty draft", () => {
  const outputDir = tempDir();
  const fetchWith = (release) => () => release;
  const run = (tag, release) =>
    fetchNotes({ tag, repo: REPO, outputDir, fetchRelease: fetchWith(release) });

  const result = run("v1.0.0", githubRelease("v1.0.0", GOOD_NOTES));
  assert.match(result.release_url, /\/cyberneticlabs\/zekoder-studio\/releases\/tag\/v1\.0\.0$/);
  const captured = JSON.parse(readFileSync(path.join(outputDir, "release.json"), "utf8"));
  assert.equal(captured.body, GOOD_NOTES);
  assert.equal(captured.draft, true);

  assert.throws(() => run("v1.0.0", null), /No GitHub Release/);
  assert.throws(() => run("v1.0.0", githubRelease("v1.0.0", "   ")), /empty/);
  assert.throws(
    () => run("v1.0.0", githubRelease("v1.0.0", GOOD_NOTES, { prerelease: true })),
    /must not be marked as a prerelease/,
  );
  assert.throws(
    () => run("v1.0.0-beta.1", githubRelease("v1.0.0-beta.1", GOOD_NOTES, { prerelease: false })),
    /must be marked as a prerelease/,
  );
  assert.throws(
    () => run("v1.0.0", githubRelease("v1.0.0", GOOD_NOTES, { draft: false })),
    /already published/,
  );
});

test("prepare-release consumes a captured release through --release-json", () => {
  annotatedTag("v1.3.0");
  const notesDir = tempDir();
  fetchNotes({
    tag: "v1.3.0",
    repo: REPO,
    outputDir: notesDir,
    fetchRelease: () => githubRelease("v1.3.0", GOOD_NOTES),
  });
  const input = tempDir();
  const output = tempDir();
  writeBuildOutputs(input, "v1.3.0");

  const stdout = execFileSync(
    process.execPath,
    [
      prepareScript,
      "--tag",
      "v1.3.0",
      "--input",
      input,
      "--output",
      output,
      "--repo",
      REPO,
      "--published-at",
      TAGGED_AT,
      "--source-commit",
      source.head,
      "--release-json",
      path.join(notesDir, "release.json"),
      "--root",
      source.dir,
    ],
    { encoding: "utf8" },
  );
  const candidatePath = stdout.trim();
  assert.ok(existsSync(candidatePath));
  assert.equal(
    readFileSync(path.join(output, "desktop/releases/v1.3.0/release-notes.md"), "utf8"),
    GOOD_NOTES,
  );
});

function fakePackagedTree(root, layout) {
  for (const asarPath of layout) {
    mkdirSync(path.dirname(path.join(root, asarPath)), { recursive: true });
    writeFileSync(path.join(root, asarPath), "asar");
  }
}

test("verify-packaged compares every packaged app.asar manifest with the tag version", () => {
  const releaseDir = tempDir();
  fakePackagedTree(releaseDir, [
    "linux-unpacked/resources/app.asar",
    "mac-arm64/Zekoder.app/Contents/Resources/app.asar",
  ]);
  const versions = (version) => () => ({ version });

  assert.deepEqual(
    verifyPackagedVersion({ tag: "v0.1.0", releaseDir, extractManifest: versions("0.1.0") }),
    { version: "0.1.0", checked: 2 },
  );
  assert.throws(
    () => verifyPackagedVersion({ tag: "v0.1.0", releaseDir, extractManifest: versions("0.11.2") }),
    /packages version 0\.11\.2, expected 0\.1\.0/,
  );
  assert.throws(
    () =>
      verifyPackagedVersion({
        tag: "v0.1.0",
        releaseDir: tempDir(),
        extractManifest: versions("0.1.0"),
      }),
    /No packaged app\.asar/,
  );
});

test("provenance records every output with its digest and the signing policy", () => {
  const dir = tempDir();
  writeFileSync(path.join(dir, "Zekoder-Setup-1.0.0-x64.exe"), "installer");
  writeFileSync(path.join(dir, "latest.yml"), "version: 1.0.0\n");
  const provenance = writeProvenance({
    dir,
    tag: "v1.0.0",
    sha: source.head,
    target: "win32-x64",
    signing: "unsigned",
    runner: "windows-latest",
  });
  assert.equal(provenance.files.length, 2);
  assert.match(provenance.files[0].sha256, /^[0-9a-f]{64}$/);
  assert.equal(
    JSON.parse(readFileSync(path.join(dir, "provenance.json"), "utf8")).signing,
    "unsigned",
  );
  // Rewriting never counts its own previous output.
  assert.equal(
    writeProvenance({
      dir,
      tag: "v1.0.0",
      sha: source.head,
      target: "win32-x64",
      signing: "unsigned",
    }).files.length,
    2,
  );
  assert.throws(
    () =>
      writeProvenance({
        dir: tempDir(),
        tag: "v1.0.0",
        sha: source.head,
        target: "x",
        signing: "x",
      }),
    /No build outputs/,
  );
});

test("finalize publishes the draft only after the catalog lists the tag, and is retryable", async () => {
  annotatedTag("v1.4.0");
  const input = tempDir();
  const output = tempDir();
  writeBuildOutputs(input, "v1.4.0");
  const { candidate } = prepareRelease({
    tag: "v1.4.0",
    inputDir: input,
    outputDir: output,
    repo: REPO,
    publishedAt: TAGGED_AT,
    sourceCommit: source.head,
    rootDir: source.dir,
    fetchRelease: () => githubRelease("v1.4.0", GOOD_NOTES),
  });

  const calls = [];
  const execFileSync_ = (command, args) => calls.push([command, ...args]);
  const run = (release, catalog = candidate, sha = source.head) =>
    finalizeRelease({
      tag: "v1.4.0",
      repo: REPO,
      sha,
      fetchCatalog: async () => catalog,
      fetchRelease: () => release,
      execFileSync: execFileSync_,
    });

  await assert.rejects(run(githubRelease("v1.4.0", GOOD_NOTES), null), /does not list v1.4.0/);
  await assert.rejects(
    run(githubRelease("v1.4.0", GOOD_NOTES), candidate, "3".repeat(40)),
    /not 3333/,
  );
  assert.equal(calls.length, 0);

  const first = await run(githubRelease("v1.4.0", GOOD_NOTES));
  assert.deepEqual(
    { finalized: first.finalized, notesMatch: first.notesMatch },
    { finalized: true, notesMatch: true },
  );
  assert.deepEqual(calls, [
    [
      "gh",
      "release",
      "edit",
      "tag/untagged-v1.4.0".split("/").at(-1),
      "--tag",
      "v1.4.0",
      "--draft=false",
      "--prerelease=false",
      "--repo",
      REPO,
    ],
  ]);

  const retry = await run(githubRelease("v1.4.0", GOOD_NOTES, { draft: false }));
  assert.equal(retry.finalized, false);
  assert.equal(retry.alreadyPublished, true);
  assert.equal(calls.length, 1);

  const edited = await run(
    githubRelease("v1.4.0", `${GOOD_NOTES}\nExtra line.\n`, { draft: false }),
  );
  assert.equal(edited.notesMatch, false);
});
