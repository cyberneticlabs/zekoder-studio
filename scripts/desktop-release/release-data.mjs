// Strict data model for Zekoder desktop releases (feature 003, contract
// desktop-release-catalog). Everything here is pure except resolveUpstreamCommit,
// which runs injected git commands. The permissive upstream tag helpers in
// ../release-version-utils.mjs stay untouched; desktop entry points validate with the
// strict functions in this file.
import { createHash } from "node:crypto";
import { validateLock } from "../sync-zekoder-plugin.mjs";

export const CATALOG_SCHEMA_VERSION = 1;
export const DEFAULT_BUCKET = "zekoder-releases";
export const DEFAULT_PUBLIC_BASE = "https://storage.googleapis.com";
export const DESKTOP_PREFIX = "desktop/releases";
export const CATALOG_OBJECT = `${DESKTOP_PREFIX}/manifest.json`;
export const NOTES_FILENAME = "release-notes.md";
export const STABLE_ROLLOUT_HOURS = 36;
export const BETA_ROLLOUT_HOURS = 0;
export const IMMUTABLE_CACHE_CONTROL = "public, max-age=31536000, immutable";
export const CATALOG_CACHE_CONTROL = "public, max-age=60";
export const UPSTREAM_SYNC_SUBJECT = "chore(sync): merge upstream paseo";

const NUMBER = "0|[1-9][0-9]*";
const DESKTOP_TAG_PATTERN = new RegExp(
  `^v(?<major>${NUMBER})\\.(?<minor>${NUMBER})\\.(?<patch>${NUMBER})(?:-beta\\.(?<beta>${NUMBER}))?$`,
);
const SHA1_PATTERN = /^[0-9a-f]{40}$/;
const SHA256_PATTERN = /^[0-9a-f]{64}$/;

export const CHANNELS = ["stable", "beta"];

// ---------------------------------------------------------------------------
// Tags and versions
// ---------------------------------------------------------------------------

export function parseDesktopTag(tag) {
  if (typeof tag !== "string") {
    throw new Error(`Unsupported desktop release tag ${JSON.stringify(tag)}.`);
  }
  const match = tag.match(DESKTOP_TAG_PATTERN);
  if (!match?.groups) {
    throw new Error(
      `Unsupported desktop release tag "${tag}". Expected vX.Y.Z or vX.Y.Z-beta.N with no leading zeros, prefixes, other prereleases or build metadata.`,
    );
  }
  const major = Number(match.groups.major);
  const minor = Number(match.groups.minor);
  const patch = Number(match.groups.patch);
  const betaNumber = match.groups.beta === undefined ? null : Number(match.groups.beta);
  for (const part of [major, minor, patch, betaNumber ?? 0]) {
    if (!Number.isSafeInteger(part)) {
      throw new Error(`Desktop release tag "${tag}" has a version component that is too large.`);
    }
  }
  return {
    tag,
    version: tag.slice(1),
    channel: betaNumber === null ? "stable" : "beta",
    major,
    minor,
    patch,
    betaNumber,
  };
}

export function desktopVersionFromTag(tag) {
  return parseDesktopTag(tag).version;
}

// Semver precedence for the accepted grammar: a beta of X.Y.Z sorts below final X.Y.Z, and
// betas compare numerically (beta.10 > beta.2).
export function compareDesktopTags(left, right) {
  const a = parseDesktopTag(left);
  const b = parseDesktopTag(right);
  for (const key of ["major", "minor", "patch"]) {
    if (a[key] !== b[key]) return a[key] < b[key] ? -1 : 1;
  }
  if (a.betaNumber === b.betaNumber) return 0;
  if (a.betaNumber === null) return 1;
  if (b.betaNumber === null) return -1;
  return a.betaNumber < b.betaNumber ? -1 : 1;
}

export function highestDesktopTag(tags) {
  let best = null;
  for (const tag of tags) {
    if (tag && (best === null || compareDesktopTags(tag, best) > 0)) best = tag;
  }
  return best;
}

// ---------------------------------------------------------------------------
// Target matrix
// ---------------------------------------------------------------------------

export const DESKTOP_TARGETS = Object.freeze([
  { platform: "darwin", arch: "arm64" },
  { platform: "darwin", arch: "x64" },
  { platform: "win32", arch: "x64" },
  { platform: "win32", arch: "arm64" },
  { platform: "linux", arch: "x64" },
]);

export function targetKey({ platform, arch }) {
  return `${platform}/${arch}`;
}

export function isSupportedTarget(platform, arch) {
  return DESKTOP_TARGETS.some((target) => target.platform === platform && target.arch === arch);
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// Electron channel filenames. Stable releases publish latest*.yml plus a byte-identical
// beta*.yml alias so beta clients can consume a final stable; beta releases publish
// beta*.yml only.
export function feedFilename(platform, channel) {
  const base = channel === "stable" ? "latest" : "beta";
  if (platform === "darwin") return `${base}-mac.yml`;
  if (platform === "linux") return `${base}-linux.yml`;
  return `${base}.yml`;
}

export function feedFilenames(platform, releaseChannel) {
  return releaseChannel === "stable"
    ? [feedFilename(platform, "stable"), feedFilename(platform, "beta")]
    : [feedFilename(platform, "beta")];
}

// Payload files a target must contain. `feedReferenced` payloads must appear in the
// target's updater YAML; `optionalBlockmapFor` documents blockmaps published when present.
export function requiredPayloads({ platform, arch }, version) {
  const v = escapeRegExp(version);
  const exact = (name) => new RegExp(`^${escapeRegExp(name)}$`);
  if (platform === "darwin") {
    return [
      {
        kind: "installer",
        pattern: exact(`Zekoder-${version}-${arch}.dmg`),
        feedReferenced: false,
      },
      { kind: "archive", pattern: exact(`Zekoder-${version}-${arch}.zip`), feedReferenced: true },
      {
        kind: "blockmap",
        pattern: exact(`Zekoder-${version}-${arch}.zip.blockmap`),
        feedReferenced: false,
      },
    ];
  }
  if (platform === "win32") {
    return [
      {
        kind: "installer",
        pattern: exact(`Zekoder-Setup-${version}-${arch}.exe`),
        feedReferenced: true,
      },
      {
        kind: "blockmap",
        pattern: exact(`Zekoder-Setup-${version}-${arch}.exe.blockmap`),
        feedReferenced: false,
      },
      {
        kind: "archive",
        pattern: exact(`Zekoder-Setup-${version}-${arch}.zip`),
        feedReferenced: false,
      },
    ];
  }
  return [
    { kind: "installer", pattern: exact("Zekoder-x86_64.AppImage"), feedReferenced: true },
    {
      kind: "installer",
      pattern: new RegExp(`^Zekoder-${v}-(?:x64|amd64)\\.deb$`),
      feedReferenced: false,
    },
    {
      kind: "installer",
      pattern: new RegExp(`^Zekoder-${v}-(?:x64|x86_64)\\.rpm$`),
      feedReferenced: false,
    },
    { kind: "archive", pattern: exact(`Zekoder-${version}-x64.tar.gz`), feedReferenced: false },
  ];
}

// Blockmaps for any published payload are published too (`<payload>.blockmap`).
export function blockmapNameFor(payloadName) {
  return `${payloadName}.blockmap`;
}

export const ARTIFACT_KINDS = ["installer", "archive", "blockmap", "feed"];

// ---------------------------------------------------------------------------
// Object naming
// ---------------------------------------------------------------------------

export function releasePrefix(tag) {
  parseDesktopTag(tag);
  return `${DESKTOP_PREFIX}/${tag}`;
}

export function targetPrefix(tag, target) {
  return `${releasePrefix(tag)}/${target.platform}/${target.arch}`;
}

export function publicUrl(
  { publicBase = DEFAULT_PUBLIC_BASE, bucket = DEFAULT_BUCKET },
  objectName,
) {
  const base = publicBase.replace(/\/+$/, "");
  return `${base}/${bucket}/${objectName.split("/").map(encodeURIComponent).join("/")}`;
}

// Inverse of publicUrl: returns the object name or throws when the URL leaves the desktop
// prefix of the configured bucket.
export function objectNameFromUrl(
  url,
  { publicBase = DEFAULT_PUBLIC_BASE, bucket = DEFAULT_BUCKET } = {},
) {
  let parsed;
  try {
    parsed = new URL(url);
  } catch {
    throw new Error(`Invalid URL ${JSON.stringify(url)}.`);
  }
  const base = new URL(publicBase);
  if (parsed.protocol !== "https:" && !(base.protocol === "http:" && parsed.protocol === "http:")) {
    throw new Error(`URL ${url} must use HTTPS.`);
  }
  if (parsed.origin !== base.origin) {
    throw new Error(`URL ${url} must be served from ${base.origin}.`);
  }
  if (parsed.search || parsed.hash) {
    throw new Error(`URL ${url} must not contain a query or fragment.`);
  }
  const bucketPrefix = `/${bucket}/`;
  if (!parsed.pathname.startsWith(bucketPrefix)) {
    throw new Error(`URL ${url} must be inside bucket ${bucket}.`);
  }
  const objectName = parsed.pathname
    .slice(bucketPrefix.length)
    .split("/")
    .map(decodeURIComponent)
    .join("/");
  if (!objectName.startsWith(`${DESKTOP_PREFIX}/`) || objectName.split("/").includes("..")) {
    throw new Error(`URL ${url} must be inside ${DESKTOP_PREFIX}/.`);
  }
  return objectName;
}

export function sha256Hex(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

// ---------------------------------------------------------------------------
// Plugins, notes, provenance
// ---------------------------------------------------------------------------

export function pluginsFromLock(lock) {
  const problems = validateLock(lock);
  if (problems.length > 0) {
    throw new Error(`plugins/zekoder.lock.json is invalid: ${problems.join("; ")}`);
  }
  return {
    repo: lock.repo,
    ref: lock.ref,
    commit: lock.commit,
    version: lock.version,
    checksum: lock.checksum,
  };
}

function validatePlugins(plugins, label, errors) {
  if (typeof plugins !== "object" || plugins === null || Array.isArray(plugins)) {
    errors.push(`${label}.plugins must be an object`);
    return;
  }
  const problems = validateLock(plugins);
  for (const problem of problems) errors.push(`${label}.plugins: ${problem}`);
}

const COMMIT_BULLET = /^\s*[-*+]\s+`?[0-9a-f]{7,40}`?(?:\s|$)/;
const CONVENTIONAL_BULLET =
  /^\s*[-*+]\s+(?:feat|fix|chore|refactor|docs|test|tests|ci|build|perf|style|revert)(?:\([^)]*\))?!?:\s/i;
const AUTOGENERATED_NOTES = /(^|\n)\s*#{1,6}\s*what'?s changed\b|\*\*full changelog\*\*/i;

// The body must be high-level product notes: nonempty and not a generated commit dump.
// Returns the exact input so callers copy bytes verbatim.
export function validateReleaseNotes(body) {
  if (typeof body !== "string" || body.trim() === "") {
    throw new Error("GitHub Release notes are empty. Write high-level product notes first.");
  }
  if (body.includes("\0") || body.includes("\uFFFD")) {
    throw new Error("GitHub Release notes are not valid UTF-8 text.");
  }
  if (AUTOGENERATED_NOTES.test(body)) {
    throw new Error(
      "GitHub Release notes look auto-generated (What's Changed / Full Changelog). Write high-level product notes instead.",
    );
  }
  const bullets = body.split(/\r?\n/).filter((line) => /^\s*[-*+]\s+\S/.test(line));
  const commitLines = body.split(/\r?\n/).filter((line) => COMMIT_BULLET.test(line));
  if (commitLines.length > 0) {
    throw new Error(
      "GitHub Release notes list commit hashes. Write high-level product notes instead.",
    );
  }
  const conventional = bullets.filter((line) => CONVENTIONAL_BULLET.test(line));
  if (bullets.length > 0 && conventional.length * 2 >= bullets.length) {
    throw new Error(
      "GitHub Release notes look like a conventional-commit dump. Write high-level product notes instead.",
    );
  }
  return body;
}

export function validateGitHubReleaseForTag(release, tag) {
  const parsed = parseDesktopTag(tag);
  if (!release) {
    throw new Error(
      `No GitHub Release (draft or published) found for ${tag}. Prepare the draft notes before tagging.`,
    );
  }
  if (release.tag_name !== tag) {
    throw new Error(`GitHub Release tag_name ${release.tag_name} does not match ${tag}.`);
  }
  const expectPrerelease = parsed.channel === "beta";
  if (Boolean(release.prerelease) !== expectPrerelease) {
    throw new Error(
      `GitHub Release for ${tag} must ${expectPrerelease ? "" : "not "}be marked as a prerelease.`,
    );
  }
  return validateReleaseNotes(release.body);
}

// Resolve the exact upstream source from the latest conventional upstream-sync merge in the
// tagged ancestry: its second parent. `git` is (args) => stdout string and may throw.
export function resolveUpstreamCommit(git, sourceCommit) {
  const output = git([
    "log",
    sourceCommit,
    "--merges",
    "-1",
    `--grep=^${UPSTREAM_SYNC_SUBJECT}`,
    "--format=%H %P",
  ]).trim();
  if (!output) {
    throw new Error(
      `No "${UPSTREAM_SYNC_SUBJECT}" merge commit found in the ancestry of ${sourceCommit}. Fetch full history (fetch-depth: 0) or restore the upstream sync merge convention.`,
    );
  }
  const [merge, ...parents] = output.split(/\s+/);
  if (parents.length < 2 || !SHA1_PATTERN.test(parents[1])) {
    throw new Error(`Upstream sync merge ${merge} does not have a second parent.`);
  }
  const upstreamCommit = parents[1];
  try {
    git(["merge-base", "--is-ancestor", upstreamCommit, sourceCommit]);
  } catch {
    throw new Error(`Upstream commit ${upstreamCommit} is not an ancestor of ${sourceCommit}.`);
  }
  return { syncMerge: merge, upstreamCommit };
}

// ---------------------------------------------------------------------------
// Catalog validation
// ---------------------------------------------------------------------------

function isPlainObject(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isIsoInstant(value) {
  if (typeof value !== "string") return false;
  const time = new Date(value).getTime();
  return !Number.isNaN(time) && new Date(time).toISOString() === value;
}

function validateArtifact(artifact, { tag, target, urlOptions, label, errors }) {
  if (!isPlainObject(artifact)) {
    errors.push(`${label} must be an object`);
    return null;
  }
  if (typeof artifact.name !== "string" || artifact.name === "" || artifact.name.includes("/")) {
    errors.push(`${label}.name must be a plain file name`);
    return null;
  }
  if (!ARTIFACT_KINDS.includes(artifact.kind)) {
    errors.push(`${label}.kind must be one of ${ARTIFACT_KINDS.join(", ")}`);
  }
  if (typeof artifact.sha256 !== "string" || !SHA256_PATTERN.test(artifact.sha256)) {
    errors.push(`${label}.sha256 must be 64 lowercase hex characters`);
  }
  if (!Number.isSafeInteger(artifact.size) || artifact.size <= 0) {
    errors.push(`${label}.size must be a positive integer`);
  }
  const expectedUrl = publicUrl(urlOptions, `${targetPrefix(tag, target)}/${artifact.name}`);
  if (artifact.url !== expectedUrl) {
    errors.push(`${label}.url must be ${expectedUrl}`);
  }
  return artifact;
}

function validateTarget(target, release, urlOptions, label, errors) {
  if (!isPlainObject(target) || !isSupportedTarget(target.platform, target.arch)) {
    errors.push(`${label} must be a supported platform/arch`);
    return;
  }
  const { tag, version, channel } = release;
  const expectedFeedUrl = `${publicUrl(urlOptions, targetPrefix(tag, target))}/`;
  if (target.feedUrl !== expectedFeedUrl) {
    errors.push(`${label}.feedUrl must be ${expectedFeedUrl}`);
  }
  if (!Array.isArray(target.artifacts) || target.artifacts.length === 0) {
    errors.push(`${label}.artifacts must be a non-empty array`);
    return;
  }
  const names = new Set();
  for (const [index, artifact] of target.artifacts.entries()) {
    const checked = validateArtifact(artifact, {
      tag,
      target,
      urlOptions,
      label: `${label}.artifacts[${index}]`,
      errors,
    });
    if (!checked) continue;
    if (names.has(checked.name)) errors.push(`${label}.artifacts has duplicate ${checked.name}`);
    names.add(checked.name);
  }
  for (const required of requiredPayloads(target, version)) {
    const matches = target.artifacts.filter(
      (artifact) => isPlainObject(artifact) && required.pattern.test(artifact.name),
    );
    if (matches.length !== 1) {
      errors.push(`${label} is missing required ${required.kind} matching ${required.pattern}`);
    } else if (matches[0].kind !== required.kind) {
      errors.push(`${label}.${matches[0].name} must have kind ${required.kind}`);
    }
  }
  for (const feed of feedFilenames(target.platform, channel)) {
    const matches = target.artifacts.filter(
      (artifact) => isPlainObject(artifact) && artifact.name === feed,
    );
    if (matches.length !== 1) {
      errors.push(`${label} is missing feed ${feed}`);
    } else if (matches[0].kind !== "feed") {
      errors.push(`${label}.${feed} must have kind feed`);
    }
  }
}

function validateReleaseNotesEntry(release, tag, urlOptions, label, errors) {
  const expectedNotesUrl = publicUrl(urlOptions, `${releasePrefix(tag)}/${NOTES_FILENAME}`);
  if (release.releaseNotesUrl !== expectedNotesUrl) {
    errors.push(`${label}.releaseNotesUrl must be ${expectedNotesUrl}`);
  }
  const notes = release.releaseNotes;
  if (!isPlainObject(notes)) {
    errors.push(`${label}.releaseNotes must be an object`);
  } else {
    if (notes.name !== NOTES_FILENAME)
      errors.push(`${label}.releaseNotes.name must be ${NOTES_FILENAME}`);
    if (notes.url !== expectedNotesUrl) {
      errors.push(`${label}.releaseNotes.url must equal releaseNotesUrl`);
    }
    if (typeof notes.sha256 !== "string" || !SHA256_PATTERN.test(notes.sha256)) {
      errors.push(`${label}.releaseNotes.sha256 must be 64 lowercase hex characters`);
    }
    if (!Number.isSafeInteger(notes.size) || notes.size <= 0) {
      errors.push(`${label}.releaseNotes.size must be a positive integer`);
    }
  }
}

export function validateRelease(release, tag, urlOptions = {}, label = `releases.${tag}`) {
  const errors = [];
  let parsed;
  try {
    parsed = parseDesktopTag(tag);
  } catch (error) {
    return [`${label}: ${error.message}`];
  }
  if (!isPlainObject(release)) return [`${label} must be an object`];
  if (release.tag !== tag) errors.push(`${label}.tag must equal ${tag}`);
  if (release.version !== parsed.version) {
    errors.push(`${label}.version must equal ${parsed.version}`);
  }
  if (release.channel !== parsed.channel) {
    errors.push(`${label}.channel must equal ${parsed.channel}`);
  }
  if (!isIsoInstant(release.publishedAt))
    errors.push(`${label}.publishedAt must be an ISO instant`);
  for (const key of ["sourceCommit", "upstreamCommit"]) {
    if (typeof release[key] !== "string" || !SHA1_PATTERN.test(release[key])) {
      errors.push(`${label}.${key} must be a 40-character lowercase hex SHA`);
    }
  }
  validatePlugins(release.plugins, label, errors);

  validateReleaseNotesEntry(release, tag, urlOptions, label, errors);
  try {
    const github = new URL(release.githubReleaseUrl);
    if (github.protocol !== "https:") errors.push(`${label}.githubReleaseUrl must use HTTPS`);
  } catch {
    errors.push(`${label}.githubReleaseUrl must be a URL`);
  }

  if (!Array.isArray(release.targets)) {
    errors.push(`${label}.targets must be an array`);
    return errors;
  }
  const seen = new Set();
  for (const [index, target] of release.targets.entries()) {
    validateTarget(target, parsed, urlOptions, `${label}.targets[${index}]`, errors);
    if (isPlainObject(target)) {
      const key = targetKey(target);
      if (seen.has(key)) errors.push(`${label}.targets has duplicate ${key}`);
      seen.add(key);
    }
  }
  for (const target of DESKTOP_TARGETS) {
    if (!seen.has(targetKey(target)))
      errors.push(`${label}.targets is missing ${targetKey(target)}`);
  }
  return errors;
}

export function validateCatalog(catalog, urlOptions = {}) {
  const errors = [];
  if (!isPlainObject(catalog)) return ["catalog must be an object"];
  if (catalog.schemaVersion !== CATALOG_SCHEMA_VERSION) {
    errors.push(`schemaVersion must be ${CATALOG_SCHEMA_VERSION}`);
  }
  if (!isPlainObject(catalog.releases)) {
    errors.push("releases must be an object keyed by tag");
    return errors;
  }
  for (const [tag, release] of Object.entries(catalog.releases)) {
    errors.push(...validateRelease(release, tag, urlOptions));
  }
  const channels = catalog.channels;
  if (!isPlainObject(channels)) {
    errors.push("channels must be an object");
    return errors;
  }
  for (const channel of CHANNELS) {
    const pointer = channels[channel];
    if (pointer === undefined) {
      errors.push(`channels.${channel} must be a tag or null`);
    } else if (pointer !== null) {
      const release = catalog.releases[pointer];
      if (!release) {
        errors.push(`channels.${channel} points at ${pointer}, which is not in releases`);
      } else if (channel === "stable" && release.channel !== "stable") {
        errors.push(`channels.stable must point at a stable release, got ${pointer}`);
      }
    }
  }
  if (isPlainObject(channels) && channels.stable && channels.beta) {
    try {
      if (compareDesktopTags(channels.beta, channels.stable) < 0) {
        errors.push("channels.beta must not be older than channels.stable");
      }
    } catch {
      // Invalid pointers are reported above.
    }
  }
  return errors;
}

export function assertValidCatalog(catalog, urlOptions) {
  const errors = validateCatalog(catalog, urlOptions);
  if (errors.length > 0) {
    throw new Error(`Invalid desktop release catalog:\n- ${errors.join("\n- ")}`);
  }
  return catalog;
}

export function emptyCatalog() {
  return {
    schemaVersion: CATALOG_SCHEMA_VERSION,
    channels: { stable: null, beta: null },
    releases: {},
  };
}

// ---------------------------------------------------------------------------
// Catalog construction and merging
// ---------------------------------------------------------------------------

export function buildReleaseEntry({
  tag,
  publishedAt,
  sourceCommit,
  upstreamCommit,
  plugins,
  notes,
  githubReleaseUrl,
  targets,
  urlOptions = {},
}) {
  const parsed = parseDesktopTag(tag);
  const notesUrl = publicUrl(urlOptions, `${releasePrefix(tag)}/${NOTES_FILENAME}`);
  return {
    tag,
    version: parsed.version,
    channel: parsed.channel,
    publishedAt,
    sourceCommit,
    upstreamCommit,
    plugins,
    releaseNotesUrl: notesUrl,
    releaseNotes: {
      name: NOTES_FILENAME,
      kind: "notes",
      url: notesUrl,
      sha256: notes.sha256,
      size: notes.size,
    },
    githubReleaseUrl,
    targets,
  };
}

// Channel pointers are a semantic maximum, never "last writer wins". Stable accepts stable
// releases only; beta accepts every release so it also receives a newer final stable.
function advanceChannels(channels, releases) {
  const stable = highestDesktopTag([
    channels.stable,
    ...Object.keys(releases).filter((tag) => releases[tag].channel === "stable"),
  ]);
  const beta = highestDesktopTag([channels.beta, stable, ...Object.keys(releases)]);
  return { stable, beta };
}

export function candidateCatalog(release) {
  return {
    schemaVersion: CATALOG_SCHEMA_VERSION,
    channels: advanceChannels({ stable: null, beta: null }, { [release.tag]: release }),
    releases: { [release.tag]: release },
  };
}

function withoutPublishedAt(release) {
  const { publishedAt: _publishedAt, ...rest } = release;
  return rest;
}

export function releasesEquivalent(left, right) {
  return stableStringify(withoutPublishedAt(left)) === stableStringify(withoutPublishedAt(right));
}

// Merge one release into the currently published catalog (or an empty one). Existing tags
// are immutable: an equivalent entry is kept as published, a different one aborts.
export function mergeRelease(remote, release) {
  const base = remote ?? emptyCatalog();
  const existing = base.releases[release.tag];
  if (existing && !releasesEquivalent(existing, release)) {
    throw new Error(
      `Release ${release.tag} is already in the catalog with different content. Published releases are immutable.`,
    );
  }
  const releases = { ...base.releases, [release.tag]: existing ?? release };
  const channels = advanceChannels(base.channels, releases);
  return sortCatalog({ schemaVersion: CATALOG_SCHEMA_VERSION, channels, releases });
}

export function sortCatalog(catalog) {
  const tags = Object.keys(catalog.releases).sort((a, b) => compareDesktopTags(b, a));
  return {
    schemaVersion: catalog.schemaVersion,
    channels: { stable: catalog.channels.stable ?? null, beta: catalog.channels.beta ?? null },
    releases: Object.fromEntries(tags.map((tag) => [tag, catalog.releases[tag]])),
  };
}

export function stableStringify(value) {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  if (isPlainObject(value)) {
    return `{${Object.keys(value)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

export function serializeCatalog(catalog) {
  return `${JSON.stringify(sortCatalog(catalog), null, 2)}\n`;
}

// Every immutable object a release publishes, as {objectName, name, kind, sha256, size}.
export function releaseObjects(release, urlOptions = {}) {
  const objects = [];
  for (const target of release.targets) {
    for (const artifact of target.artifacts) {
      objects.push({
        objectName: objectNameFromUrl(artifact.url, urlOptions),
        name: artifact.name,
        kind: artifact.kind,
        sha256: artifact.sha256,
        size: artifact.size,
      });
    }
  }
  objects.push({
    objectName: objectNameFromUrl(release.releaseNotes.url, urlOptions),
    name: release.releaseNotes.name,
    kind: "notes",
    sha256: release.releaseNotes.sha256,
    size: release.releaseNotes.size,
  });
  return objects;
}
