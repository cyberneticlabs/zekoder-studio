// Zero-dependency server for the versioned docs site. The bucket is mounted read-only at
// DOCS_ROOT (default /srv/docs): versions.json plus one vX.Y.Z/ tree per stable release.
import { createReadStream } from "node:fs";
import { readFile, stat } from "node:fs/promises";
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";

const MANIFEST_TTL_MS = 60_000;
const VERSION_PATTERN = /^v(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)$/;

const CONTENT_TYPES = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".ico": "image/x-icon",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".txt": "text/plain; charset=utf-8",
  ".xml": "application/xml; charset=utf-8",
};

function cacheControlFor(relative, ext) {
  if (relative.startsWith("_nuxt/")) return "public, max-age=31536000, immutable";
  return ext === ".html" ? "public, max-age=300" : "public, max-age=3600";
}

async function isFile(file) {
  try {
    return (await stat(file)).isFile();
  } catch {
    return false;
  }
}

function insideDirectory(dir, target) {
  return target === dir || target.startsWith(dir + path.sep);
}

export function createDocsServer({ root, manifestTtlMs = MANIFEST_TTL_MS, now = Date.now }) {
  const docsRoot = path.resolve(root);
  let cached = { at: -Infinity, bytes: null, manifest: null };

  async function loadManifest() {
    if (now() - cached.at < manifestTtlMs) return cached;
    let next = { at: now(), bytes: null, manifest: null };
    try {
      const bytes = await readFile(path.join(docsRoot, "versions.json"));
      const manifest = JSON.parse(bytes.toString("utf8"));
      next = { at: now(), bytes, manifest };
    } catch {
      // Missing or unreadable: behave as "no versions yet" until the next refresh.
    }
    cached = next;
    return cached;
  }

  function latestEntry(manifest) {
    return manifest?.versions?.find((entry) => entry.version === manifest.latest) ?? null;
  }

  function send(req, res, status, headers, body) {
    res.writeHead(status, { "Content-Length": Buffer.byteLength(body), ...headers });
    res.end(req.method === "HEAD" ? undefined : body);
  }

  async function sendFile(req, res, status, file, relative) {
    const ext = path.extname(file).toLowerCase();
    const info = await stat(file);
    res.writeHead(status, {
      "Content-Type": CONTENT_TYPES[ext] ?? "application/octet-stream",
      "Content-Length": info.size,
      "Cache-Control": status === 200 ? cacheControlFor(relative, ext) : "public, max-age=60",
    });
    if (req.method === "HEAD") return void res.end();
    const stream = createReadStream(file);
    stream.on("error", () => res.destroy());
    stream.pipe(res);
  }

  async function sendNotFound(req, res, versionDir) {
    if (versionDir) {
      const page = path.join(versionDir, "404.html");
      if (await isFile(page)) return sendFile(req, res, 404, page, "404.html");
    }
    return send(req, res, 404, { "Content-Type": "text/plain; charset=utf-8" }, "Not found\n");
  }

  async function handle(req, res) {
    if (req.method !== "GET" && req.method !== "HEAD") {
      return send(req, res, 405, { Allow: "GET, HEAD" }, "Method not allowed\n");
    }
    const url = new URL(req.url ?? "/", "http://localhost");
    const { pathname, search } = url;
    const { bytes, manifest } = await loadManifest();
    const latest = latestEntry(manifest);
    const latestDir = latest ? path.join(docsRoot, latest.tag) : null;

    if (pathname === "/versions.json") {
      if (!bytes) return sendNotFound(req, res, latestDir);
      return send(
        req,
        res,
        200,
        { "Content-Type": CONTENT_TYPES[".json"], "Cache-Control": "public, max-age=60" },
        bytes,
      );
    }

    if (pathname === "/" || pathname === "/latest" || pathname.startsWith("/latest/")) {
      if (!latest) return sendNotFound(req, res, null);
      const rest = pathname === "/" ? "" : pathname.slice("/latest/".length);
      res.writeHead(302, {
        Location: `${latest.path}${rest}${search}`,
        "Cache-Control": "no-cache",
      });
      return void res.end();
    }

    const [, first = "", ...segments] = pathname.split("/");
    if (!VERSION_PATTERN.test(first)) return sendNotFound(req, res, latestDir);
    const versionDir = path.join(docsRoot, first);
    if (segments.length === 0) {
      res.writeHead(302, { Location: `/${first}/${search}`, "Cache-Control": "no-cache" });
      return void res.end();
    }

    let relative;
    try {
      relative = decodeURIComponent(segments.join("/"));
    } catch {
      return sendNotFound(req, res, versionDir);
    }
    if (relative.includes("\0")) return sendNotFound(req, res, versionDir);
    const target = path.resolve(versionDir, relative);
    if (!insideDirectory(versionDir, target)) return sendNotFound(req, res, versionDir);

    for (const candidate of [target, path.join(target, "index.html")]) {
      if (await isFile(candidate)) {
        return sendFile(req, res, 200, candidate, path.relative(versionDir, candidate));
      }
    }
    return sendNotFound(req, res, versionDir);
  }

  return http.createServer((req, res) => {
    handle(req, res).catch(() => {
      if (!res.headersSent) res.writeHead(500, { "Content-Type": "text/plain; charset=utf-8" });
      res.end("Internal error\n");
    });
  });
}

// Inlined (not ../is-main-module.mjs): the container image ships this file alone.
if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  const port = Number(process.env.PORT ?? 8080);
  createDocsServer({ root: process.env.DOCS_ROOT ?? "/srv/docs" }).listen(port, () => {
    process.stdout.write(`docs server listening on ${port}\n`);
  });
}
