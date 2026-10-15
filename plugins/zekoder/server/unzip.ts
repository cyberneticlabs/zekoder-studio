import { chmod, mkdir, writeFile } from "node:fs/promises";
import { dirname, isAbsolute, relative, resolve, sep } from "node:path";
import * as zlib from "node:zlib";

const EOCD_SIG = 0x06054b50;
const CEN_SIG = 0x02014b50;
const LOC_SIG = 0x04034b50;
const EOCD_MIN = 22;
const MAX_COMMENT = 0xffff;
const ZIP64_MARK = 0xffffffff;

/** Looked up at runtime: older Node has no zlib.crc32, and a named ESM import would fail to link. */
const nativeCrc32 = (zlib as { crc32?: (data: Buffer) => number }).crc32;
let crcTable: Uint32Array | undefined;

function crc32(data: Buffer): number {
  if (typeof nativeCrc32 === "function") return nativeCrc32(data) >>> 0;
  if (!crcTable) {
    crcTable = new Uint32Array(256);
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      crcTable[n] = c >>> 0;
    }
  }
  let crc = 0xffffffff;
  for (let i = 0; i < data.length; i++) crc = crcTable[(crc ^ data[i]) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

/** Resolve a zip entry name inside `root`. Throws on absolute paths, `..`, or any escape. */
function safeTarget(root: string, name: string): string {
  if (name.includes("\0")) throw new Error(`unsafe zip entry (NUL byte): ${JSON.stringify(name)}`);
  const unified = name.replace(/\\/g, "/");
  if (unified.startsWith("/") || /^[A-Za-z]:/.test(unified) || isAbsolute(name)) {
    throw new Error(`unsafe zip entry (absolute path): ${name}`);
  }
  if (unified.split("/").includes("..")) throw new Error(`unsafe zip entry (.. segment): ${name}`);
  const target = resolve(root, unified);
  const rel = relative(root, target);
  if (rel === "" || rel === ".." || rel.startsWith(`..${sep}`) || isAbsolute(rel)) {
    throw new Error(`unsafe zip entry (outside target): ${name}`);
  }
  return target;
}

interface Entry {
  name: string;
  method: number;
  flags: number;
  crc: number;
  compressedSize: number;
  size: number;
  localOffset: number;
  mode: number;
}

function readEntries(buf: Buffer): Entry[] {
  let eocd = -1;
  const stop = Math.max(0, buf.length - EOCD_MIN - MAX_COMMENT);
  for (let i = buf.length - EOCD_MIN; i >= stop; i--) {
    if (buf.readUInt32LE(i) === EOCD_SIG) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) throw new Error("not a zip file (no end-of-central-directory record)");
  const total = buf.readUInt16LE(eocd + 10);
  const cdSize = buf.readUInt32LE(eocd + 12);
  const cdOffset = buf.readUInt32LE(eocd + 16);
  if (total === 0xffff || cdSize === ZIP64_MARK || cdOffset === ZIP64_MARK)
    throw new Error("zip64 archives are not supported");
  const entries: Entry[] = [];
  let p = cdOffset;
  for (let i = 0; i < total; i++) {
    if (p + 46 > buf.length || buf.readUInt32LE(p) !== CEN_SIG)
      throw new Error("corrupt zip central directory");
    const flags = buf.readUInt16LE(p + 8);
    const nameLen = buf.readUInt16LE(p + 28);
    const extraLen = buf.readUInt16LE(p + 30);
    const commentLen = buf.readUInt16LE(p + 32);
    const madeBy = buf.readUInt16LE(p + 4) >> 8;
    const attrs = buf.readUInt32LE(p + 38);
    const entry: Entry = {
      name: buf.toString(flags & 0x800 ? "utf8" : "latin1", p + 46, p + 46 + nameLen),
      method: buf.readUInt16LE(p + 10),
      flags,
      crc: buf.readUInt32LE(p + 16),
      compressedSize: buf.readUInt32LE(p + 20),
      size: buf.readUInt32LE(p + 24),
      localOffset: buf.readUInt32LE(p + 42),
      mode: madeBy === 3 ? (attrs >>> 16) & 0xffff : 0, // POSIX modes only when made on Unix
    };
    if (
      entry.compressedSize === ZIP64_MARK ||
      entry.size === ZIP64_MARK ||
      entry.localOffset === ZIP64_MARK
    ) {
      throw new Error(`zip64 entry is not supported: ${entry.name}`);
    }
    entries.push(entry);
    p += 46 + nameLen + extraLen + commentLen;
  }
  return entries;
}

/**
 * Extract a zip held in memory into `destDir`. Supports stored and deflate entries; rejects
 * encrypted, zip64 and other methods. Any unsafe entry name fails the whole extraction before
 * anything is written.
 */
export async function extractZip(buf: Buffer, destDir: string): Promise<void> {
  const root = resolve(destDir);
  const entries = readEntries(buf);
  const plan = entries.map((entry) => {
    const isDir = entry.name.endsWith("/") || entry.name.endsWith("\\");
    return { entry, isDir, target: safeTarget(root, entry.name) };
  });
  for (const { entry, isDir } of plan) {
    if (isDir) continue;
    if (entry.flags & 0x1) throw new Error(`encrypted zip entry is not supported: ${entry.name}`);
    if (entry.method !== 0 && entry.method !== 8) {
      throw new Error(`unsupported zip compression method ${entry.method}: ${entry.name}`);
    }
  }
  await mkdir(root, { recursive: true });
  for (const { entry, isDir, target } of plan) {
    if (isDir) continue;
    const o = entry.localOffset;
    if (o + 30 > buf.length || buf.readUInt32LE(o) !== LOC_SIG)
      throw new Error(`corrupt zip local header: ${entry.name}`);
    const start = o + 30 + buf.readUInt16LE(o + 26) + buf.readUInt16LE(o + 28);
    const raw = buf.subarray(start, start + entry.compressedSize);
    if (raw.length !== entry.compressedSize) throw new Error(`truncated zip entry: ${entry.name}`);
    const data = entry.method === 0 ? raw : zlib.inflateRawSync(raw);
    if (data.length !== entry.size) throw new Error(`zip entry size mismatch: ${entry.name}`);
    if (crc32(data) !== entry.crc) throw new Error(`zip entry CRC mismatch: ${entry.name}`);
    await mkdir(dirname(target), { recursive: true });
    await writeFile(target, data);
    if (process.platform !== "win32" && entry.mode & 0o111) await chmod(target, entry.mode & 0o777);
  }
}
