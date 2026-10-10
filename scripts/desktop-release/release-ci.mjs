// CI entry points for the tag-triggered Zekoder desktop release workflow
// (.github/workflows/desktop-release.yml). Each subcommand is a small, testable step that the
// workflow calls so the release rules live in code, not in YAML shell:
//
//   preflight                 strict tag + source + provenance checks; emits workflow outputs
//   verify-tag                the tag still resolves to the commit captured by preflight
//   set-version               stamp the tag's version into the desktop package metadata
//   fetch-notes               copy the matching GitHub Release draft into a validated artifact
//   verify-packaged           packaged app.asar version equals the tag version
//   provenance                per-target build provenance, including every file's SHA-256
//   finalize                  publish the GitHub Release draft after the catalog lists the tag
//
// Publication itself stays in prepare-release.mjs and publish-release.mjs.
import { execFileSync as nodeExecFileSync } from "node:child_process";
import {
  appendFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  writeFileSync,
} from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { parseArgs } from "node:util";
import {
  getCanonicalReleaseUrl,
  getGitHubRelease,
  getReleaseLookupTag,
} from "../github-release.mjs";
import { isMainModule } from "../is-main-module.mjs";
import { hashFileSync } from "./prepare-release.mjs";
import {
  CATALOG_OBJECT,
  DEFAULT_BUCKET,
  DEFAULT_PUBLIC_BASE,
  parseDesktopTag,
  pluginsFromLock,
  publicUrl,
  resolveUpstreamCommit,
  sha256Hex,
  validateCatalog,
  validateGitHubReleaseForTag,
} from "./release-data.mjs";

const SHA1_PATTERN = /^[0-9a-f]{40}$/;

// Electron's channel file names: stable publishes latest*.yml, beta publishes beta*.yml.
export function builderChannel(channel) {
  return channel === "stable" ? "latest" : "beta";
}

function resolveTagCommit(git, tag) {
  let kind;
  try {
    kind = git(["cat-file", "-t", `refs/tags/${tag}`]).trim();
  } catch {
    throw new Error(`Tag ${tag} does not exist in this checkout. Fetch tags before this step.`);
  }
  const commit = git(["rev-parse", "--verify", `refs/tags/${tag}^{commit}`]).trim();
  if (!SHA1_PATTERN.test(commit)) throw new Error(`Could not resolve ${tag} to a commit.`);
  return { kind, commit };
}

// The catalog is public. A missing manifest means nothing has been published yet.
export async function fetchPublicCatalog({
  bucket = DEFAULT_BUCKET,
  publicBase = DEFAULT_PUBLIC_BASE,
  fetchImpl = fetch,
} = {}) {
  const url = publicUrl({ bucket, publicBase }, CATALOG_OBJECT);
  const response = await fetchImpl(url, { headers: { "Cache-Control": "no-cache" } });
  if (response.status === 404) return null;
  if (!response.ok) throw new Error(`Reading ${url} failed with HTTP ${response.status}.`);
  const catalog = await response.json();
  const problems = validateCatalog(catalog, { bucket, publicBase });
  if (problems.length > 0) throw new Error(`${url} is invalid: ${problems.join("; ")}`);
  return catalog;
}

// Everything that can be rejected before a single runner spends minutes building.
export async function runPreflight({ tag, sha, git, fetchCatalog }) {
  const parsed = parseDesktopTag(tag);
  const { kind, commit } = resolveTagCommit(git, tag);
  if (kind !== "tag") {
    throw new Error(
      `${tag} is a lightweight tag. Release tags must be annotated (git tag -a) so the tag date is fixed.`,
    );
  }
  if (sha !== undefined && sha !== commit) {
    throw new Error(`${tag} resolves to ${commit}, but the workflow was started for ${sha}.`);
  }
  const taggerSeconds = Number(
    git(["for-each-ref", "--format=%(taggerdate:unix)", `refs/tags/${tag}`]).trim(),
  );
  if (!Number.isSafeInteger(taggerSeconds) || taggerSeconds <= 0) {
    throw new Error(`Could not read the tagger date of ${tag}.`);
  }
  const { upstreamCommit } = resolveUpstreamCommit(git, commit);
  let lock;
  try {
    lock = JSON.parse(git(["show", `${commit}:plugins/zekoder.lock.json`]));
  } catch (error) {
    throw new Error(`Could not read plugins/zekoder.lock.json at ${commit}: ${error.message}`, {
      cause: error,
    });
  }
  pluginsFromLock(lock);

  let alreadyPublished = false;
  const catalog = fetchCatalog ? await fetchCatalog() : null;
  const existing = catalog?.releases?.[tag];
  if (existing) {
    if (existing.sourceCommit !== commit) {
      throw new Error(
        `${tag} is already published from ${existing.sourceCommit}, but now resolves to ${commit}. Release tags are immutable.`,
      );
    }
    alreadyPublished = true;
  }
  return {
    tag,
    version: parsed.version,
    channel: parsed.channel,
    builder_channel: builderChannel(parsed.channel),
    prerelease: String(parsed.channel === "beta"),
    source_sha: commit,
    published_at: new Date(taggerSeconds * 1000).toISOString(),
    upstream_commit: upstreamCommit,
    already_published: String(alreadyPublished),
  };
}

export function verifyTag({ tag, sha, git }) {
  parseDesktopTag(tag);
  const { commit } = resolveTagCommit(git, tag);
  if (commit !== sha) {
    throw new Error(
      `${tag} now resolves to ${commit}, not the ${sha} that was built. Refusing to publish a moved tag.`,
    );
  }
  return { tag, source_sha: commit };
}

// Sets the packaged desktop version without npm's version lifecycle (which also touches every
// workspace, the F-Droid changelogs and git). Only the package manifest and its lock entry move.
export function setDesktopVersion({ tag, root }) {
  const { version } = parseDesktopTag(tag);
  const manifestPath = path.join(root, "packages", "desktop", "package.json");
  const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
  manifest.version = version;
  writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);

  const lockPath = path.join(root, "package-lock.json");
  if (existsSync(lockPath)) {
    const lock = JSON.parse(readFileSync(lockPath, "utf8"));
    const entry = lock.packages?.["packages/desktop"];
    if (!entry) {
      throw new Error("package-lock.json has no packages/desktop entry to synchronize.");
    }
    entry.version = version;
    writeFileSync(lockPath, `${JSON.stringify(lock, null, 2)}\n`);
  }
  return { version };
}

// Captures the GitHub Release (draft allowed) exactly once, in the job that is allowed to read
// private drafts. The publication job only ever sees this validated copy.
export function fetchNotes({ tag, repo, outputDir, fetchRelease }) {
  const release = fetchRelease(repo, tag);
  const notes = validateGitHubReleaseForTag(release, tag);
  if (release.draft !== true) {
    throw new Error(
      `GitHub Release for ${tag} is already published. Notes must be a draft before the tag is pushed.`,
    );
  }
  mkdirSync(outputDir, { recursive: true });
  const captured = {
    id: release.id,
    tag_name: release.tag_name,
    draft: release.draft,
    prerelease: Boolean(release.prerelease),
    body: notes,
    html_url: release.html_url,
  };
  writeFileSync(path.join(outputDir, "release.json"), `${JSON.stringify(captured, null, 2)}\n`);
  return {
    release_url: getCanonicalReleaseUrl(release, repo, tag),
    notes_sha256: sha256Hex(Buffer.from(notes, "utf8")),
  };
}

function* packagedAsarCandidates(releaseDir) {
  for (const entry of readdirSync(releaseDir, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const dir = path.join(releaseDir, entry.name);
    yield path.join(dir, "resources", "app.asar");
    for (const inner of readdirSync(dir, { withFileTypes: true })) {
      if (inner.isDirectory() && inner.name.endsWith(".app")) {
        yield path.join(dir, inner.name, "Contents", "Resources", "app.asar");
      }
    }
  }
}

// What electron-builder packaged, not what we meant to package: the version the installed app
// reports through app.getVersion() comes from this manifest.
export function verifyPackagedVersion({
  tag,
  releaseDir,
  extractManifest = (asarPath) => {
    const asar = createRequire(import.meta.url)("@electron/asar");
    return JSON.parse(asar.extractFile(asarPath, "package.json").toString("utf8"));
  },
}) {
  const { version } = parseDesktopTag(tag);
  const asarPaths = [...packagedAsarCandidates(releaseDir)].filter((candidate) =>
    existsSync(candidate),
  );
  if (asarPaths.length === 0) {
    throw new Error(`No packaged app.asar found under ${releaseDir}.`);
  }
  for (const asarPath of asarPaths) {
    const manifest = extractManifest(asarPath);
    if (manifest.version !== version) {
      throw new Error(
        `${asarPath} packages version ${manifest.version}, expected ${version} from ${tag}.`,
      );
    }
  }
  return { version, checked: asarPaths.length };
}

export function writeProvenance({ dir, tag, sha, target, signing, runner }) {
  const files = readdirSync(dir, { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name !== "provenance.json")
    .map((entry) => entry.name)
    .sort()
    .map((name) => {
      const { sha256, size } = hashFileSync(path.join(dir, name));
      return { name, sha256, size };
    });
  if (files.length === 0) throw new Error(`No build outputs found in ${dir}.`);
  const provenance = { tag, sourceCommit: sha, target, signing, runner, files };
  writeFileSync(path.join(dir, "provenance.json"), `${JSON.stringify(provenance, null, 2)}\n`);
  return provenance;
}

// Runs after the catalog lists the tag: the GitHub Release becomes visible only now. Rerunning
// after a partial failure is safe because every branch checks the live state first.
export async function finalizeRelease({
  tag,
  repo,
  sha,
  fetchCatalog,
  fetchRelease,
  execFileSync = nodeExecFileSync,
}) {
  const parsed = parseDesktopTag(tag);
  const catalog = await fetchCatalog();
  const entry = catalog?.releases?.[tag];
  if (!entry) {
    throw new Error(`The desktop catalog does not list ${tag}; refusing to finalize the release.`);
  }
  if (sha !== undefined && entry.sourceCommit !== sha) {
    throw new Error(`The catalog lists ${tag} from ${entry.sourceCommit}, not ${sha}.`);
  }
  const release = fetchRelease(repo, tag);
  const notes = validateGitHubReleaseForTag(release, tag);
  const notesMatch = sha256Hex(Buffer.from(notes, "utf8")) === entry.releaseNotes.sha256;
  if (release.draft !== true) {
    return { tag, finalized: false, alreadyPublished: true, notesMatch };
  }
  const args = [
    "release",
    "edit",
    getReleaseLookupTag(release),
    "--tag",
    tag,
    "--draft=false",
    `--prerelease=${parsed.channel === "beta"}`,
    "--repo",
    repo,
  ];
  execFileSync("gh", args, { encoding: "utf8", stdio: ["ignore", "pipe", "inherit"] });
  return { tag, finalized: true, alreadyPublished: false, notesMatch };
}

function emitOutputs(outputs, githubOutput) {
  const text = Object.entries(outputs)
    .map(([key, value]) => `${key}=${value}\n`)
    .join("");
  if (githubOutput) appendFileSync(githubOutput, text);
  process.stdout.write(text);
}

const COMMON_OPTIONS = {
  tag: { type: "string" },
  sha: { type: "string" },
  repo: { type: "string", default: process.env.GITHUB_REPOSITORY },
  root: { type: "string", default: process.cwd() },
  bucket: { type: "string", default: process.env.ZEKODER_RELEASE_BUCKET || DEFAULT_BUCKET },
  "public-base": { type: "string", default: DEFAULT_PUBLIC_BASE },
  "github-output": { type: "string", default: process.env.GITHUB_OUTPUT },
  output: { type: "string" },
  dir: { type: "string" },
  target: { type: "string" },
  signing: { type: "string" },
  runner: { type: "string" },
};

function need(values, ...names) {
  for (const name of names) {
    if (!values[name]) throw new Error(`Missing required --${name}.`);
  }
}

export async function main(argv) {
  const [command, ...rest] = argv;
  const { values } = parseArgs({ args: rest, options: COMMON_OPTIONS, strict: true });
  const root = path.resolve(values.root);
  const git = (args) => nodeExecFileSync("git", args, { cwd: root, encoding: "utf8" });
  const catalogOptions = { bucket: values.bucket, publicBase: values["public-base"] };

  switch (command) {
    case "preflight": {
      need(values, "tag");
      const outputs = await runPreflight({
        tag: values.tag,
        sha: values.sha,
        git,
        fetchCatalog: () => fetchPublicCatalog(catalogOptions),
      });
      emitOutputs(outputs, values["github-output"]);
      return;
    }
    case "verify-tag": {
      need(values, "tag", "sha");
      emitOutputs(verifyTag({ tag: values.tag, sha: values.sha, git }));
      return;
    }
    case "set-version": {
      need(values, "tag");
      emitOutputs(setDesktopVersion({ tag: values.tag, root }));
      return;
    }
    case "fetch-notes": {
      need(values, "tag", "repo", "output");
      const outputs = fetchNotes({
        tag: values.tag,
        repo: values.repo,
        outputDir: path.resolve(values.output),
        fetchRelease: (releaseRepo, releaseTag) => getGitHubRelease(releaseRepo, releaseTag),
      });
      emitOutputs(outputs, values["github-output"]);
      return;
    }
    case "verify-packaged": {
      need(values, "tag", "dir");
      emitOutputs(verifyPackagedVersion({ tag: values.tag, releaseDir: path.resolve(values.dir) }));
      return;
    }
    case "provenance": {
      need(values, "tag", "sha", "dir", "target", "signing");
      writeProvenance({
        dir: path.resolve(values.dir),
        tag: values.tag,
        sha: values.sha,
        target: values.target,
        signing: values.signing,
        runner: values.runner ?? "",
      });
      return;
    }
    case "finalize": {
      need(values, "tag", "repo", "sha");
      const result = await finalizeRelease({
        tag: values.tag,
        repo: values.repo,
        sha: values.sha,
        fetchCatalog: () => fetchPublicCatalog(catalogOptions),
        fetchRelease: (releaseRepo, releaseTag) => getGitHubRelease(releaseRepo, releaseTag),
      });
      if (!result.notesMatch) {
        process.stderr.write(
          `::warning::The GitHub Release body for ${values.tag} differs from the notes published to GCS.\n`,
        );
      }
      emitOutputs({ finalized: String(result.finalized) });
      return;
    }
    default:
      throw new Error(
        "Usage: node scripts/desktop-release/release-ci.mjs <preflight|verify-tag|set-version|fetch-notes|verify-packaged|provenance|finalize> [options]",
      );
  }
}

if (isMainModule(import.meta.url)) {
  main(process.argv.slice(2)).catch((error) => {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 1;
  });
}
