import path from "node:path";
import { fileURLToPath } from "node:url";
import { expect, test } from "vitest";
import { computeTreeChecksum } from "./tree-checksum.js";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../../../../..");

test("matches the reference checksum in scripts/zekoder-plugin-tree.mjs for plugins/zekoder", async () => {
  const { computeTreeChecksum: reference } =
    await import("../../../../../../../scripts/zekoder-plugin-tree.mjs");
  const pluginDir = path.join(repoRoot, "plugins", "zekoder");
  expect(computeTreeChecksum(pluginDir)).toBe(reference(pluginDir));
});
