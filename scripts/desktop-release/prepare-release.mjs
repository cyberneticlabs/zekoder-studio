// Turns downloaded desktop build outputs plus the matching GitHub Release body into an
// immutable release snapshot and a catalog candidate. It never touches the input directory,
// never generates notes, and writes nothing to the cloud (see publish-release.mjs).
//
// Input layout:   <input>/<platform>-<arch>/<electron-builder outputs for that target>
// Output layout:  <output>/desktop/releases/<tag>/<platform>/<arch>/...   (feeds stamped)
//                 <output>/desktop/releases/<tag>/release-notes.md
//                 <output>/catalog-candidate.json
import { execFileSync as nodeExecFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  closeSync,
  copyFileSync,
  existsSync,
  mkdirSync,
  openSync,
  readFileSync,
  readSync,
  readdirSync,
  statSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";
import { parseArgs } from "node:util";
import { dump, load } from "js-yaml";
import { getCanonicalReleaseUrl, getGitHubRelease } from "../github-release.mjs";
import { isMainModule } from "../is-main-module.mjs";
import { MACOS_MINIMUM_DARWIN_VERSION } from "../merge-mac-manifest.mjs";
import { stampRollout } from "../stamp-rollout.mjs";
import { validateDesktopManifests } from "../validate-desktop-manifests.mjs";
import { zekoderPluginProvenanceAt } from "../zekoder-plugin-tree.mjs";
import {
  BETA_ROLLOUT_HOURS,
  DEFAULT_BUCKET,
  DEFAULT_PUBLIC_BASE,
  DESKTOP_TARGETS,
  NOTES_FILENAME,
  STABLE_ROLLOUT_HOURS,
  assertValidCatalog,
  blockmapNameFor,
  buildReleaseEntry,
  candidateCatalog,
  feedFilename,
  feedFilenames,
  parseDesktopTag,
  publicUrl,
  releasePrefix,
  requiredPayloads,
  resolveUpstreamCommit,
  targetPrefix,
  validateGitHubReleaseForTag,
} from "./release-data.mjs";

const SHA1_PATTERN = /^[0-9a-f]{40}$/;
const CHUNK = 4 * 1024 * 1024;

// Streams a file once for both digests so multi-hundred-megabyte installers stay out of memory.
export function hashFileSync(filePath) {
  const sha256 = createHash("sha256");
  const sha512 = createHash("sha512");
  const buffer = Buffer.allocUnsafe(CHUNK);
  const fd = openSync(filePath, "r");
  let size = 0;
  try {
    for (;;) {
      const read = readSync(fd, buffer, 0, CHUNK, null);
      if (read === 0) break;
      sha256.update(buffer.subarray(0, read));
      sha512.update(buffer.subarray(0, read));
      size += read;
    }
  } finally {
    closeSync(fd);
  }
  return { sha256: sha256.digest("hex"), sha512: sha512.digest("base64"), size };
}

function listFiles(dir) {
  return readdirSync(dir, { withFileTypes: true })
    .filter((entry) => entry.isFile())
    .map((entry) => entry.name)
    .sort();
}

function isRelativeFileName(value) {
  return typeof value === "string" && value !== "" && !/[/\\:]/.test(value) && value !== "..";
}

// Feed references must stay relative file names whose digests match the bytes being published.
function validateFeed({ feed, feedName, version, payloads, label }) {
  if (feed === null || typeof feed !== "object" || Array.isArray(feed)) {
    throw new Error(`${label}: ${feedName} is not a YAML mapping`);
  }
  if (feed.version !== version) {
    throw new Error(`${label}: ${feedName} version=${feed.version}, expected ${version}`);
  }
  if (!Array.isArray(feed.files) || feed.files.length === 0) {
    throw new Error(`${label}: ${feedName} has no files`);
  }
  const referenced = new Set();
  for (const file of feed.files) {
    if (!isRelativeFileName(file?.url)) {
      throw new Error(`${label}: ${feedName} references a non-relative url ${file?.url}`);
    }
    const payload = payloads.get(file.url);
    if (!payload) {
      throw new Error(
        `${label}: ${feedName} references ${file.url}, which is not a published payload`,
      );
    }
    if (file.sha512 !== payload.sha512) {
      throw new Error(
        `${label}: ${feedName} sha512 for ${file.url} does not match the build output`,
      );
    }
    if (file.size !== undefined && file.size !== payload.size) {
      throw new Error(`${label}: ${feedName} size for ${file.url} does not match the build output`);
    }
    referenced.add(file.url);
  }
  if (feed.path !== undefined && !referenced.has(feed.path)) {
    throw new Error(`${label}: ${feedName} path ${feed.path} is not listed in files`);
  }
  if (feed.path !== undefined && feed.sha512 !== payloads.get(feed.path).sha512) {
    throw new Error(`${label}: ${feedName} top-level sha512 does not match ${feed.path}`);
  }
  return referenced;
}

function prepareTarget({
  target,
  parsedTag,
  inputDir,
  releaseDir,
  notes,
  publishedAt,
  urlOptions,
}) {
  const label = `${target.platform}/${target.arch}`;
  const targetInput = path.join(inputDir, `${target.platform}-${target.arch}`);
  if (!existsSync(targetInput) || !statSync(targetInput).isDirectory()) {
    throw new Error(`Missing build output directory for ${label}: ${targetInput}`);
  }
  const available = listFiles(targetInput);
  const { version, channel } = parsedTag;

  // Payloads: every required file exactly once, plus blockmaps of published payloads.
  const payloadNames = new Map();
  for (const required of requiredPayloads(target, version)) {
    const matches = available.filter((name) => required.pattern.test(name));
    if (matches.length !== 1) {
      throw new Error(
        `${label}: expected exactly one ${required.kind} matching ${required.pattern}, found ${matches.length}`,
      );
    }
    payloadNames.set(matches[0], required);
  }
  for (const name of Array.from(payloadNames.keys())) {
    const blockmap = blockmapNameFor(name);
    if (!payloadNames.has(blockmap) && available.includes(blockmap)) {
      payloadNames.set(blockmap, { kind: "blockmap", feedReferenced: false });
    }
  }

  const targetOutput = path.join(releaseDir, target.platform, target.arch);
  mkdirSync(targetOutput, { recursive: true });
  const published = new Map();
  for (const [name, spec] of payloadNames) {
    const destination = path.join(targetOutput, name);
    copyFileSync(path.join(targetInput, name), destination);
    published.set(name, { ...spec, ...hashFileSync(destination) });
  }

  // Feeds: the builder's own-channel YAML is validated against the payloads, stamped, and (for
  // stable) duplicated byte-for-byte under the beta name.
  const primaryName = feedFilename(target.platform, channel);
  const primaryPath = path.join(targetInput, primaryName);
  if (!available.includes(primaryName)) {
    throw new Error(`${label}: missing updater feed ${primaryName} in build output`);
  }
  const feed = load(readFileSync(primaryPath, "utf8"));
  const referenced = validateFeed({
    feed,
    feedName: primaryName,
    version,
    payloads: published,
    label,
  });
  for (const [name, spec] of payloadNames) {
    if (spec.feedReferenced && !referenced.has(name)) {
      throw new Error(`${label}: ${primaryName} does not reference required payload ${name}`);
    }
  }
  const stamped = { ...feed, releaseNotes: notes };
  if (target.platform === "darwin") stamped.minimumSystemVersion = MACOS_MINIMUM_DARWIN_VERSION;
  const primaryOutput = path.join(targetOutput, primaryName);
  writeFileSync(primaryOutput, dump(stamped, { lineWidth: -1, noRefs: true }));
  const rolloutHours = channel === "stable" ? STABLE_ROLLOUT_HOURS : BETA_ROLLOUT_HOURS;
  stampRollout({ releaseDate: publishedAt, rolloutHours }, [primaryOutput]);

  const feedPaths = [primaryOutput];
  for (const name of feedFilenames(target.platform, channel)) {
    if (name === primaryName) continue;
    const aliasOutput = path.join(targetOutput, name);
    copyFileSync(primaryOutput, aliasOutput);
    feedPaths.push(aliasOutput);
  }
  validateDesktopManifests(
    { releaseDate: publishedAt, rolloutHours, version, releaseNotes: notes },
    feedPaths,
  );
  for (const feedPath of feedPaths) {
    const { sha256, size } = hashFileSync(feedPath);
    published.set(path.basename(feedPath), { kind: "feed", sha256, size });
  }

  const feedUrl = `${publicUrl(urlOptions, targetPrefix(parsedTag.tag, target))}/`;
  return {
    platform: target.platform,
    arch: target.arch,
    feedUrl,
    artifacts: [...published.keys()].sort().map((name) => ({
      name,
      kind: published.get(name).kind,
      url: `${feedUrl}${encodeURIComponent(name)}`,
      sha256: published.get(name).sha256,
      size: published.get(name).size,
    })),
  };
}

export function prepareRelease({
  tag,
  inputDir,
  outputDir,
  repo,
  publishedAt,
  sourceCommit,
  bucket = DEFAULT_BUCKET,
  publicBase = DEFAULT_PUBLIC_BASE,
  rootDir = process.cwd(),
  fetchRelease = (releaseRepo, releaseTag) => getGitHubRelease(releaseRepo, releaseTag),
  git = (args) => nodeExecFileSync("git", args, { cwd: rootDir, encoding: "utf8" }),
}) {
  const parsedTag = parseDesktopTag(tag);
  if (!repo) throw new Error("A GitHub repository (owner/name) is required.");
  if (typeof publishedAt !== "string" || new Date(publishedAt).toISOString() !== publishedAt) {
    throw new Error(
      `publishedAt must be an ISO instant like 2026-01-01T00:00:00.000Z, got ${publishedAt}`,
    );
  }
  const urlOptions = { publicBase, bucket };

  let tagCommit;
  try {
    tagCommit = git(["rev-parse", "--verify", `refs/tags/${tag}^{commit}`]).trim();
  } catch {
    throw new Error(`Tag ${tag} does not exist in this checkout. Fetch tags before preparing.`);
  }
  if (!SHA1_PATTERN.test(tagCommit)) throw new Error(`Could not resolve ${tag} to a commit.`);
  if (sourceCommit !== undefined && sourceCommit !== tagCommit) {
    throw new Error(
      `Source commit ${sourceCommit} does not match the commit ${tagCommit} that ${tag} points to.`,
    );
  }

  const { upstreamCommit } = resolveUpstreamCommit(git, tagCommit);
  const plugins = zekoderPluginProvenanceAt(git, tagCommit);

  const release = fetchRelease(repo, tag);
  const notes = validateGitHubReleaseForTag(release, tag);
  const githubReleaseUrl = getCanonicalReleaseUrl(release, repo, tag);

  const releaseDir = path.join(outputDir, releasePrefix(tag));
  if (existsSync(releaseDir)) {
    throw new Error(`${releaseDir} already exists. Prepare into an empty output directory.`);
  }
  mkdirSync(releaseDir, { recursive: true });

  const notesBytes = Buffer.from(notes, "utf8");
  writeFileSync(path.join(releaseDir, NOTES_FILENAME), notesBytes);

  const targets = DESKTOP_TARGETS.map((target) =>
    prepareTarget({ target, parsedTag, inputDir, releaseDir, notes, publishedAt, urlOptions }),
  );

  const entry = buildReleaseEntry({
    tag,
    publishedAt,
    sourceCommit: tagCommit,
    upstreamCommit,
    plugins,
    notes: {
      sha256: createHash("sha256").update(notesBytes).digest("hex"),
      size: notesBytes.length,
    },
    githubReleaseUrl,
    targets,
    urlOptions,
  });
  const candidate = candidateCatalog(entry);
  assertValidCatalog(candidate, urlOptions);
  const candidatePath = path.join(outputDir, "catalog-candidate.json");
  writeFileSync(candidatePath, `${JSON.stringify(candidate, null, 2)}\n`);
  return { candidate, candidatePath, releaseDir, entry };
}

function main(argv) {
  const { values } = parseArgs({
    args: argv,
    options: {
      tag: { type: "string" },
      input: { type: "string" },
      output: { type: "string" },
      repo: { type: "string", default: process.env.GITHUB_REPOSITORY },
      "published-at": { type: "string" },
      "source-commit": { type: "string" },
      // A release captured earlier by release-ci.mjs fetch-notes, for jobs that cannot read
      // private drafts themselves.
      "release-json": { type: "string" },
      bucket: { type: "string", default: process.env.ZEKODER_RELEASE_BUCKET ?? DEFAULT_BUCKET },
      "public-base": { type: "string", default: DEFAULT_PUBLIC_BASE },
      root: { type: "string", default: process.cwd() },
    },
    strict: true,
  });
  for (const required of ["tag", "input", "output", "published-at"]) {
    if (!values[required]) {
      throw new Error(
        "Usage: node scripts/desktop-release/prepare-release.mjs --tag <vX.Y.Z[-beta.N]> --input <dir> --output <dir> --published-at <iso> [--repo owner/name] [--source-commit sha] [--release-json file] [--bucket b] [--public-base url]",
      );
    }
  }
  const result = prepareRelease({
    tag: values.tag,
    inputDir: path.resolve(values.input),
    outputDir: path.resolve(values.output),
    repo: values.repo,
    publishedAt: values["published-at"],
    sourceCommit: values["source-commit"],
    bucket: values.bucket,
    publicBase: values["public-base"],
    rootDir: path.resolve(values.root),
    ...(values["release-json"] && {
      fetchRelease: () => JSON.parse(readFileSync(path.resolve(values["release-json"]), "utf8")),
    }),
  });
  process.stdout.write(`${result.candidatePath}\n`);
}

if (isMainModule(import.meta.url)) {
  main(process.argv.slice(2));
}
