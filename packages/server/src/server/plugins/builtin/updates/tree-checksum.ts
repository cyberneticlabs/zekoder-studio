import { createHash } from "node:crypto";
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";

// Port of `computeTreeChecksum` in scripts/zekoder-plugin-tree.mjs (the reference). The server
// package cannot import from scripts/, so behaviour must stay identical; tree-checksum.test.ts
// asserts the two agree on plugins/zekoder.

function listFiles(directory: string): string[] {
  const files: string[] = [];
  const walk = (current: string): void => {
    for (const entry of readdirSync(current, { withFileTypes: true })) {
      const entryPath = path.join(current, entry.name);
      if (entry.isDirectory()) {
        walk(entryPath);
      } else if (entry.isFile()) {
        files.push(path.relative(directory, entryPath).split(path.sep).join("/"));
      }
    }
  };
  walk(directory);
  return files.sort();
}

export function computeTreeChecksum(directory: string): string {
  const hash = createHash("sha256");
  for (const relativePath of listFiles(directory)) {
    const content = readFileSync(path.join(directory, ...relativePath.split("/")));
    hash.update(`${relativePath}\0${content.length}\0`);
    hash.update(content);
    hash.update("\0");
  }
  return hash.digest("hex");
}
