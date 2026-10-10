import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { existsSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import test, { after, before } from "node:test";
import { load } from "js-yaml";
import {
  CatalogConflictError,
  ImmutableMismatchError,
  publishRelease,
} from "./publish-release.mjs";
import { prepareRelease } from "./prepare-release.mjs";
import {
  CATALOG_OBJECT,
  DESKTOP_TARGETS,
  compareDesktopTags,
  feedFilenames,
  mergeRelease,
  objectNameFromUrl,
  parseDesktopTag,
  resolveUpstreamCommit,
  validateCatalog,
  validateReleaseNotes,
} from "./release-data.mjs";
import {
  FIXTURE_LOCK,
  GOOD_NOTES,
  githubRelease,
  git,
  makeSourceRepo,
  makeTempDir,
  startFakeGcs,
  tagHead,
  writeBuildOutputs,
} from "./test-fixtures.mjs";

const REPO = "cyberneticlabs/zekoder-studio";
const PUBLISHED_AT = "2026-10-10T10:00:00.000Z";

let source;
let gcs;
const tempDirs = [];

before(async () => {
  source = makeSourceRepo();
  gcs = await startFakeGcs();
});

after(async () => {
  await gcs.close();
  for (const dir of [source.dir, ...tempDirs]) rmSync(dir, { force: true, recursive: true });
});

function resetGcs() {
  gcs.objects.clear();
  gcs.log.length = 0;
  gcs.hooks.beforeFinalize = null;
  gcs.rejectUploads.clear();
}

function prepare(
  tag,
  { notes = GOOD_NOTES, release, mutate, publishedAt = PUBLISHED_AT, root = source } = {},
) {
  const input = makeTempDir("zekoder-desktop-in-");
  const output = makeTempDir("zekoder-desktop-out-");
  tempDirs.push(input, output);
  writeBuildOutputs(input, tag, { mutate });
  if (!git(root.dir, "tag", "--list", tag)) tagHead(root.dir, tag);
  const result = prepareRelease({
    tag,
    inputDir: input,
    outputDir: output,
    repo: REPO,
    publishedAt,
    bucket: gcs.bucket,
    publicBase: gcs.base,
    rootDir: root.dir,
    fetchRelease: () => (release === undefined ? githubRelease(tag, notes) : release),
  });
  return { ...result, output, input };
}

function publish(prepared, options = {}) {
  return publishRelease({
    candidatePath: prepared.candidatePath,
    releaseRoot: prepared.output,
    bucket: gcs.bucket,
    apiBase: gcs.base,
    publicBase: gcs.base,
    token: gcs.token,
    sleep: async () => {},
    log: () => {},
    ...options,
  });
}

function storedCatalog() {
  return JSON.parse(gcs.objects.get(CATALOG_OBJECT).bytes.toString("utf8"));
}

test("parses strict stable and beta tags and derives the version from the tag", () => {
  assert.deepEqual(parseDesktopTag("v0.1.0"), {
    tag: "v0.1.0",
    version: "0.1.0",
    channel: "stable",
    major: 0,
    minor: 1,
    patch: 0,
    betaNumber: null,
  });
  assert.equal(parseDesktopTag("v12.0.7-beta.10").version, "12.0.7-beta.10");
  assert.equal(parseDesktopTag("v12.0.7-beta.10").channel, "beta");
});

test("rejects old, prefixed and non-grammar tags", () => {
  for (const tag of [
    "0.1.0",
    "desktop-v0.1.0",
    "android-v0.1.0",
    "refs/tags/v0.1.0",
    "v01.0.0",
    "v0.1.0-beta.01",
    "v0.1.0-beta",
    "v0.1.0-rc.1",
    "v0.1.0+build.5",
    "v0.1.0-beta.1+build",
    "v0.1",
    "V0.1.0",
    " v0.1.0",
    "v0.1.0-gha-smoke",
  ]) {
    assert.throws(() => parseDesktopTag(tag), /Unsupported desktop release tag/, tag);
  }
});

test("orders betas numerically and below the matching final", () => {
  const ordered = [
    "v0.1.0-beta.2",
    "v0.1.0-beta.10",
    "v0.1.0",
    "v0.1.1-beta.1",
    "v0.2.0",
    "v1.0.0",
  ];
  for (let index = 1; index < ordered.length; index += 1) {
    assert.equal(compareDesktopTags(ordered[index - 1], ordered[index]), -1, ordered[index]);
    assert.equal(compareDesktopTags(ordered[index], ordered[index - 1]), 1);
  }
});

test("matrix rows: every target is prepared with its installers, archives, blockmaps and feeds", () => {
  const { entry } = prepare("v0.1.0");
  const names = Object.fromEntries(
    entry.targets.map((target) => [
      `${target.platform}/${target.arch}`,
      target.artifacts.map((artifact) => artifact.name),
    ]),
  );
  assert.deepEqual(names, {
    "darwin/arm64": [
      "Zekoder-0.1.0-arm64.dmg",
      "Zekoder-0.1.0-arm64.zip",
      "Zekoder-0.1.0-arm64.zip.blockmap",
      "beta-mac.yml",
      "latest-mac.yml",
    ],
    "darwin/x64": [
      "Zekoder-0.1.0-x64.dmg",
      "Zekoder-0.1.0-x64.zip",
      "Zekoder-0.1.0-x64.zip.blockmap",
      "beta-mac.yml",
      "latest-mac.yml",
    ],
    "win32/x64": [
      "Zekoder-Setup-0.1.0-x64.exe",
      "Zekoder-Setup-0.1.0-x64.exe.blockmap",
      "Zekoder-Setup-0.1.0-x64.zip",
      "beta.yml",
      "latest.yml",
    ],
    "win32/arm64": [
      "Zekoder-Setup-0.1.0-arm64.exe",
      "Zekoder-Setup-0.1.0-arm64.exe.blockmap",
      "Zekoder-Setup-0.1.0-arm64.zip",
      "beta.yml",
      "latest.yml",
    ],
    "linux/x64": [
      "Zekoder-0.1.0-x64.deb",
      "Zekoder-0.1.0-x64.rpm",
      "Zekoder-0.1.0-x64.tar.gz",
      "Zekoder-x64.AppImage",
      "beta-linux.yml",
      "latest-linux.yml",
    ],
  });
  assert.equal(entry.targets.length, DESKTOP_TARGETS.length);
  for (const target of entry.targets) {
    assert.equal(
      target.feedUrl,
      `${gcs.base}/zekoder-releases/desktop/releases/v0.1.0/${target.platform}/${target.arch}/`,
    );
  }
});

test("candidate catalog records tag-derived identity and exact provenance", () => {
  const { candidate, entry } = prepare("v0.1.0");
  assert.equal(entry.version, "0.1.0");
  assert.equal(entry.channel, "stable");
  assert.equal(entry.sourceCommit, git(source.dir, "rev-parse", "v0.1.0^{commit}"));
  assert.equal(entry.upstreamCommit, source.upstreamCommit);
  assert.deepEqual(entry.plugins, FIXTURE_LOCK);
  assert.equal(entry.githubReleaseUrl, `https://github.com/${REPO}/releases/tag/v0.1.0`);
  assert.deepEqual(candidate.channels, { stable: "v0.1.0", beta: "v0.1.0" });
  assert.deepEqual(validateCatalog(candidate, { publicBase: gcs.base }), []);
});

test("stable snapshots stamp the notes, a 36 hour rollout and a byte-identical beta alias", () => {
  const { output, entry } = prepare("v0.1.0");
  const dir = path.join(output, "desktop/releases/v0.1.0");
  assert.equal(readFileSync(path.join(dir, "release-notes.md"), "utf8"), GOOD_NOTES);
  assert.equal(entry.releaseNotes.sha256, createHash("sha256").update(GOOD_NOTES).digest("hex"));
  for (const target of DESKTOP_TARGETS) {
    const targetDir = path.join(dir, target.platform, target.arch);
    const [stableName, betaName] = feedFilenames(target.platform, "stable");
    const stable = readFileSync(path.join(targetDir, stableName));
    assert.deepEqual(stable, readFileSync(path.join(targetDir, betaName)));
    const feed = load(stable.toString("utf8"));
    assert.equal(feed.version, "0.1.0");
    assert.equal(feed.rolloutHours, 36);
    assert.equal(feed.releaseDate, PUBLISHED_AT);
    assert.equal(feed.releaseNotes, GOOD_NOTES);
  }
});

test("beta snapshots publish only beta feeds with an instant rollout", () => {
  const { output, entry } = prepare("v0.1.0-beta.2");
  const dir = path.join(output, "desktop/releases/v0.1.0-beta.2");
  for (const target of entry.targets) {
    const feeds = target.artifacts.filter((artifact) => artifact.kind === "feed");
    assert.deepEqual(
      feeds.map((feed) => feed.name),
      feedFilenames(target.platform, "beta"),
    );
    const feed = load(
      readFileSync(path.join(dir, target.platform, target.arch, feeds[0].name), "utf8"),
    );
    assert.equal(feed.version, "0.1.0-beta.2");
    assert.equal(feed.rolloutHours, 0);
    if (target.platform === "darwin") assert.equal(feed.minimumSystemVersion, "22.0.0");
  }
});

test("refuses missing notes, commit dumps and mismatched release metadata", () => {
  assert.throws(() => prepare("v0.1.0", { notes: "  \n" }), /empty/);
  assert.throws(
    () => prepare("v0.1.0", { notes: "## What's Changed\n* feat: x by @a in #1\n" }),
    /auto-generated/,
  );
  assert.throws(
    () => prepare("v0.1.0", { notes: "- feat(app): add thing\n- fix: other thing\n" }),
    /conventional-commit dump/,
  );
  assert.throws(() => prepare("v0.1.0", { notes: "- a1b2c3d4 something\n" }), /commit hashes/);
  assert.throws(() => validateReleaseNotes(undefined), /empty/);
  assert.throws(
    () => prepare("v0.1.0", { release: githubRelease("v0.1.0", GOOD_NOTES, { prerelease: true }) }),
    /must not be marked as a prerelease/,
  );
  assert.throws(
    () =>
      prepare("v0.1.0-beta.1", {
        release: githubRelease("v0.1.0-beta.1", GOOD_NOTES, { prerelease: false }),
      }),
    /must be marked as a prerelease/,
  );
  assert.throws(() => prepare("v0.1.0", { release: null }), /No GitHub Release/);
});

test("refuses incomplete or inconsistent build outputs", () => {
  assert.throws(
    () =>
      prepare("v0.1.0", {
        mutate: (root) => rmSync(path.join(root, "win32-arm64"), { force: true, recursive: true }),
      }),
    /Missing build output directory for win32\/arm64/,
  );
  assert.throws(
    () =>
      prepare("v0.1.0", {
        mutate: (root) => rmSync(path.join(root, "linux-x64", "Zekoder-0.1.0-x64.rpm")),
      }),
    /linux\/x64: expected exactly one installer/,
  );
  assert.throws(
    () =>
      prepare("v0.1.0", {
        mutate: (root) => rmSync(path.join(root, "darwin-x64", "latest-mac.yml")),
      }),
    /missing updater feed latest-mac\.yml/,
  );
  assert.throws(
    () =>
      prepare("v0.1.0", {
        mutate: (root) =>
          writeFileSync(path.join(root, "darwin-arm64", "Zekoder-0.1.0-arm64.zip"), "tampered"),
      }),
    /sha512 for Zekoder-0\.1\.0-arm64\.zip does not match/,
  );
  assert.throws(
    () =>
      prepare("v0.1.0", {
        mutate: (root) => {
          const feedPath = path.join(root, "win32-x64", "latest.yml");
          writeFileSync(
            feedPath,
            readFileSync(feedPath, "utf8").replace("version: 0.1.0", "version: 0.1.1"),
          );
        },
      }),
    /version=0\.1\.1, expected 0\.1\.0/,
  );
});

test("stable and beta pointers are isolated, semantic and order independent", () => {
  const stable010 = prepare("v0.1.0").entry;
  const beta020b1 = prepare("v0.2.0-beta.1").entry;
  const beta020b2 = prepare("v0.2.0-beta.2").entry;
  const beta020b10 = prepare("v0.2.0-beta.10").entry;
  const stable020 = prepare("v0.2.0").entry;
  const stable011 = prepare("v0.1.1").entry;

  let catalog = mergeRelease(null, stable010);
  assert.deepEqual(catalog.channels, { stable: "v0.1.0", beta: "v0.1.0" });
  catalog = mergeRelease(catalog, beta020b10);
  assert.deepEqual(catalog.channels, { stable: "v0.1.0", beta: "v0.2.0-beta.10" });
  catalog = mergeRelease(catalog, beta020b2);
  catalog = mergeRelease(catalog, beta020b1);
  assert.deepEqual(catalog.channels, { stable: "v0.1.0", beta: "v0.2.0-beta.10" });
  catalog = mergeRelease(catalog, stable020);
  assert.deepEqual(catalog.channels, { stable: "v0.2.0", beta: "v0.2.0" });
  catalog = mergeRelease(catalog, stable011);
  assert.deepEqual(catalog.channels, { stable: "v0.2.0", beta: "v0.2.0" });
  assert.deepEqual(Object.keys(catalog.releases), [
    "v0.2.0",
    "v0.2.0-beta.10",
    "v0.2.0-beta.2",
    "v0.2.0-beta.1",
    "v0.1.1",
    "v0.1.0",
  ]);
  assert.deepEqual(validateCatalog(catalog, { publicBase: gcs.base }), []);
});

test("catalog validation rejects incomplete matrices, foreign URLs and mismatched identity", () => {
  const { candidate } = prepare("v0.1.0");
  const urlOptions = { publicBase: gcs.base };
  const clone = () => structuredClone(candidate);

  const missingTarget = clone();
  missingTarget.releases["v0.1.0"].targets.pop();
  assert.match(validateCatalog(missingTarget, urlOptions).join("\n"), /missing linux\/x64/);

  const wrongVersion = clone();
  wrongVersion.releases["v0.1.0"].version = "0.1.1";
  assert.match(validateCatalog(wrongVersion, urlOptions).join("\n"), /version must equal 0\.1\.0/);

  const foreignUrl = clone();
  foreignUrl.releases["v0.1.0"].targets[0].artifacts[0].url = "https://evil.example/x.dmg";
  assert.match(validateCatalog(foreignUrl, urlOptions).join("\n"), /url must be/);

  const missingBlockmap = clone();
  missingBlockmap.releases["v0.1.0"].targets[0].artifacts = missingBlockmap.releases[
    "v0.1.0"
  ].targets[0].artifacts.filter((artifact) => artifact.kind !== "blockmap");
  assert.match(validateCatalog(missingBlockmap, urlOptions).join("\n"), /required blockmap/);

  const betaAsStable = prepare("v0.1.0-beta.1").candidate;
  betaAsStable.channels.stable = "v0.1.0-beta.1";
  assert.match(
    validateCatalog(betaAsStable, urlOptions).join("\n"),
    /stable must point at a stable release/,
  );

  const dangling = clone();
  dangling.channels.beta = "v9.9.9";
  assert.match(validateCatalog(dangling, urlOptions).join("\n"), /not in releases/);

  assert.throws(
    () => objectNameFromUrl("https://storage.googleapis.com/zekoder-releases/releases/v1/x"),
    /inside desktop\/releases/,
  );
});

test("resolves the upstream commit from the latest sync merge's second parent", () => {
  const run = (args) => git(source.dir, ...args);
  assert.equal(resolveUpstreamCommit(run, source.head).upstreamCommit, source.upstreamCommit);
  const noSync = makeSourceRepo({ syncMerge: false });
  tempDirs.push(noSync.dir);
  assert.throws(
    () => resolveUpstreamCommit((args) => git(noSync.dir, ...args), noSync.head),
    /No "chore\(sync\): merge upstream paseo" merge commit/,
  );
  assert.throws(
    () => prepare("v0.3.0", { root: noSync }),
    /No "chore\(sync\): merge upstream paseo" merge commit/,
  );
});

test("rejects plugin locks that are not pinned", () => {
  const unpinned = makeSourceRepo({ lock: { ...FIXTURE_LOCK, commit: "main" } });
  tempDirs.push(unpinned.dir);
  assert.throws(
    () => prepare("v0.3.0", { root: unpinned }),
    /zekoder\.lock\.json is invalid.*commit/,
  );
});

test("publishes complete snapshots with generation preconditions and the catalog last", async () => {
  resetGcs();
  const prepared = prepare("v0.1.0");
  const result = await publish(prepared);
  assert.equal(result.catalogChanged, true);
  assert.equal(result.reused.length, 0);

  const writes = gcs.log.filter((entry) => entry.op === "write");
  assert.equal(writes.at(-1).name, CATALOG_OBJECT, "catalog is the last write");
  assert.equal(writes.at(-1).ifGenerationMatch, 0, "first catalog creation uses generation=0");
  for (const write of writes.slice(0, -1)) {
    assert.equal(write.ifGenerationMatch, 0, `${write.name} is created immutably`);
  }
  assert.equal(gcs.authFailures, 0);

  const stored = storedCatalog();
  assert.deepEqual(stored.channels, { stable: "v0.1.0", beta: "v0.1.0" });
  for (const target of stored.releases["v0.1.0"].targets) {
    for (const artifact of target.artifacts) {
      const object = gcs.objects.get(objectNameFromUrl(artifact.url, { publicBase: gcs.base }));
      assert.equal(createHash("sha256").update(object.bytes).digest("hex"), artifact.sha256);
      assert.equal(object.bytes.length, artifact.size);
    }
  }
});

test("exact replay is a no-op that never rewrites objects or the catalog", async () => {
  resetGcs();
  const first = prepare("v0.1.0");
  await publish(first);
  const generations = new Map([...gcs.objects].map(([name, object]) => [name, object.generation]));
  gcs.log.length = 0;

  const replay = prepare("v0.1.0");
  const result = await publish(replay);
  assert.equal(result.uploaded.length, 0);
  assert.equal(result.catalogChanged, false);
  assert.equal(gcs.log.filter((entry) => entry.op === "write").length, 0);
  for (const [name, generation] of generations) {
    assert.equal(gcs.objects.get(name).generation, generation, name);
  }
});

test("a rebuilt payload with different bytes aborts without touching the catalog", async () => {
  resetGcs();
  await publish(prepare("v0.1.0"));
  const catalogBefore = gcs.objects.get(CATALOG_OBJECT);
  const rebuilt = prepare("v0.1.0", {
    mutate: (root) => {
      // A rebuilt (re-signed) installer: new bytes, consistent feed.
      const dir = path.join(root, "darwin-arm64");
      const zip = path.join(dir, "Zekoder-0.1.0-arm64.zip");
      const bytes = Buffer.from("rebuilt and re-signed");
      writeFileSync(zip, bytes);
      const feedPath = path.join(dir, "latest-mac.yml");
      const feed = load(readFileSync(feedPath, "utf8"));
      feed.files[0].sha512 = createHash("sha512").update(bytes).digest("base64");
      feed.files[0].size = bytes.length;
      feed.sha512 = feed.files[0].sha512;
      writeFileSync(feedPath, JSON.stringify(feed));
    },
  });
  await assert.rejects(() => publish(rebuilt), ImmutableMismatchError);
  assert.equal(gcs.objects.get(CATALOG_OBJECT), catalogBefore);
  assert.equal(gcs.objects.get(CATALOG_OBJECT).generation, catalogBefore.generation);
});

test("a changed publishedAt on a rerun is caught as an immutable feed mismatch", async () => {
  resetGcs();
  await publish(prepare("v0.1.0"));
  await assert.rejects(
    () => publish(prepare("v0.1.0", { publishedAt: "2026-10-11T00:00:00.000Z" })),
    /already exists with different bytes/,
  );
});

test("partial upload reruns reuse identical objects and finish the release", async () => {
  resetGcs();
  const prepared = prepare("v0.1.0");
  const dir = path.join(prepared.output, "desktop/releases/v0.1.0");
  const flaky = "desktop/releases/v0.1.0/linux/x64/Zekoder-0.1.0-x64.rpm";
  gcs.rejectUploads.add(flaky);
  await assert.rejects(() => publish(prepared), /HTTP 403/);
  assert.equal(gcs.objects.has(CATALOG_OBJECT), false, "catalog untouched by a failed upload");
  const uploadedBefore = [...gcs.objects.keys()].length;
  assert.ok(uploadedBefore > 0 && existsSync(dir));

  gcs.rejectUploads.clear();
  const result = await publish(prepare("v0.1.0"));
  assert.equal(result.reused.length, uploadedBefore);
  assert.ok(result.uploaded.includes(flaky));
  assert.equal(storedCatalog().channels.stable, "v0.1.0");
});

test("a catalog conflict reloads and preserves unrelated releases and both channels", async () => {
  resetGcs();
  await publish(prepare("v0.1.0"));
  const concurrent = prepare("v0.3.0-beta.1");
  const other = prepare("v0.2.0");
  const target = prepare("v0.1.1");

  let raced = false;
  gcs.hooks.beforeFinalize = (name, state) => {
    if (name !== CATALOG_OBJECT || raced) return;
    raced = true;
    // Another publisher lands v0.2.0 and a newer beta between our read and our write.
    const remote = storedCatalog();
    const merged = mergeRelease(mergeRelease(remote, other.entry), concurrent.entry);
    state.objects.set(CATALOG_OBJECT, {
      bytes: Buffer.from(JSON.stringify(merged)),
      generation: state.objects.get(CATALOG_OBJECT).generation + 100,
    });
  };
  const result = await publish(target);
  assert.equal(raced, true);
  assert.equal(result.catalogChanged, true);
  const stored = storedCatalog();
  assert.deepEqual(stored.channels, { stable: "v0.2.0", beta: "v0.3.0-beta.1" });
  assert.deepEqual(Object.keys(stored.releases).sort(), [
    "v0.1.0",
    "v0.1.1",
    "v0.2.0",
    "v0.3.0-beta.1",
  ]);
  const catalogWrites = gcs.log.filter(
    (entry) => entry.name === CATALOG_OBJECT && entry.op === "init",
  );
  assert.ok(
    catalogWrites.length >= 3,
    "initial create, conflicting attempt and retry were all guarded",
  );
  assert.ok(catalogWrites.slice(1).every((entry) => entry.ifGenerationMatch > 0));
});

test("persistent catalog conflicts fail clearly after bounded retries", async () => {
  resetGcs();
  await publish(prepare("v0.1.0"));
  gcs.hooks.beforeFinalize = (name, state) => {
    if (name !== CATALOG_OBJECT) return;
    const current = state.objects.get(CATALOG_OBJECT);
    state.objects.set(CATALOG_OBJECT, { ...current, generation: current.generation + 1 });
  };
  await assert.rejects(
    () => publish(prepare("v0.1.1"), { catalogAttempts: 3 }),
    (error) =>
      error instanceof CatalogConflictError &&
      /after 3 compare-and-swap attempts/.test(error.message),
  );
  assert.deepEqual(storedCatalog().channels, { stable: "v0.1.0", beta: "v0.1.0" });
});

test("publishing an older tag later leaves the newer pointers and both histories", async () => {
  resetGcs();
  await publish(prepare("v0.2.0"));
  await publish(prepare("v0.1.0"));
  await publish(prepare("v0.3.0-beta.1"));
  await publish(prepare("v0.2.1-beta.1"));
  const stored = storedCatalog();
  assert.deepEqual(stored.channels, { stable: "v0.2.0", beta: "v0.3.0-beta.1" });
  assert.deepEqual(Object.keys(stored.releases), [
    "v0.3.0-beta.1",
    "v0.2.1-beta.1",
    "v0.2.0",
    "v0.1.0",
  ]);
});

test("rejects a publish when a local file no longer matches the candidate", async () => {
  resetGcs();
  const prepared = prepare("v0.1.0");
  writeFileSync(
    path.join(prepared.output, "desktop/releases/v0.1.0/release-notes.md"),
    "edited after prepare",
  );
  await assert.rejects(() => publish(prepared), /does not match the candidate/);
  assert.equal(gcs.objects.size, 0);
});

test("the desktop updater's wire fixture is a catalog the publisher considers valid", () => {
  // packages/desktop reads this file in its updater tests; keeping it valid here pins the reader
  // and the writer to the same wire format without desktop importing from scripts/.
  const fixture = JSON.parse(
    readFileSync(
      "packages/desktop/src/features/__fixtures__/desktop-release-catalog.wire.json",
      "utf8",
    ),
  );
  assert.deepEqual(validateCatalog(fixture), []);
});
