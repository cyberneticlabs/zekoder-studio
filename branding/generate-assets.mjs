#!/usr/bin/env node
// Regenerates every Zekoder brand raster (app icons, favicons, desktop icon set, ICO, ICNS)
// from the three source marks in branding/source. Node built-ins only.
//
//   node branding/generate-assets.mjs                 write all files into the repo
//   node branding/generate-assets.mjs --out <dir>     write the same tree under <dir>
//   node branding/generate-assets.mjs --check         compare decoded pixels with committed files

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import zlib from "node:zlib";
import { isMainModule } from "../scripts/is-main-module.mjs";

const BRANDING_DIR = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(BRANDING_DIR, "..");
const SOURCE_DIR = path.join(BRANDING_DIR, "source");

const IMAGES = "packages/app/assets/images";
const PUBLIC = "packages/app/public";
const DESKTOP = "packages/desktop/assets";
const FDROID = "fastlane/metadata/android/en-US/images";

const BRAND_BLUE = [0x14, 0x61, 0xbd];
const DOT_COLORS = { running: [0x3b, 0x82, 0xf6], attention: [0x22, 0xc5, 0x5e] };
// Status dot geometry from the previous favicon SVGs: center (570,570), r=130 on a 700 canvas.
const DOT = { cx: 570 / 700, cy: 570 / 700, r: 130 / 700 };

/** Square PNG outputs. `kind` selects the composition, see `renderPng`. */
export const PNG_OUTPUTS = [
  { path: `${IMAGES}/icon.png`, size: 1024, kind: "app" },
  { path: `${IMAGES}/android-icon-foreground.png`, size: 1024, kind: "fg" },
  { path: `${IMAGES}/splash-icon.png`, size: 200, kind: "mark", color: "blue" },
  { path: `${IMAGES}/splash-icon-dark.png`, size: 200, kind: "mark", color: "white" },
  { path: `${IMAGES}/notification-icon.png`, size: 96, kind: "mark", color: "white" },
  { path: `${IMAGES}/favicon.png`, size: 48, kind: "mark", color: "blue" },
  { path: `${IMAGES}/favicon-light.png`, size: 48, kind: "mark", color: "blue" },
  {
    path: `${IMAGES}/favicon-light-running.png`,
    size: 48,
    kind: "mark",
    color: "blue",
    dot: "running",
  },
  {
    path: `${IMAGES}/favicon-light-attention.png`,
    size: 48,
    kind: "mark",
    color: "blue",
    dot: "attention",
  },
  { path: `${IMAGES}/favicon-dark.png`, size: 48, kind: "mark", color: "white" },
  {
    path: `${IMAGES}/favicon-dark-running.png`,
    size: 48,
    kind: "mark",
    color: "white",
    dot: "running",
  },
  {
    path: `${IMAGES}/favicon-dark-attention.png`,
    size: 48,
    kind: "mark",
    color: "white",
    dot: "attention",
  },
  { path: `${PUBLIC}/apple-touch-icon.png`, size: 180, kind: "app" },
  { path: `${PUBLIC}/pwa-icon-192.png`, size: 192, kind: "app" },
  { path: `${PUBLIC}/pwa-icon-512.png`, size: 512, kind: "app" },
  { path: `${FDROID}/icon.png`, size: 512, kind: "app" },
  { path: `${DESKTOP}/icon.png`, size: 512, kind: "tile" },
  { path: `${DESKTOP}/icon-dev.png`, size: 1254, kind: "tile" },
  { path: `${DESKTOP}/32x32.png`, size: 32, kind: "tile" },
  { path: `${DESKTOP}/64x64.png`, size: 64, kind: "tile" },
  { path: `${DESKTOP}/128x128.png`, size: 128, kind: "tile" },
  { path: `${DESKTOP}/128x128@2x.png`, size: 256, kind: "tile" },
];

/** The one non-square output: the white mark with its aspect ratio kept, used for tinting. */
export const BRAND_MARK_OUTPUT = { path: `${IMAGES}/brand-mark.png`, width: 512, height: 397 };

export const ICO_PATH = `${DESKTOP}/icon.ico`;
export const ICO_SIZES = [16, 24, 32, 48, 64, 128, 256];

export const ICNS_PATH = `${DESKTOP}/icon.icns`;
export const ICNS_TYPES = [
  ["icp4", 16],
  ["icp5", 32],
  ["icp6", 64],
  ["ic07", 128],
  ["ic08", 256],
  ["ic09", 512],
  ["ic10", 1024],
  ["ic11", 32],
  ["ic12", 64],
  ["ic13", 256],
  ["ic14", 512],
];

// ---------------------------------------------------------------------------------------------
// PNG codec (8-bit RGBA, non-interlaced only)
// ---------------------------------------------------------------------------------------------

const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(buffer) {
  let c = 0xffffffff;
  for (let i = 0; i < buffer.length; i++) c = CRC_TABLE[(c ^ buffer[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function paeth(a, b, c) {
  const p = a + b - c;
  const pa = Math.abs(p - a);
  const pb = Math.abs(p - b);
  const pc = Math.abs(p - c);
  if (pa <= pb && pa <= pc) return a;
  return pb <= pc ? b : c;
}

function predict(filter, left, up, upLeft) {
  switch (filter) {
    case 0:
      return 0;
    case 1:
      return left;
    case 2:
      return up;
    case 3:
      return (left + up) >> 1;
    case 4:
      return paeth(left, up, upLeft);
    default:
      throw new Error(`Unknown PNG filter ${filter}`);
  }
}

function unfilter(raw, width, height) {
  const stride = width * 4;
  if (raw.length !== (stride + 1) * height) throw new Error("PNG pixel data has unexpected length");
  const data = Buffer.alloc(stride * height);
  for (let y = 0; y < height; y++) {
    const filter = raw[y * (stride + 1)];
    const src = y * (stride + 1) + 1;
    const dst = y * stride;
    for (let x = 0; x < stride; x++) {
      const left = x >= 4 ? data[dst + x - 4] : 0;
      const up = y > 0 ? data[dst - stride + x] : 0;
      const upLeft = y > 0 && x >= 4 ? data[dst - stride + x - 4] : 0;
      data[dst + x] = (raw[src + x] + predict(filter, left, up, upLeft)) & 0xff;
    }
  }
  return data;
}

function parseHeader(body) {
  const [bitDepth, colorType, interlace] = [body[8], body[9], body[12]];
  if (bitDepth !== 8 || colorType !== 6 || interlace !== 0) {
    throw new Error(
      `Unsupported PNG (bitDepth=${bitDepth} colorType=${colorType} interlace=${interlace}); need 8-bit RGBA non-interlaced`,
    );
  }
  return { width: body.readUInt32BE(0), height: body.readUInt32BE(4) };
}

/** Decode a PNG buffer to `{ width, height, data }` (RGBA, 4 bytes per pixel). */
export function decodePng(buffer) {
  if (buffer.length < 8 || !buffer.subarray(0, 8).equals(PNG_SIGNATURE)) {
    throw new Error("Not a PNG file");
  }
  let header = null;
  const idat = [];
  let offset = 8;
  while (offset + 8 <= buffer.length) {
    const length = buffer.readUInt32BE(offset);
    const type = buffer.toString("latin1", offset + 4, offset + 8);
    const body = buffer.subarray(offset + 8, offset + 8 + length);
    if (type === "IHDR") header = parseHeader(body);
    else if (type === "IDAT") idat.push(body);
    else if (type === "IEND") break;
    offset += 12 + length;
  }
  if (!header) throw new Error("PNG has no IHDR");
  const data = unfilter(zlib.inflateSync(Buffer.concat(idat)), header.width, header.height);
  return { width: header.width, height: header.height, data };
}

function pngChunk(type, body) {
  const out = Buffer.alloc(12 + body.length);
  out.writeUInt32BE(body.length, 0);
  out.write(type, 4, "latin1");
  body.copy(out, 8);
  out.writeUInt32BE(crc32(out.subarray(4, 8 + body.length)), 8 + body.length);
  return out;
}

/** Encode `{ width, height, data }` (RGBA) as an 8-bit RGBA PNG, picking a filter per row. */
export function encodePng({ width, height, data }) {
  const stride = width * 4;
  const raw = Buffer.alloc((stride + 1) * height);
  const candidates = [0, 1, 2, 3, 4].map(() => Buffer.alloc(stride));
  for (let y = 0; y < height; y++) {
    const row = y * stride;
    for (let x = 0; x < stride; x++) {
      const value = data[row + x];
      const left = x >= 4 ? data[row + x - 4] : 0;
      const up = y > 0 ? data[row - stride + x] : 0;
      const upLeft = y > 0 && x >= 4 ? data[row - stride + x - 4] : 0;
      candidates[0][x] = value;
      candidates[1][x] = (value - left) & 0xff;
      candidates[2][x] = (value - up) & 0xff;
      candidates[3][x] = (value - ((left + up) >> 1)) & 0xff;
      candidates[4][x] = (value - paeth(left, up, upLeft)) & 0xff;
    }
    let best = 0;
    let bestScore = Infinity;
    for (let f = 0; f < 5; f++) {
      let score = 0;
      for (let x = 0; x < stride; x++) {
        const v = candidates[f][x];
        score += v < 128 ? v : 256 - v;
      }
      if (score < bestScore) {
        bestScore = score;
        best = f;
      }
    }
    raw[y * (stride + 1)] = best;
    candidates[best].copy(raw, y * (stride + 1) + 1);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  return Buffer.concat([
    PNG_SIGNATURE,
    pngChunk("IHDR", ihdr),
    pngChunk("IDAT", zlib.deflateSync(raw, { level: 9 })),
    pngChunk("IEND", Buffer.alloc(0)),
  ]);
}

// ---------------------------------------------------------------------------------------------
// Raster helpers
// ---------------------------------------------------------------------------------------------

export function createImage(width, height) {
  return { width, height, data: Buffer.alloc(width * height * 4) };
}

function areaAverageAxis(
  src,
  srcLen,
  dstLen,
  lines,
  lineStride,
  stepStride,
  dstLineStride,
  dstStepStride,
) {
  const dst = new Float64Array(lines * dstLen * 4);
  const scale = srcLen / dstLen;
  for (let i = 0; i < dstLen; i++) {
    const start = i * scale;
    const end = (i + 1) * scale;
    const first = Math.floor(start);
    const last = Math.min(srcLen, Math.ceil(end));
    for (let j = first; j < last; j++) {
      const weight = (Math.min(j + 1, end) - Math.max(j, start)) / scale;
      for (let line = 0; line < lines; line++) {
        const s = line * lineStride + j * stepStride;
        const d = line * dstLineStride + i * dstStepStride;
        for (let c = 0; c < 4; c++) dst[d + c] += src[s + c] * weight;
      }
    }
  }
  return dst;
}

/** Area-average resize on premultiplied alpha, so transparent pixels never bleed color. */
export function resize(image, dstWidth, dstHeight) {
  const { width, height, data } = image;
  const premul = new Float64Array(width * height * 4);
  for (let i = 0; i < width * height; i++) {
    const a = data[i * 4 + 3] / 255;
    premul[i * 4] = data[i * 4] * a;
    premul[i * 4 + 1] = data[i * 4 + 1] * a;
    premul[i * 4 + 2] = data[i * 4 + 2] * a;
    premul[i * 4 + 3] = data[i * 4 + 3];
  }
  const horizontal = areaAverageAxis(
    premul,
    width,
    dstWidth,
    height,
    width * 4,
    4,
    dstWidth * 4,
    4,
  );
  const vertical = areaAverageAxis(
    horizontal,
    height,
    dstHeight,
    dstWidth,
    4,
    dstWidth * 4,
    dstHeight * 4,
    4,
  );
  const out = createImage(dstWidth, dstHeight);
  for (let x = 0; x < dstWidth; x++) {
    for (let y = 0; y < dstHeight; y++) {
      const s = x * dstHeight * 4 + y * 4;
      const d = (y * dstWidth + x) * 4;
      const alpha = vertical[s + 3];
      if (alpha > 0) {
        const a = alpha / 255;
        out.data[d] = clampByte(vertical[s] / a);
        out.data[d + 1] = clampByte(vertical[s + 1] / a);
        out.data[d + 2] = clampByte(vertical[s + 2] / a);
      }
      out.data[d + 3] = clampByte(alpha);
    }
  }
  return out;
}

function clampByte(value) {
  return Math.max(0, Math.min(255, Math.round(value)));
}

/** Straight-alpha "over" of one RGBA pixel onto the destination pixel at `index`. */
function blendPixel(dst, index, r, g, b, a) {
  const sa = a / 255;
  if (sa <= 0) return;
  const da = dst[index + 3] / 255;
  const outA = sa + da * (1 - sa);
  for (const [offset, value] of [
    [0, r],
    [1, g],
    [2, b],
  ]) {
    dst[index + offset] = clampByte((value * sa + dst[index + offset] * da * (1 - sa)) / outA);
  }
  dst[index + 3] = clampByte(outA * 255);
}

export function compositeOver(dst, src, offsetX, offsetY) {
  for (let y = 0; y < src.height; y++) {
    const dy = y + offsetY;
    if (dy < 0 || dy >= dst.height) continue;
    for (let x = 0; x < src.width; x++) {
      const dx = x + offsetX;
      if (dx < 0 || dx >= dst.width) continue;
      const s = (y * src.width + x) * 4;
      blendPixel(
        dst.data,
        (dy * dst.width + dx) * 4,
        src.data[s],
        src.data[s + 1],
        src.data[s + 2],
        src.data[s + 3],
      );
    }
  }
}

export function fillOpaque(image, [r, g, b]) {
  for (let i = 0; i < image.width * image.height; i++) {
    image.data[i * 4] = r;
    image.data[i * 4 + 1] = g;
    image.data[i * 4 + 2] = b;
    image.data[i * 4 + 3] = 255;
  }
}

/** Paint `rgb` through a signed-distance function, anti-aliased by one pixel of coverage. */
function fillShape(image, signedDistance, [r, g, b]) {
  for (let y = 0; y < image.height; y++) {
    for (let x = 0; x < image.width; x++) {
      const coverage = Math.max(0, Math.min(1, 0.5 - signedDistance(x + 0.5, y + 0.5)));
      if (coverage > 0) blendPixel(image.data, (y * image.width + x) * 4, r, g, b, coverage * 255);
    }
  }
}

export function fillCircle(image, cx, cy, radius, rgb) {
  fillShape(image, (px, py) => Math.hypot(px - cx, py - cy) - radius, rgb);
}

export function fillRoundedRect(image, left, top, size, radius, rgb) {
  const half = size / 2;
  const cx = left + half;
  const cy = top + half;
  fillShape(
    image,
    (px, py) => {
      const qx = Math.abs(px - cx) - (half - radius);
      const qy = Math.abs(py - cy) - (half - radius);
      return Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) + Math.min(Math.max(qx, qy), 0) - radius;
    },
    rgb,
  );
}

/** Scale the mark to `markWidth` pixels wide (aspect kept) and center it on the canvas. */
function placeMark(canvas, mark, markWidth) {
  const markHeight = Math.round((markWidth * mark.height) / mark.width);
  const scaled = resize(mark, markWidth, markHeight);
  compositeOver(
    canvas,
    scaled,
    Math.round((canvas.width - markWidth) / 2),
    Math.round((canvas.height - markHeight) / 2),
  );
}

// ---------------------------------------------------------------------------------------------
// Compositions
// ---------------------------------------------------------------------------------------------

/**
 * kind: app = white mark (62% wide) on opaque brand blue; tile = macOS Big Sur rounded brand-blue
 * square (824/1024 of the canvas, radius 22.5%) with the white mark at 62% of the tile; fg = white
 * mark (55%) on transparent for Android adaptive icons, whose background color is set in
 * app.config.js; mark = mark fitted to 92% width, transparent.
 */
export function renderPng({ size, kind, color, dot }, marks) {
  const canvas = createImage(size, size);
  switch (kind) {
    case "app":
      fillOpaque(canvas, BRAND_BLUE);
      placeMark(canvas, marks.white, Math.round(size * 0.62));
      break;
    case "tile": {
      const tile = (size * 824) / 1024;
      fillRoundedRect(canvas, (size - tile) / 2, (size - tile) / 2, tile, tile * 0.225, BRAND_BLUE);
      placeMark(canvas, marks.white, Math.round(tile * 0.62));
      break;
    }
    case "fg":
      placeMark(canvas, marks.white, Math.round(size * 0.55));
      break;
    case "mark":
      placeMark(canvas, marks[color], Math.round(size * 0.92));
      break;
    default:
      throw new Error(`Unknown composition ${kind}`);
  }
  if (dot) fillCircle(canvas, DOT.cx * size, DOT.cy * size, DOT.r * size, DOT_COLORS[dot]);
  return canvas;
}

export function renderBrandMark(marks) {
  return resize(marks.white, BRAND_MARK_OUTPUT.width, BRAND_MARK_OUTPUT.height);
}

// ---------------------------------------------------------------------------------------------
// ICO / ICNS containers (PNG-embedded entries)
// ---------------------------------------------------------------------------------------------

export function buildIco(entries) {
  const headerSize = 6 + entries.length * 16;
  const header = Buffer.alloc(headerSize);
  header.writeUInt16LE(0, 0);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(entries.length, 4);
  let offset = headerSize;
  entries.forEach(({ size, png }, index) => {
    const at = 6 + index * 16;
    header[at] = size >= 256 ? 0 : size;
    header[at + 1] = size >= 256 ? 0 : size;
    header.writeUInt16LE(1, at + 4);
    header.writeUInt16LE(32, at + 6);
    header.writeUInt32LE(png.length, at + 8);
    header.writeUInt32LE(offset, at + 12);
    offset += png.length;
  });
  return Buffer.concat([header, ...entries.map((entry) => entry.png)]);
}

export function parseIco(buffer) {
  const count = buffer.readUInt16LE(4);
  const entries = [];
  for (let i = 0; i < count; i++) {
    const at = 6 + i * 16;
    const size = buffer[at] === 0 ? 256 : buffer[at];
    const length = buffer.readUInt32LE(at + 8);
    const offset = buffer.readUInt32LE(at + 12);
    entries.push({ size, png: buffer.subarray(offset, offset + length) });
  }
  return entries;
}

export function buildIcns(entries) {
  const parts = entries.map(({ type, png }) => {
    const head = Buffer.alloc(8);
    head.write(type, 0, "latin1");
    head.writeUInt32BE(8 + png.length, 4);
    return Buffer.concat([head, png]);
  });
  const total = 8 + parts.reduce((sum, part) => sum + part.length, 0);
  const head = Buffer.alloc(8);
  head.write("icns", 0, "latin1");
  head.writeUInt32BE(total, 4);
  return Buffer.concat([head, ...parts]);
}

export function parseIcns(buffer) {
  if (buffer.toString("latin1", 0, 4) !== "icns") throw new Error("Not an ICNS file");
  if (buffer.readUInt32BE(4) !== buffer.length) throw new Error("ICNS length header mismatch");
  const entries = [];
  let offset = 8;
  while (offset < buffer.length) {
    const type = buffer.toString("latin1", offset, offset + 4);
    const length = buffer.readUInt32BE(offset + 4);
    entries.push({ type, png: buffer.subarray(offset + 8, offset + length) });
    offset += length;
  }
  return entries;
}

// ---------------------------------------------------------------------------------------------
// Driver
// ---------------------------------------------------------------------------------------------

export function loadMarks(sourceDir = SOURCE_DIR) {
  const read = (name) => decodePng(readFileSync(path.join(sourceDir, `logo-${name}.png`)));
  return { blue: read("blue"), dark: read("dark"), white: read("white") };
}

/** Build every output file in memory: `Map<repo-relative path, Buffer>`. */
export function buildOutputs(marks = loadMarks()) {
  const outputs = new Map();
  const tileCache = new Map();
  const tilePng = (size) => {
    if (!tileCache.has(size)) {
      tileCache.set(size, encodePng(renderPng({ size, kind: "tile" }, marks)));
    }
    return tileCache.get(size);
  };

  for (const spec of PNG_OUTPUTS) {
    const png =
      spec.kind === "tile" && !spec.dot ? tilePng(spec.size) : encodePng(renderPng(spec, marks));
    outputs.set(spec.path, png);
  }
  outputs.set(BRAND_MARK_OUTPUT.path, encodePng(renderBrandMark(marks)));
  outputs.set(ICO_PATH, buildIco(ICO_SIZES.map((size) => ({ size, png: tilePng(size) }))));
  outputs.set(
    ICNS_PATH,
    buildIcns(ICNS_TYPES.map(([type, size]) => ({ type, png: tilePng(size) }))),
  );
  return outputs;
}

export function generateAll(outRoot = REPO_ROOT, marks = loadMarks()) {
  const outputs = buildOutputs(marks);
  for (const [relativePath, buffer] of outputs) {
    const target = path.join(outRoot, relativePath);
    mkdirSync(path.dirname(target), { recursive: true });
    writeFileSync(target, buffer);
  }
  return [...outputs.keys()];
}

function samePixels(a, b) {
  const left = decodePng(a);
  const right = decodePng(b);
  return left.width === right.width && left.height === right.height && left.data.equals(right.data);
}

function sameContainer(expected, actual, parse, keyOf) {
  const want = parse(expected);
  const got = parse(actual);
  return (
    want.length === got.length &&
    want.every((entry, i) => keyOf(entry) === keyOf(got[i]) && samePixels(entry.png, got[i].png))
  );
}

/** Compare regenerated outputs with `root` by decoded pixels (zlib bytes differ across Node versions). */
export function checkAll(root = REPO_ROOT, marks = loadMarks()) {
  const mismatches = [];
  for (const [relativePath, expected] of buildOutputs(marks)) {
    const target = path.join(root, relativePath);
    if (!existsSync(target)) {
      mismatches.push(`${relativePath}: missing`);
      continue;
    }
    const actual = readFileSync(target);
    let same = false;
    try {
      if (relativePath === ICO_PATH) {
        same = sameContainer(expected, actual, parseIco, (entry) => entry.size);
      } else if (relativePath === ICNS_PATH) {
        same = sameContainer(expected, actual, parseIcns, (entry) => entry.type);
      } else {
        same = samePixels(expected, actual);
      }
    } catch {
      same = false;
    }
    if (!same) mismatches.push(`${relativePath}: pixels differ`);
  }
  return mismatches;
}

function parseArgs(argv) {
  const args = { check: false, out: null };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--check") {
      args.check = true;
    } else if (argv[i] === "--out") {
      args.out = argv[++i];
      if (!args.out) throw new Error("--out needs a directory");
    } else {
      throw new Error(`Unknown argument ${argv[i]}`);
    }
  }
  return args;
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.check) {
    const mismatches = checkAll(args.out ? path.resolve(args.out) : REPO_ROOT);
    if (mismatches.length > 0) {
      console.error(`Brand assets are out of date:\n${mismatches.map((m) => `  ${m}`).join("\n")}`);
      console.error("Run: node branding/generate-assets.mjs");
      process.exit(1);
    }
    console.log("Brand assets are up to date.");
    return;
  }
  const written = generateAll(args.out ? path.resolve(args.out) : REPO_ROOT);
  console.log(`Wrote ${written.length} files.`);
}

if (isMainModule(import.meta.url)) {
  main();
}
