// Publishes a prepared desktop release (see prepare-release.mjs) to GCS using the JSON API with
// generation preconditions. Immutable objects are uploaded with ifGenerationMatch=0 (or proven
// identical byte-for-byte when they already exist), every object is read back, and only then is
// the catalog compare-and-swap merged last. Authentication is a short-lived OAuth access token
// supplied by the runner (GCS_ACCESS_TOKEN from google-github-actions/auth, or gcloud); no key
// files are read or written.
import { execFileSync as nodeExecFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { createReadStream, readFileSync } from "node:fs";
import http from "node:http";
import https from "node:https";
import path from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { parseArgs } from "node:util";
import { isMainModule } from "../is-main-module.mjs";
import {
  CATALOG_CACHE_CONTROL,
  CATALOG_OBJECT,
  DEFAULT_BUCKET,
  DEFAULT_PUBLIC_BASE,
  IMMUTABLE_CACHE_CONTROL,
  assertValidCatalog,
  mergeRelease,
  releaseObjects,
  serializeCatalog,
  stableStringify,
} from "./release-data.mjs";
import { hashFileSync } from "./prepare-release.mjs";

export const DEFAULT_API_BASE = "https://storage.googleapis.com";
const MAX_REQUEST_ATTEMPTS = 4;
const DEFAULT_CATALOG_ATTEMPTS = 5;

export class ImmutableMismatchError extends Error {}
export class CatalogConflictError extends Error {}

class GcsHttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

function contentTypeFor(objectName) {
  if (objectName.endsWith(".json")) return "application/json";
  if (objectName.endsWith(".yml")) return "text/yaml; charset=utf-8";
  if (objectName.endsWith(".md")) return "text/markdown; charset=utf-8";
  return "application/octet-stream";
}

function send(url, { method = "GET", headers = {}, body } = {}) {
  const target = new URL(url);
  const transport = target.protocol === "http:" ? http : https;
  return new Promise((resolve, reject) => {
    const request = transport.request(target, { method, headers }, (response) => resolve(response));
    request.on("error", reject);
    if (body === undefined) {
      request.end();
    } else if (typeof body === "object" && body.path) {
      const stream = createReadStream(body.path);
      stream.on("error", reject);
      stream.pipe(request);
    } else {
      request.end(body);
    }
  });
}

async function readBody(response) {
  const chunks = [];
  for await (const chunk of response) chunks.push(chunk);
  return Buffer.concat(chunks);
}

function retryable(error) {
  return !(error instanceof GcsHttpError) || error.status >= 500 || error.status === 429;
}

export function createGcsClient({ apiBase = DEFAULT_API_BASE, bucket, token, sleep = delay }) {
  const base = apiBase.replace(/\/+$/, "");
  const objectPath = (name) =>
    `${base}/storage/v1/b/${encodeURIComponent(bucket)}/o/${encodeURIComponent(name)}`;
  const authorization = { Authorization: `Bearer ${token}` };

  async function withRetry(operation) {
    for (let attempt = 1; ; attempt += 1) {
      try {
        return await operation();
      } catch (error) {
        if (attempt >= MAX_REQUEST_ATTEMPTS || !retryable(error)) throw error;
        await sleep(250 * 2 ** (attempt - 1));
      }
    }
  }

  async function failFor(response, action) {
    const text = (await readBody(response)).toString("utf8").slice(0, 500);
    return new GcsHttpError(
      response.statusCode,
      `${action} failed with HTTP ${response.statusCode}: ${text}`,
    );
  }

  // Returns {sha256, size, generation} of the stored bytes (read back, not metadata) or null.
  async function readStored(name) {
    return withRetry(async () => {
      const response = await send(`${objectPath(name)}?alt=media`, { headers: authorization });
      if (response.statusCode === 404) {
        await readBody(response);
        return null;
      }
      if (response.statusCode !== 200) throw await failFor(response, `Reading ${name}`);
      const hash = createHash("sha256");
      let size = 0;
      for await (const chunk of response) {
        hash.update(chunk);
        size += chunk.length;
      }
      return {
        sha256: hash.digest("hex"),
        size,
        generation: Number(response.headers["x-goog-generation"] ?? 0),
      };
    });
  }

  async function readBytes(name) {
    return withRetry(async () => {
      const response = await send(`${objectPath(name)}?alt=media`, { headers: authorization });
      if (response.statusCode === 404) {
        await readBody(response);
        return null;
      }
      if (response.statusCode !== 200) throw await failFor(response, `Reading ${name}`);
      return {
        bytes: await readBody(response),
        generation: Number(response.headers["x-goog-generation"] ?? 0),
      };
    });
  }

  // Resumable upload with a generation precondition. Resolves false when the precondition
  // fails (HTTP 412) so callers decide between replay and conflict handling.
  async function upload(name, source, { ifGenerationMatch, cacheControl }) {
    return withRetry(async () => {
      const length = Buffer.isBuffer(source) ? source.length : source.size;
      const contentType = contentTypeFor(name);
      const metadata = JSON.stringify({ name, contentType, cacheControl });
      const init = await send(
        `${base}/upload/storage/v1/b/${encodeURIComponent(bucket)}/o?uploadType=resumable&name=${encodeURIComponent(name)}&ifGenerationMatch=${ifGenerationMatch}`,
        {
          method: "POST",
          headers: {
            ...authorization,
            "Content-Type": "application/json; charset=utf-8",
            "Content-Length": Buffer.byteLength(metadata),
            "X-Upload-Content-Type": contentType,
            "X-Upload-Content-Length": length,
          },
          body: metadata,
        },
      );
      if (init.statusCode === 412) {
        await readBody(init);
        return false;
      }
      if (init.statusCode !== 200) throw await failFor(init, `Starting upload of ${name}`);
      await readBody(init);
      const location = init.headers.location;
      if (!location) throw new Error(`Upload of ${name} did not return a session URI.`);
      const put = await send(new URL(location, base).toString(), {
        method: "PUT",
        headers: { "Content-Type": contentType, "Content-Length": length },
        body: source,
      });
      if (put.statusCode === 412) {
        await readBody(put);
        return false;
      }
      if (put.statusCode !== 200 && put.statusCode !== 201) {
        throw await failFor(put, `Uploading ${name}`);
      }
      await readBody(put);
      return true;
    });
  }

  return { readStored, readBytes, upload };
}

function sameBytes(stored, expected) {
  return stored.sha256 === expected.sha256 && stored.size === expected.size;
}

function mismatch(objectName, stored, expected) {
  return new ImmutableMismatchError(
    `Immutable object ${objectName} already exists with different bytes (stored sha256=${stored.sha256} size=${stored.size}; expected sha256=${expected.sha256} size=${expected.size}). Refusing to overwrite.`,
  );
}

// Uploads one immutable object, or proves the existing one is byte-identical. Returns
// "uploaded" | "reused" and always leaves the stored bytes verified against `expected`.
async function ensureImmutableObject(client, { objectName, filePath, expected }) {
  const existing = await client.readStored(objectName);
  if (existing) {
    if (!sameBytes(existing, expected)) throw mismatch(objectName, existing, expected);
    return "reused";
  }
  const created = await client.upload(
    objectName,
    { path: filePath, size: expected.size },
    { ifGenerationMatch: 0, cacheControl: IMMUTABLE_CACHE_CONTROL },
  );
  // A lost race (412) and a fresh upload both end in the same check: the stored bytes.
  const stored = await client.readStored(objectName);
  if (!stored) throw new Error(`Object ${objectName} is missing after upload.`);
  if (!sameBytes(stored, expected)) throw mismatch(objectName, stored, expected);
  return created ? "uploaded" : "reused";
}

async function mergeCatalogLast(client, release, { urlOptions, attempts, sleep, log }) {
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    const current = await client.readBytes(CATALOG_OBJECT);
    let remote = null;
    let generation = 0;
    if (current) {
      remote = JSON.parse(current.bytes.toString("utf8"));
      assertValidCatalog(remote, urlOptions);
      generation = current.generation;
    }
    const merged = mergeRelease(remote, release);
    assertValidCatalog(merged, urlOptions);
    if (remote && stableStringify(remote) === stableStringify(merged)) {
      return { changed: false, generation };
    }
    const bytes = Buffer.from(serializeCatalog(merged), "utf8");
    const written = await client.upload(CATALOG_OBJECT, bytes, {
      ifGenerationMatch: generation,
      cacheControl: CATALOG_CACHE_CONTROL,
    });
    if (written) return { changed: true, generation };
    log(
      `Catalog changed during publish (generation ${generation}); reloading (attempt ${attempt}/${attempts}).`,
    );
    await sleep(100 * attempt);
  }
  throw new CatalogConflictError(
    `Could not update ${CATALOG_OBJECT} after ${attempts} compare-and-swap attempts because it kept changing. Nothing was lost: the immutable release objects are uploaded and the same publish can be rerun.`,
  );
}

export async function publishRelease({
  candidatePath,
  releaseRoot,
  bucket = DEFAULT_BUCKET,
  apiBase = DEFAULT_API_BASE,
  publicBase = DEFAULT_PUBLIC_BASE,
  token,
  catalogAttempts = DEFAULT_CATALOG_ATTEMPTS,
  sleep = delay,
  log = (message) => process.stderr.write(`${message}\n`),
}) {
  if (!token) throw new Error("A GCS access token is required (set GCS_ACCESS_TOKEN).");
  const urlOptions = { publicBase, bucket };
  const candidate = JSON.parse(readFileSync(candidatePath, "utf8"));
  assertValidCatalog(candidate, urlOptions);
  const tags = Object.keys(candidate.releases);
  if (tags.length !== 1) throw new Error("A publish candidate must contain exactly one release.");
  const release = candidate.releases[tags[0]];

  // Local files must still match the candidate before anything leaves the machine.
  const objects = releaseObjects(release, urlOptions)
    .map((object) =>
      Object.assign(object, { filePath: path.join(releaseRoot, ...object.objectName.split("/")) }),
    )
    .sort(
      (a, b) =>
        Number(a.kind === "feed") - Number(b.kind === "feed") ||
        (a.objectName < b.objectName ? -1 : 1),
    );
  for (const object of objects) {
    const local = hashFileSync(object.filePath);
    if (!sameBytes(local, object)) {
      throw new Error(`Local file ${object.filePath} does not match the candidate (sha256/size).`);
    }
  }

  const client = createGcsClient({ apiBase, bucket, token, sleep });
  const uploaded = [];
  const reused = [];
  for (const object of objects) {
    const outcome = await ensureImmutableObject(client, {
      objectName: object.objectName,
      filePath: object.filePath,
      expected: { sha256: object.sha256, size: object.size },
    });
    (outcome === "uploaded" ? uploaded : reused).push(object.objectName);
    log(`${outcome} ${object.objectName}`);
  }

  // Every object of the release is now confirmed stored; only then does the catalog change.
  const result = await mergeCatalogLast(client, release, {
    urlOptions,
    attempts: catalogAttempts,
    sleep,
    log,
  });
  log(
    result.changed
      ? `Catalog updated for ${release.tag}.`
      : `Catalog already lists ${release.tag}.`,
  );
  return { tag: release.tag, uploaded, reused, catalogChanged: result.changed };
}

export function resolveAccessToken(env = process.env, exec = nodeExecFileSync) {
  if (env.GCS_ACCESS_TOKEN) return env.GCS_ACCESS_TOKEN;
  try {
    return exec("gcloud", ["auth", "print-access-token"], { encoding: "utf8" }).trim();
  } catch {
    throw new Error(
      "No GCS access token. Set GCS_ACCESS_TOKEN from google-github-actions/auth (token_format: access_token).",
    );
  }
}

async function main(argv) {
  const { values } = parseArgs({
    args: argv,
    options: {
      candidate: { type: "string" },
      "release-root": { type: "string" },
      bucket: { type: "string", default: process.env.ZEKODER_RELEASE_BUCKET ?? DEFAULT_BUCKET },
      "api-base": { type: "string", default: DEFAULT_API_BASE },
      "public-base": { type: "string", default: DEFAULT_PUBLIC_BASE },
    },
    strict: true,
  });
  if (!values.candidate || !values["release-root"]) {
    throw new Error(
      "Usage: node scripts/desktop-release/publish-release.mjs --candidate <catalog-candidate.json> --release-root <prepare output dir> [--bucket b]",
    );
  }
  const result = await publishRelease({
    candidatePath: path.resolve(values.candidate),
    releaseRoot: path.resolve(values["release-root"]),
    bucket: values.bucket,
    apiBase: values["api-base"],
    publicBase: values["public-base"],
    token: resolveAccessToken(),
  });
  process.stdout.write(`${JSON.stringify(result)}\n`);
}

if (isMainModule(import.meta.url)) {
  main(process.argv.slice(2)).catch((error) => {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 1;
  });
}
