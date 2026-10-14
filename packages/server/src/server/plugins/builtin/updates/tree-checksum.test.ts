import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { expect, test } from "vitest";
import { computeTreeChecksum } from "./tree-checksum.js";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../../../../..");

test("matches the checksum scripts/sync-zekoder-plugin.mjs recorded for the vendored plugin", () => {
  const lock = JSON.parse(
    readFileSync(path.join(repoRoot, "plugins", "zekoder.lock.json"), "utf8"),
  ) as { checksum: string };
  expect(computeTreeChecksum(path.join(repoRoot, "plugins", "zekoder"))).toBe(lock.checksum);
});
