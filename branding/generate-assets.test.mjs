import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import {
  BRAND_MARK_OUTPUT,
  ICNS_PATH,
  ICNS_TYPES,
  ICO_PATH,
  ICO_SIZES,
  PNG_OUTPUTS,
  checkAll,
  decodePng,
  generateAll,
  loadMarks,
  parseIcns,
  parseIco,
} from "./generate-assets.mjs";

const marks = loadMarks();
const outDir = mkdtempSync(path.join(tmpdir(), "zekoder-brand-"));
generateAll(outDir, marks);
test.after(() => rmSync(outDir, { force: true, recursive: true }));

const read = (relativePath) => readFileSync(path.join(outDir, relativePath));
const decode = (relativePath) => decodePng(read(relativePath));

function pixel(image, x, y) {
  const at = (y * image.width + x) * 4;
  return [...image.data.subarray(at, at + 4)];
}

test("every PNG decodes to its table size and is square", () => {
  for (const spec of PNG_OUTPUTS) {
    const image = decode(spec.path);
    assert.equal(image.width, spec.size, spec.path);
    assert.equal(image.height, spec.size, spec.path);
  }
  const brandMark = decode(BRAND_MARK_OUTPUT.path);
  assert.equal(brandMark.width, 512);
  assert.equal(brandMark.height, 397);
});

test("source marks must be 8-bit RGBA", () => {
  assert.throws(() => decodePng(Buffer.from("not a png")), /Not a PNG/);
});

test("app icon is an opaque white square with the mark in the middle", () => {
  const icon = decode("packages/app/assets/images/icon.png");
  assert.deepEqual(pixel(icon, 0, 0), [255, 255, 255, 255]);
  assert.deepEqual(pixel(icon, 1023, 1023), [255, 255, 255, 255]);
  // Left bracket stem: brand blue #1461BD.
  assert.deepEqual(pixel(icon, 270, 400), [0x14, 0x61, 0xbd, 255]);
});

test("running favicon carries the status dot color at the dot center", () => {
  for (const name of ["favicon-light-running", "favicon-dark-running"]) {
    const image = decode(`packages/app/assets/images/${name}.png`);
    const center = Math.floor((570 / 700) * 48);
    assert.deepEqual(pixel(image, center, center), [0x3b, 0x82, 0xf6, 255], name);
  }
  const attention = decode("packages/app/assets/images/favicon-dark-attention.png");
  assert.deepEqual(pixel(attention, 39, 39), [0x22, 0xc5, 0x5e, 255]);
});

test("desktop icon is a rounded tile: transparent corner, white top edge", () => {
  const icon = decode("packages/desktop/assets/icon.png");
  assert.equal(pixel(icon, 0, 0)[3], 0);
  assert.deepEqual(
    pixel(icon, Math.floor(icon.width * 0.5), Math.floor(icon.height * 0.12)),
    [255, 255, 255, 255],
  );
});

test("ICO lists the table sizes with PNG payloads", () => {
  const buffer = read(ICO_PATH);
  assert.equal(buffer.readUInt16LE(2), 1);
  assert.equal(buffer.readUInt16LE(4), 7);
  const entries = parseIco(buffer);
  assert.deepEqual(
    entries.map((entry) => entry.size),
    ICO_SIZES,
  );
  for (const entry of entries) {
    const image = decodePng(entry.png);
    assert.equal(image.width, entry.size);
    assert.equal(image.height, entry.size);
  }
});

test("ICNS declares its length and holds all 11 types", () => {
  const buffer = read(ICNS_PATH);
  assert.equal(buffer.toString("latin1", 0, 4), "icns");
  assert.equal(buffer.readUInt32BE(4), buffer.length);
  const entries = parseIcns(buffer);
  assert.deepEqual(
    entries.map((entry) => entry.type),
    ICNS_TYPES.map(([type]) => type),
  );
  ICNS_TYPES.forEach(([, size], index) => {
    assert.equal(decodePng(entries[index].png).width, size);
  });
});

test("check passes against a freshly generated tree and flags a missing file", () => {
  assert.deepEqual(checkAll(outDir, marks), []);
  const empty = mkdtempSync(path.join(tmpdir(), "zekoder-brand-empty-"));
  try {
    assert.ok(checkAll(empty, marks).length > 0);
  } finally {
    rmSync(empty, { force: true, recursive: true });
  }
});
