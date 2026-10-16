// Docs release tooling run from the stable-tag job in desktop-release.yml.
//   write-notes  put the release's notes into the "What changed" page before the site is built
//   publish      upload a generated site to vX.Y.Z/ in the docs bucket and CAS-merge versions.json
// Authentication is a short-lived OAuth access token (GCS_ACCESS_TOKEN); no key files are read.
import { readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { parseArgs } from "node:util";
import { isMainModule } from "../is-main-module.mjs";
import {
  DEFAULT_API_BASE,
  createGcsClient,
  resolveAccessToken,
} from "../desktop-release/publish-release.mjs";
import {
  CATALOG_CACHE_CONTROL,
  IMMUTABLE_CACHE_CONTROL,
  compareDesktopTags,
  parseDesktopTag,
  stableStringify,
} from "../desktop-release/release-data.mjs";

export const MANIFEST_OBJECT = "versions.json";
export const MANIFEST_SCHEMA_VERSION = 1;
export const MANIFEST_CACHE_CONTROL = CATALOG_CACHE_CONTROL;
const FILE_CACHE_CONTROL = "public, max-age=300";
const DEFAULT_MANIFEST_ATTEMPTS = 5;
const UPLOAD_CONCURRENCY = 8;

export class ManifestConflictError extends Error {}

// ---------------------------------------------------------------------------
// write-notes
// ---------------------------------------------------------------------------

export function writeNotes({ notesPath, outPath }) {
  const notes = readFileSync(notesPath, "utf8").trim();
  if (!notes) throw new Error(`Release notes ${notesPath} are empty.`);
  const page = readFileSync(outPath, "utf8");
  const frontmatter = page.match(/^---\r?\n[\s\S]*?\r?\n---\r?\n/);
  if (!frontmatter) throw new Error(`${outPath} has no frontmatter to keep.`);
  writeFileSync(outPath, `${frontmatter[0]}\n${notes}\n`);
}

// ---------------------------------------------------------------------------
// publish
// ---------------------------------------------------------------------------

function listFiles(root) {
  const files = [];
  const walk = (dir) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (entry.isFile()) files.push(full);
    }
  };
  walk(root);
  return files.sort();
}

function parseManifest(current) {
  if (!current) return { generation: 0, manifest: null };
  const manifest = JSON.parse(current.bytes.toString("utf8"));
  if (manifest.schemaVersion !== MANIFEST_SCHEMA_VERSION || !Array.isArray(manifest.versions)) {
    throw new Error(`${MANIFEST_OBJECT} has an unsupported shape; refusing to overwrite it.`);
  }
  return { generation: current.generation, manifest };
}

export function mergeVersion(manifest, entry) {
  const others = (manifest?.versions ?? []).filter((existing) => existing.tag !== entry.tag);
  const versions = [...others, entry].sort((a, b) => compareDesktopTags(b.tag, a.tag));
  return { schemaVersion: MANIFEST_SCHEMA_VERSION, latest: versions[0].version, versions };
}

// createGcsClient.upload() always sends ifGenerationMatch, so overwriting a leftover object from
// a partial earlier attempt means reading its generation first. One retry covers a racing rerun.
async function uploadOverwriting(client, name, source, cacheControl) {
  for (let attempt = 1; attempt <= 2; attempt += 1) {
    const existing = await client.readBytes(name);
    const written = await client.upload(name, source, {
      ifGenerationMatch: existing?.generation ?? 0,
      cacheControl,
    });
    if (written) return;
  }
  throw new Error(`Could not upload ${name}: its generation kept changing.`);
}

async function uploadTree(client, { root, prefix, log }) {
  const files = listFiles(root);
  if (files.length === 0) throw new Error(`No files to publish under ${root}.`);
  let next = 0;
  const worker = async () => {
    while (next < files.length) {
      const file = files[next++];
      const relative = path.relative(root, file).split(path.sep).join("/");
      const name = `${prefix}${relative}`;
      const cacheControl = relative.startsWith("_nuxt/")
        ? IMMUTABLE_CACHE_CONTROL
        : FILE_CACHE_CONTROL;
      await uploadOverwriting(
        client,
        name,
        { path: file, size: statSync(file).size },
        cacheControl,
      );
    }
  };
  await Promise.all(Array.from({ length: Math.min(UPLOAD_CONCURRENCY, files.length) }, worker));
  log(`Uploaded ${files.length} files to ${prefix}`);
  return files.length;
}

async function mergeManifest(client, entry, { attempts, sleep, log }) {
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    const { generation, manifest } = parseManifest(await client.readBytes(MANIFEST_OBJECT));
    if (manifest?.versions.some((existing) => existing.tag === entry.tag)) {
      return { changed: false };
    }
    const merged = mergeVersion(manifest, entry);
    const written = await client.upload(
      MANIFEST_OBJECT,
      Buffer.from(`${stableStringify(merged)}\n`, "utf8"),
      { ifGenerationMatch: generation, cacheControl: MANIFEST_CACHE_CONTROL },
    );
    if (written) return { changed: true, latest: merged.latest };
    log(
      `${MANIFEST_OBJECT} changed during publish (generation ${generation}); reloading (attempt ${attempt}/${attempts}).`,
    );
    await sleep(100 * attempt);
  }
  throw new ManifestConflictError(
    `Could not update ${MANIFEST_OBJECT} after ${attempts} compare-and-swap attempts. The version files are uploaded; rerun the same tag.`,
  );
}

export async function publishDocs({
  tag,
  root,
  bucket,
  publishedAt,
  token,
  apiBase = DEFAULT_API_BASE,
  manifestAttempts = DEFAULT_MANIFEST_ATTEMPTS,
  sleep = delay,
  log = (message) => process.stderr.write(`${message}\n`),
}) {
  if (!token) throw new Error("A GCS access token is required (set GCS_ACCESS_TOKEN).");
  if (!bucket) throw new Error("A docs bucket is required (--bucket or ZEKODER_DOCS_BUCKET).");
  if (!publishedAt || Number.isNaN(Date.parse(publishedAt))) {
    throw new Error("--published-at must be an ISO 8601 timestamp.");
  }
  const parsed = parseDesktopTag(tag);
  if (parsed.channel !== "stable") {
    throw new Error(`Docs are published for stable tags only; ${tag} is a ${parsed.channel} tag.`);
  }

  const client = createGcsClient({ apiBase, bucket, token, sleep });
  const { manifest } = parseManifest(await client.readBytes(MANIFEST_OBJECT));
  if (manifest?.versions.some((existing) => existing.tag === tag)) {
    log(`${MANIFEST_OBJECT} already lists ${tag}; nothing to publish.`);
    return { tag, uploaded: 0, manifestChanged: false };
  }

  const uploaded = await uploadTree(client, { root, prefix: `${tag}/`, log });
  const entry = { version: parsed.version, tag, path: `/${tag}/`, publishedAt };
  const result = await mergeManifest(client, entry, { attempts: manifestAttempts, sleep, log });
  log(
    result.changed
      ? `${MANIFEST_OBJECT} now lists ${tag} (latest ${result.latest}).`
      : `${MANIFEST_OBJECT} already lists ${tag}.`,
  );
  return { tag, uploaded, manifestChanged: result.changed };
}

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------

async function main(argv) {
  const [command, ...rest] = argv;
  if (command === "write-notes") {
    const { values } = parseArgs({
      args: rest,
      options: { notes: { type: "string" }, out: { type: "string" } },
      strict: true,
    });
    if (!values.notes || !values.out) {
      throw new Error("Usage: docs-release.mjs write-notes --notes <file> --out <page.md>");
    }
    writeNotes({ notesPath: values.notes, outPath: values.out });
    return;
  }
  if (command === "publish") {
    const { values } = parseArgs({
      args: rest,
      options: {
        tag: { type: "string" },
        root: { type: "string" },
        bucket: { type: "string", default: process.env.ZEKODER_DOCS_BUCKET },
        "published-at": { type: "string" },
        "api-base": { type: "string", default: DEFAULT_API_BASE },
      },
      strict: true,
    });
    if (!values.tag || !values.root || !values["published-at"]) {
      throw new Error(
        "Usage: docs-release.mjs publish --tag vX.Y.Z --root <site dir> --bucket <b> --published-at <iso>",
      );
    }
    const result = await publishDocs({
      tag: values.tag,
      root: path.resolve(values.root),
      bucket: values.bucket,
      publishedAt: values["published-at"],
      apiBase: values["api-base"],
      token: resolveAccessToken(),
    });
    process.stdout.write(`${JSON.stringify(result)}\n`);
    return;
  }
  throw new Error("Usage: docs-release.mjs <write-notes|publish> [options]");
}

if (isMainModule(import.meta.url)) {
  main(process.argv.slice(2)).catch((error) => {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 1;
  });
}
