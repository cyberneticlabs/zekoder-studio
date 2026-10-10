import { execFileSync as nodeExecFileSync } from "node:child_process";
import { isMainModule } from "./is-main-module.mjs";

function parseJson(output) {
  return JSON.parse(output);
}

function isNotFoundError(error) {
  return String(error?.stderr ?? "").includes("HTTP 404");
}

const RELEASES_PAGE_SIZE = 100;
const MAX_RELEASE_PAGES = 50;

// Drafts are invisible to releases/tags/{tag}, so list releases page by page and match the
// draft's exact tag_name. Never match by title and never stop at the first page.
export function listDraftReleasesForTag(repo, tag, execFileSync = nodeExecFileSync) {
  const matches = [];
  for (let page = 1; page <= MAX_RELEASE_PAGES; page += 1) {
    const releases = parseJson(
      execFileSync(
        "gh",
        ["api", `repos/${repo}/releases?per_page=${RELEASES_PAGE_SIZE}&page=${page}`],
        { encoding: "utf8" },
      ),
    );
    for (const release of releases) {
      if (release.draft === true && release.tag_name === tag) matches.push(release);
    }
    if (releases.length < RELEASES_PAGE_SIZE) return matches;
  }
  throw new Error(`Gave up listing releases for ${repo} after ${MAX_RELEASE_PAGES} pages.`);
}

// allowDuplicates keeps the historical behavior for duplicate-cleanup callers (oldest wins);
// every other caller gets an error instead of a silently chosen draft.
export function getGitHubRelease(repo, tag, execFileSync = nodeExecFileSync, options = {}) {
  try {
    return parseJson(
      execFileSync("gh", ["api", `repos/${repo}/releases/tags/${tag}`], {
        encoding: "utf8",
        stdio: ["ignore", "pipe", "pipe"],
      }),
    );
  } catch (error) {
    if (!isNotFoundError(error)) {
      throw error;
    }
  }
  const drafts = listDraftReleasesForTag(repo, tag, execFileSync).sort((a, b) => a.id - b.id);
  if (drafts.length > 1 && !options.allowDuplicates) {
    throw new Error(
      `Ambiguous draft releases for ${tag} in ${repo}: ids ${drafts.map((draft) => draft.id).join(", ")}. Delete the duplicates and retry.`,
    );
  }
  return drafts[0] ?? null;
}

// Draft html_url values use a throwaway untagged-* slug that stops working once the release is
// published; the tag URL is the stable address for the same release.
export function getCanonicalReleaseUrl(release, repo, tag) {
  const origin = release?.html_url ? new URL(release.html_url).origin : "https://github.com";
  return `${origin}/${repo}/releases/tag/${encodeURIComponent(tag)}`;
}

export function getReleaseLookupTag(release) {
  if (release.draft === true && release.html_url) {
    return new URL(release.html_url).pathname.split("/").at(-1);
  }
  return release.tag_name;
}

function parseArgs(argv) {
  let repo = "";
  let tag = "";
  let cleanupDuplicates = false;
  for (let index = 0; index < argv.length; index += 1) {
    if (argv[index] === "--repo") {
      repo = argv[index + 1] ?? "";
      index += 1;
    } else if (argv[index] === "--tag") {
      tag = argv[index + 1] ?? "";
      index += 1;
    } else if (argv[index] === "--cleanup-duplicates") {
      cleanupDuplicates = true;
    } else {
      throw new Error(`Unknown argument: ${argv[index]}`);
    }
  }
  if (!repo || !tag) {
    throw new Error("Usage: node scripts/github-release.mjs --repo <owner/repo> --tag <tag>");
  }
  return { cleanupDuplicates, repo, tag };
}

if (isMainModule(import.meta.url)) {
  const { cleanupDuplicates, repo, tag } = parseArgs(process.argv.slice(2));
  let release = null;
  for (let attempt = 0; attempt < 5 && !release; attempt += 1) {
    release = getGitHubRelease(repo, tag, nodeExecFileSync, { allowDuplicates: cleanupDuplicates });
    if (!release && attempt < 4) {
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 1_000);
    }
  }
  if (!release) {
    process.exitCode = 1;
  } else {
    if (cleanupDuplicates && release.draft === true) {
      const duplicateIds = listDraftReleasesForTag(repo, tag)
        .filter((draft) => draft.id !== release.id)
        .map((draft) => draft.id);
      for (const duplicateId of duplicateIds) {
        nodeExecFileSync("gh", [
          "api",
          "--method",
          "DELETE",
          `repos/${repo}/releases/${duplicateId}`,
        ]);
      }
    }
    process.stdout.write(`${getReleaseLookupTag(release)}\n`);
  }
}
