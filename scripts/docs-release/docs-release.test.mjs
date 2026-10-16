import assert from "node:assert/strict";
import http from "node:http";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test, { after, before } from "node:test";
import { startFakeGcs } from "../desktop-release/test-fixtures.mjs";
import { publishDocs, writeNotes } from "./docs-release.mjs";
import { createDocsServer } from "./serve.mjs";

const BUCKET = "zekoder-docs";
const temps = [];
const tempDir = () => {
  const dir = mkdtempSync(path.join(tmpdir(), "zekoder-docs-release-"));
  temps.push(dir);
  return dir;
};
after(() => {
  for (const dir of temps) rmSync(dir, { recursive: true, force: true });
});

function writeTree(root, files) {
  for (const [relative, body] of Object.entries(files)) {
    const file = path.join(root, ...relative.split("/"));
    mkdirSync(path.dirname(file), { recursive: true });
    writeFileSync(file, body);
  }
}

const site = (marker) => ({
  "index.html": `<h1>${marker} home</h1>`,
  "404.html": `<h1>${marker} 404</h1>`,
  "fr/index.html": `<h1>${marker} fr</h1>`,
  "_nuxt/app.abc.js": `console.log("${marker}")`,
});

// ---------------------------------------------------------------------------
// Publisher
// ---------------------------------------------------------------------------

test.describe("publishDocs", () => {
  let gcs;
  const sleep = async () => {};
  const log = () => {};
  const run = (tag, marker, extra = {}) => {
    const root = tempDir();
    writeTree(root, site(marker));
    return publishDocs({
      tag,
      root,
      bucket: BUCKET,
      publishedAt: "2026-10-20T10:00:00Z",
      token: gcs.token,
      apiBase: gcs.base,
      sleep,
      log,
      ...extra,
    });
  };
  const manifest = () => JSON.parse(gcs.objects.get("versions.json").bytes.toString("utf8"));
  const stored = (name) => gcs.objects.get(name)?.bytes.toString("utf8");

  before(async () => {
    gcs = await startFakeGcs({ bucket: BUCKET });
  });
  after(() => gcs.close());

  test("first publish writes files and the manifest", async () => {
    await run("v1.0.0", "one");
    assert.equal(stored("v1.0.0/index.html"), "<h1>one home</h1>");
    assert.equal(stored("v1.0.0/fr/index.html"), "<h1>one fr</h1>");
    assert.equal(stored("v1.0.0/_nuxt/app.abc.js"), 'console.log("one")');
    assert.deepEqual(manifest(), {
      schemaVersion: 1,
      latest: "1.0.0",
      versions: [
        { version: "1.0.0", tag: "v1.0.0", path: "/v1.0.0/", publishedAt: "2026-10-20T10:00:00Z" },
      ],
    });
  });

  test("a second version merges and moves latest", async () => {
    await run("v1.1.0", "two");
    assert.equal(manifest().latest, "1.1.0");
    assert.deepEqual(
      manifest().versions.map((entry) => entry.tag),
      ["v1.1.0", "v1.0.0"],
    );
  });

  test("an older patch tag published later does not move latest", async () => {
    await run("v1.0.1", "patch");
    assert.equal(manifest().latest, "1.1.0");
    assert.deepEqual(
      manifest().versions.map((entry) => entry.tag),
      ["v1.1.0", "v1.0.1", "v1.0.0"],
    );
  });

  test("a listed version is a no-op", async () => {
    const logged = gcs.log.length;
    const result = await run("v1.1.0", "changed");
    assert.equal(result.uploaded, 0);
    assert.equal(gcs.log.length, logged);
    assert.equal(stored("v1.1.0/index.html"), "<h1>two home</h1>");
  });

  test("a rerun after a partial upload overwrites leftovers and lists the version", async () => {
    gcs.put("v2.0.0/index.html", Buffer.from("partial"));
    gcs.put("v2.0.0/404.html", Buffer.from("partial"));
    await run("v2.0.0", "three");
    assert.equal(stored("v2.0.0/index.html"), "<h1>three home</h1>");
    assert.equal(stored("v2.0.0/404.html"), "<h1>three 404</h1>");
    assert.equal(manifest().latest, "2.0.0");
  });

  test("one 412 on the manifest reloads, merges and retries", async () => {
    let raced = false;
    gcs.hooks.beforeFinalize = (name) => {
      if (name !== "versions.json" || raced) return;
      raced = true;
      const racing = manifest();
      racing.versions.unshift({
        version: "2.1.0",
        tag: "v2.1.0",
        path: "/v2.1.0/",
        publishedAt: "2026-10-21T10:00:00Z",
      });
      racing.latest = "2.1.0";
      gcs.put("versions.json", Buffer.from(JSON.stringify(racing)));
    };
    try {
      await run("v2.0.1", "racer");
    } finally {
      gcs.hooks.beforeFinalize = null;
    }
    assert.equal(raced, true);
    assert.equal(manifest().latest, "2.1.0");
    assert.deepEqual(
      manifest().versions.map((entry) => entry.tag),
      ["v2.1.0", "v2.0.1", "v2.0.0", "v1.1.0", "v1.0.1", "v1.0.0"],
    );
  });

  test("a beta tag is rejected before anything is uploaded", async () => {
    const logged = gcs.log.length;
    await assert.rejects(run("v3.0.0-beta.1", "beta"), /stable tags only/);
    assert.equal(gcs.log.length, logged);
  });
});

test("write-notes keeps the frontmatter and replaces the body", () => {
  const dir = tempDir();
  const page = path.join(dir, "whats-changed.md");
  const notes = path.join(dir, "release-notes.md");
  writeFileSync(
    page,
    "---\ntitle: What changed\nnavigation:\n  order: 99\n---\n\nPlaceholder body.\n",
  );
  writeFileSync(notes, "## New\n\n- Faster startup.\n");
  writeNotes({ notesPath: notes, outPath: page });
  assert.equal(
    readFileSync(page, "utf8"),
    "---\ntitle: What changed\nnavigation:\n  order: 99\n---\n\n## New\n\n- Faster startup.\n",
  );
  writeFileSync(notes, "  \n");
  assert.throws(() => writeNotes({ notesPath: notes, outPath: page }), /empty/);
});

// ---------------------------------------------------------------------------
// Server
// ---------------------------------------------------------------------------

test.describe("docs server", () => {
  let server;
  let base;
  let port;
  const get = (pathname, init = {}) => fetch(`${base}${pathname}`, { redirect: "manual", ...init });
  const rawGet = (rawPath) =>
    new Promise((resolve, reject) => {
      http
        .get({ host: "127.0.0.1", port, path: rawPath }, async (res) => {
          const chunks = [];
          for await (const chunk of res) chunks.push(chunk);
          resolve({ status: res.statusCode, text: Buffer.concat(chunks).toString("utf8") });
        })
        .on("error", reject);
    });

  before(async () => {
    const root = tempDir();
    writeTree(root, {
      "versions.json": JSON.stringify({
        schemaVersion: 1,
        latest: "1.1.0",
        versions: [
          {
            version: "1.1.0",
            tag: "v1.1.0",
            path: "/v1.1.0/",
            publishedAt: "2026-10-20T10:00:00Z",
          },
          {
            version: "1.0.0",
            tag: "v1.0.0",
            path: "/v1.0.0/",
            publishedAt: "2026-09-20T10:00:00Z",
          },
        ],
      }),
      "v1.0.0/index.html": "<h1>old home</h1>",
      "v1.0.0/404.html": "<h1>old 404</h1>",
      "v1.0.0/fr/getting-started/install/index.html": "<h1>old install fr</h1>",
      "v1.0.0/_nuxt/app.abc.js": "console.log(1)",
      "v1.1.0/index.html": "<h1>new home</h1>",
      "v1.1.0/404.html": "<h1>new 404</h1>",
      "v1.1.0/fr/index.html": "<h1>new fr</h1>",
    });
    server = createDocsServer({ root });
    await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
    port = server.address().port;
    base = `http://127.0.0.1:${port}`;
  });
  after(() => new Promise((resolve) => server.close(resolve)));

  test("a clean URL resolves to the directory index", async () => {
    const res = await get("/v1.0.0/fr/getting-started/install/");
    assert.equal(res.status, 200);
    assert.match(res.headers.get("content-type"), /text\/html/);
    assert.equal(res.headers.get("cache-control"), "public, max-age=300");
    assert.equal(await res.text(), "<h1>old install fr</h1>");
  });

  test("/ and /latest/ redirect to the latest version", async () => {
    const root = await get("/");
    assert.equal(root.status, 302);
    assert.equal(root.headers.get("location"), "/v1.1.0/");
    const deep = await get("/latest/fr/");
    assert.equal(deep.status, 302);
    assert.equal(deep.headers.get("location"), "/v1.1.0/fr/");
  });

  test("a miss under a version serves that version's 404 page", async () => {
    const res = await get("/v1.0.0/missing/");
    assert.equal(res.status, 404);
    assert.equal(await res.text(), "<h1>old 404</h1>");
  });

  test("any other miss serves the latest 404 page", async () => {
    const res = await get("/nope");
    assert.equal(res.status, 404);
    assert.equal(await res.text(), "<h1>new 404</h1>");
  });

  test("paths escaping the root are not found", async () => {
    const raw = await rawGet("/../etc/passwd");
    assert.equal(raw.status, 404);
    assert.doesNotMatch(raw.text, /root:/);
    const encoded = await get("/v1.0.0/..%2f..%2fversions.json");
    assert.equal(encoded.status, 404);
    assert.equal(await encoded.text(), "<h1>old 404</h1>");
  });

  test("_nuxt assets are immutable", async () => {
    const res = await get("/v1.0.0/_nuxt/app.abc.js");
    assert.equal(res.status, 200);
    assert.equal(res.headers.get("cache-control"), "public, max-age=31536000, immutable");
    assert.match(res.headers.get("content-type"), /javascript/);
  });

  test("versions.json is served with a 60 second cache", async () => {
    const res = await get("/versions.json");
    assert.equal(res.status, 200);
    assert.equal(res.headers.get("cache-control"), "public, max-age=60");
    assert.equal((await res.json()).latest, "1.1.0");
  });

  test("non GET or HEAD methods get 405", async () => {
    const res = await get("/v1.0.0/", { method: "POST" });
    assert.equal(res.status, 405);
  });

  test("with no versions, / is a plain 404", async () => {
    const empty = createDocsServer({ root: tempDir() });
    await new Promise((resolve) => empty.listen(0, "127.0.0.1", resolve));
    try {
      const res = await fetch(`http://127.0.0.1:${empty.address().port}/`, { redirect: "manual" });
      assert.equal(res.status, 404);
      assert.match(res.headers.get("content-type"), /text\/plain/);
    } finally {
      await new Promise((resolve) => empty.close(resolve));
    }
  });
});
