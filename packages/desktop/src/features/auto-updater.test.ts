import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { UUID } from "builder-util-runtime";
import { describe, expect, it, vi } from "vitest";

import {
  bucketFromStagingUserId,
  createAppUpdateLifecycleLogger,
  resolveStagingUserId,
  rolloutManifestSchema,
  shouldAdmitToRollout,
  shouldInstallAppUpdateOnQuit,
} from "./auto-updater";
import { DESKTOP_RELEASE_CATALOG_URL } from "./desktop-release-catalog";
import { loadWireCatalogFixture } from "./test-utils/fake-electron-updater";
import {
  createHarness,
  releaseOf,
  targetOf,
  type Fixture,
} from "./test-utils/branded-update-harness";

function check(
  harness: ReturnType<typeof createHarness>,
  overrides: Partial<{
    releaseChannel: "stable" | "beta";
    intent: "automatic" | "manual";
    currentVersion: string;
  }> = {},
) {
  return harness.service.checkForAppUpdate({
    currentVersion: "0.0.9",
    releaseChannel: "stable",
    intent: "manual",
    ...overrides,
  });
}

const NO_UPDATE = {
  hasUpdate: false,
  readyToInstall: false,
  currentVersion: "0.0.9",
  latestVersion: "0.0.9",
  body: null,
  date: null,
  errorMessage: null,
};

describe("branded update service", () => {
  it("never contacts the catalog or the updater for an unpackaged app", async () => {
    const harness = createHarness({ currentVersion: "0.0.9", packaged: false });

    const result = await check(harness);

    expect(result).toEqual(NO_UPDATE);
    expect(harness.transport.requested).toEqual([]);
    expect(harness.updaterResolved).toBe(0);
  });

  it("reports no update and no error while the catalog is unpublished", async () => {
    const harness = createHarness({ currentVersion: "0.0.9", catalog: null });

    const result = await check(harness);

    expect(result).toEqual(NO_UPDATE);
    expect(harness.transport.requested).toEqual([DESKTOP_RELEASE_CATALOG_URL]);
    expect(harness.updater.feedCalls).toEqual([]);
    expect(harness.updater.feedRequests).toEqual([]);
    expect(harness.checkErrors).toEqual([]);
  });

  it("reports no update and no error when a channel pointer is not published", async () => {
    const catalog = loadWireCatalogFixture();
    catalog.channels.stable = null;
    const harness = createHarness({ currentVersion: "0.0.9", catalog });

    expect(await check(harness)).toEqual(NO_UPDATE);
    expect(harness.updater.feedCalls).toEqual([]);
  });

  it("reports no update and no error when the pinned snapshot lacks its channel feed", async () => {
    const harness = createHarness({ currentVersion: "0.0.9", publishFeeds: false });
    const feedUrl = targetOf(
      releaseOf(loadWireCatalogFixture(), "v0.1.0"),
      "darwin",
      "arm64",
    ).feedUrl;

    const result = await check(harness);

    expect(result).toEqual(NO_UPDATE);
    expect(harness.updater.feedUrls).toEqual([`${feedUrl}latest-mac.yml`]);
    expect(harness.checkErrors).toEqual([]);
  });

  it("surfaces a genuine feed network failure and reports it", async () => {
    const harness = createHarness({ currentVersion: "0.0.9" });
    harness.updater.failChecks(new Error("network down"));

    const result = await check(harness);

    expect(result).toEqual({ ...NO_UPDATE, errorMessage: "network down" });
    expect(harness.checkErrors).toHaveLength(1);
  });

  it("surfaces a catalog network failure without ever configuring the updater feed", async () => {
    const harness = createHarness({ currentVersion: "0.0.9" });
    harness.transport.failure = new Error("catalog unreachable");

    const result = await check(harness);

    expect(result).toEqual({ ...NO_UPDATE, errorMessage: "catalog unreachable" });
    expect(harness.updater.feedCalls).toEqual([]);
    expect(harness.updater.feedRequests).toEqual([]);
    expect(harness.updater.bakedInFeedChecks).toBe(0);
  });

  it("offers the stable snapshot through its immutable generic feed with the YAML release notes", async () => {
    const harness = createHarness({ currentVersion: "0.0.9" });
    const feedUrl = targetOf(
      releaseOf(loadWireCatalogFixture(), "v0.1.0"),
      "darwin",
      "arm64",
    ).feedUrl;

    const result = await check(harness);

    expect(harness.updater.feedCalls).toEqual([
      { provider: "generic", url: feedUrl, channel: "latest" },
    ]);
    expect(harness.updater.feedUrls).toEqual([`${feedUrl}latest-mac.yml`]);
    expect(result).toEqual({
      hasUpdate: true,
      readyToInstall: false,
      currentVersion: "0.0.9",
      latestVersion: "0.1.0",
      body: "Notes for 0.1.0",
      date: "2026-10-10T10:00:00.000Z",
      errorMessage: null,
    });
    expect(harness.updater.allowDowngrade).toBe(false);
    expect(harness.updater.autoInstallOnAppQuit).toBe(false);
    expect(harness.updater.autoDownload).toBe(true);
  });

  it.each([
    { platform: "darwin", arch: "arm64", file: "latest-mac.yml" },
    { platform: "darwin", arch: "x64", file: "latest-mac.yml" },
    { platform: "win32", arch: "x64", file: "latest.yml" },
    { platform: "win32", arch: "arm64", file: "latest.yml" },
    { platform: "linux", arch: "x64", file: "latest-linux.yml" },
  ])("selects the $platform/$arch feed", async ({ platform, arch, file }) => {
    const harness = createHarness({ currentVersion: "0.0.9", platform, arch });
    const feedUrl = targetOf(releaseOf(loadWireCatalogFixture(), "v0.1.0"), platform, arch).feedUrl;

    const result = await check(harness);

    expect(result.hasUpdate).toBe(true);
    expect(feedUrl).toContain(`/v0.1.0/${platform}/${arch}/`);
    expect(harness.updater.feedUrls).toEqual([`${feedUrl}${file}`]);
  });

  it("offers nothing on an architecture the release does not ship", async () => {
    const harness = createHarness({ currentVersion: "0.0.9", platform: "linux", arch: "arm64" });

    expect(await check(harness)).toEqual(NO_UPDATE);
    expect(harness.updater.feedCalls).toEqual([]);
    expect(harness.checkErrors).toEqual([]);
  });

  it("offers nothing when the release is only partially published for this target", async () => {
    const catalog = loadWireCatalogFixture();
    catalog.releases["v0.1.0"].targets = catalog.releases["v0.1.0"].targets.filter(
      (target) => !(target.platform === "darwin" && target.arch === "arm64"),
    );
    const harness = createHarness({ currentVersion: "0.0.9", catalog });

    expect(await check(harness)).toEqual(NO_UPDATE);
    expect(harness.updater.feedCalls).toEqual([]);
  });

  it("keeps the stable channel on stable releases only", async () => {
    const catalog = loadWireCatalogFixture();
    catalog.channels.stable = "v0.2.0-beta.1";
    const harness = createHarness({ currentVersion: "0.0.9", catalog });

    const result = await check(harness);

    expect(result.errorMessage).toContain("not a stable release");
    expect(harness.updater.feedCalls).toEqual([]);
  });

  it("follows the beta pointer through the beta channel feed", async () => {
    const harness = createHarness({ currentVersion: "0.1.0" });
    const feedUrl = targetOf(
      releaseOf(loadWireCatalogFixture(), "v0.2.0-beta.1"),
      "darwin",
      "arm64",
    ).feedUrl;

    const result = await check(harness, { releaseChannel: "beta", currentVersion: "0.1.0" });

    expect(harness.updater.feedCalls).toEqual([
      { provider: "generic", url: feedUrl, channel: "beta" },
    ]);
    expect(harness.updater.feedUrls).toEqual([`${feedUrl}beta-mac.yml`]);
    expect(result.latestVersion).toBe("0.2.0-beta.1");
    expect(harness.updater.allowPrerelease).toBe(true);
    expect(harness.updater.allowDowngrade).toBe(false);
  });

  it("moves beta users to the final stable through that snapshot's beta alias", async () => {
    const catalog = loadWireCatalogFixture();
    catalog.channels.beta = "v0.1.0";
    const harness = createHarness({ currentVersion: "0.1.0-beta.3", catalog });
    const feedUrl = targetOf(catalog.releases["v0.1.0"], "darwin", "arm64").feedUrl;

    const result = await check(harness, { releaseChannel: "beta", currentVersion: "0.1.0-beta.3" });

    expect(harness.updater.feedUrls).toEqual([`${feedUrl}beta-mac.yml`]);
    expect(result).toMatchObject({ hasUpdate: true, latestVersion: "0.1.0" });
  });

  it("never downgrades a beta client when the beta pointer holds an older stable", async () => {
    const catalog = loadWireCatalogFixture();
    catalog.channels.beta = "v0.1.0";
    const harness = createHarness({ currentVersion: "0.2.0-beta.1", catalog });

    const result = await check(harness, {
      releaseChannel: "beta",
      currentVersion: "0.2.0-beta.1",
    });

    expect(result.hasUpdate).toBe(false);
    expect(harness.updater.allowDowngrade).toBe(false);
    expect(harness.updater.downloads).toEqual([]);
  });

  it("downloads only from the feed selected by the check", async () => {
    const harness = createHarness({ currentVersion: "0.0.9" });
    const feedUrl = targetOf(
      releaseOf(loadWireCatalogFixture(), "v0.1.0"),
      "darwin",
      "arm64",
    ).feedUrl;

    await check(harness, { intent: "automatic", currentVersion: "0.0.9" });
    harness.updater.finishDownload();

    expect(harness.updater.downloads).toEqual([{ version: "0.1.0", feedUrl }]);
    expect(harness.updater.downloaded).toEqual([{ version: "0.1.0", feedUrl }]);
  });

  it("applies the rollout stamped in the stable feed and lets manual checks bypass it", async () => {
    const early = createHarness({
      currentVersion: "0.0.9",
      bucket: 0.99,
      now: "2026-10-10T12:00:00.000Z",
    });
    expect((await check(early, { intent: "automatic" })).hasUpdate).toBe(false);
    expect((await check(early, { intent: "manual" })).hasUpdate).toBe(true);

    const betaClient = createHarness({
      currentVersion: "0.1.0",
      bucket: 0.99,
      now: "2026-10-12T10:00:01.000Z",
    });
    const beta = await check(betaClient, {
      releaseChannel: "beta",
      intent: "automatic",
      currentVersion: "0.1.0",
    });
    expect(beta.hasUpdate).toBe(true);
  });

  it("re-reads the catalog on every check and repins to the newly published snapshot", async () => {
    const harness = createHarness({ currentVersion: "0.0.9" });
    await check(harness);

    const next = loadWireCatalogFixture();
    const stable = structuredClone(next.releases["v0.1.0"]);
    const newer = JSON.parse(
      JSON.stringify(stable).replaceAll("v0.1.0", "v0.1.1").replaceAll("0.1.0", "0.1.1"),
    );
    next.releases["v0.1.1"] = newer;
    next.channels.stable = "v0.1.1";
    harness.transport.catalog = next;
    harness.updater.publishFeed(targetOf(newer, "darwin", "arm64").feedUrl, "latest", {
      version: "0.1.1",
      releaseNotes: "Notes for 0.1.1",
    });
    const result = await check(harness);

    expect(harness.transport.requested).toHaveLength(2);
    expect(harness.updater.feedCalls.map((call) => call.url)).toEqual([
      targetOf(stable, "darwin", "arm64").feedUrl,
      targetOf(newer, "darwin", "arm64").feedUrl,
    ]);
    expect(result.latestVersion).toBe("0.1.1");
  });

  it("rejects a feed whose YAML version disagrees with the selected release before downloading", async () => {
    const harness = createHarness({ currentVersion: "0.0.9" });
    const feedUrl = targetOf(
      releaseOf(loadWireCatalogFixture(), "v0.1.0"),
      "darwin",
      "arm64",
    ).feedUrl;
    harness.updater.publishFeed(feedUrl, "latest", { version: "0.5.0", releaseNotes: "wrong" });

    const result = await check(harness);

    expect(result.hasUpdate).toBe(false);
    expect(result.errorMessage).toContain("does not match release catalog version 0.1.0");
    expect(harness.updater.downloads).toEqual([]);
  });

  it("rejects a feed that echoes the installed version when the catalog selected a newer one", async () => {
    const harness = createHarness({ currentVersion: "0.1.0" });
    const catalog = harness.transport.catalog as Fixture;
    harness.updater.publishFeed(
      targetOf(catalog.releases["v0.2.0-beta.1"], "darwin", "arm64").feedUrl,
      "beta",
      { version: "0.1.0", releaseNotes: "stale" },
    );

    const result = await check(harness, { releaseChannel: "beta", currentVersion: "0.1.0" });

    expect(result.errorMessage).toContain("does not match release catalog version 0.2.0-beta.1");
  });

  describe("invalid catalogs fail closed", () => {
    const mutations: Array<[string, (catalog: Fixture) => unknown, string]> = [
      ["a catalog from a newer schema", (c) => ({ ...c, schemaVersion: 2 }), "schemaVersion"],
      ["a catalog that is not an object", () => "<html>", "expected object"],
      [
        "a feed on another host",
        (c) => {
          const t = targetOf(c.releases["v0.1.0"], "darwin", "arm64");
          t.feedUrl = t.feedUrl.replace("storage.googleapis.com", "updates.example.com");
          return c;
        },
        "must be a plain https URL",
      ],
      [
        "a plain http feed",
        (c) => {
          const t = targetOf(c.releases["v0.1.0"], "darwin", "arm64");
          t.feedUrl = t.feedUrl.replace("https:", "http:");
          return c;
        },
        "must be a plain https URL",
      ],
      [
        "a feed in the skills release namespace",
        (c) => {
          const t = targetOf(c.releases["v0.1.0"], "darwin", "arm64");
          t.feedUrl = "https://storage.googleapis.com/zekoder-releases/releases/v0.1.0/";
          return c;
        },
        "must be inside",
      ],
      [
        "a feed in another bucket",
        (c) => {
          const t = targetOf(c.releases["v0.1.0"], "darwin", "arm64");
          t.feedUrl = t.feedUrl.replace("/zekoder-releases/", "/other-bucket/");
          return c;
        },
        "must be inside",
      ],
      [
        "a feed with a query string",
        (c) => {
          const t = targetOf(c.releases["v0.1.0"], "darwin", "arm64");
          t.feedUrl = `${t.feedUrl}?x=1`;
          return c;
        },
        "must be a plain https URL",
      ],
      [
        "a feed that is not the immutable target directory",
        (c) => {
          const t = targetOf(c.releases["v0.1.0"], "darwin", "arm64");
          t.feedUrl = t.feedUrl.replace("/darwin/arm64/", "/darwin/x64/");
          return c;
        },
        "feedUrl must be",
      ],
      [
        "a feed from another release",
        (c) => {
          const t = targetOf(c.releases["v0.1.0"], "darwin", "arm64");
          t.feedUrl = t.feedUrl.replace("/v0.1.0/", "/v0.2.0-beta.1/");
          return c;
        },
        "feedUrl must be",
      ],
      [
        "release notes outside the release",
        (c) => {
          c.releases["v0.1.0"].releaseNotesUrl =
            "https://storage.googleapis.com/zekoder-releases/desktop/releases/v0.2.0-beta.1/release-notes.md";
          return c;
        },
        "releaseNotesUrl must be inside its release",
      ],
      [
        "a release whose version differs from its tag",
        (c) => {
          c.releases["v0.1.0"].version = "0.1.1";
          return c;
        },
        "has version 0.1.1",
      ],
      [
        "a release whose channel differs from its tag",
        (c) => {
          c.releases["v0.1.0"].channel = "beta";
          return c;
        },
        "has channel beta",
      ],
      [
        "an entry keyed by a different tag",
        (c) => {
          c.releases["v0.1.0"].tag = "v0.1.2";
          return c;
        },
        "has tag v0.1.2",
      ],
      [
        "a non-grammar tag",
        (c) => {
          c.channels.stable = "0.1.0";
          c.releases["0.1.0"] = { ...c.releases["v0.1.0"], tag: "0.1.0" };
          return c;
        },
        "unsupported tag",
      ],
      [
        "a pointer without a release entry",
        (c) => {
          c.channels.stable = "v0.9.9";
          return c;
        },
        "has no release entry",
      ],
    ];

    it.each(mutations)("rejects %s", async (_label, mutate, message) => {
      const catalog = mutate(loadWireCatalogFixture());
      const harness = createHarness({ currentVersion: "0.0.9", catalog });

      const result = await check(harness);

      expect(result.hasUpdate).toBe(false);
      expect(result.errorMessage).toContain(message);
      expect(harness.updater.feedCalls).toEqual([]);
      expect(harness.updater.feedRequests).toEqual([]);
      expect(harness.updater.bakedInFeedChecks).toBe(0);
      expect(harness.checkErrors).toHaveLength(1);
    });
  });

  it("only ever requests objects under the fork-owned desktop prefix", async () => {
    const harness = createHarness({ currentVersion: "0.0.9" });
    await check(harness);
    await check(harness, { releaseChannel: "beta" });
    harness.updater.finishDownload();

    const requested = [...harness.transport.requested, ...harness.updater.feedUrls];
    expect(requested.length).toBeGreaterThanOrEqual(4);
    for (const url of requested) {
      expect(
        url.startsWith("https://storage.googleapis.com/zekoder-releases/desktop/releases/"),
      ).toBe(true);
    }
    expect(harness.updater.bakedInFeedChecks).toBe(0);
  });

  it("logs the update handoff with current and selected target versions", () => {
    const info = vi.fn();
    const lifecycleLog = createAppUpdateLifecycleLogger({ info });

    lifecycleLog.checkStarted({
      currentVersion: "1.2.3",
      releaseChannel: "stable",
      intent: "manual",
    });
    lifecycleLog.checkCompleted({
      currentVersion: "1.2.3",
      targetVersion: "1.2.5",
      releaseChannel: "stable",
      intent: "manual",
      hasUpdate: true,
      readyToInstall: true,
      errorMessage: null,
    });
    lifecycleLog.updateDownloaded("1.2.4");
    lifecycleLog.downloadRequested("1.2.5");
    lifecycleLog.quitAndInstallRequested({
      targetVersion: "1.2.5",
      isSilent: false,
      isForceRunAfter: true,
    });

    expect(info).toHaveBeenCalledWith("[auto-updater] check started", {
      currentVersion: "1.2.3",
      releaseChannel: "stable",
      intent: "manual",
    });
    expect(info).toHaveBeenCalledWith("[auto-updater] update downloaded", {
      targetVersion: "1.2.4",
    });
    expect(info).toHaveBeenCalledWith("[auto-updater] download requested", {
      targetVersion: "1.2.5",
    });
    expect(info).toHaveBeenCalledWith("[auto-updater] quitAndInstall requested", {
      targetVersion: "1.2.5",
      isSilent: false,
      isForceRunAfter: true,
    });
  });
});

describe("shouldInstallAppUpdateOnQuit", () => {
  it("keeps Linux AppImage updates on the manual install path", () => {
    expect(shouldInstallAppUpdateOnQuit({ platform: "linux", isAppImage: true })).toBe(false);
    expect(shouldInstallAppUpdateOnQuit({ platform: "linux", isAppImage: false })).toBe(true);
    expect(shouldInstallAppUpdateOnQuit({ platform: "darwin", isAppImage: false })).toBe(true);
    expect(shouldInstallAppUpdateOnQuit({ platform: "win32", isAppImage: false })).toBe(true);
  });
});

describe("shouldAdmitToRollout", () => {
  it("admits beta, missing rollout hours, zero-hour rollout, and missing release date", () => {
    expect(
      shouldAdmitToRollout({
        channel: "beta",
        rolloutHours: 24,
        releaseDate: "2026-04-28T00:00:00.000Z",
        now: Date.parse("2026-04-28T01:00:00.000Z"),
        bucket: 0.99,
      }),
    ).toBe(true);
    expect(
      shouldAdmitToRollout({
        channel: "stable",
        rolloutHours: undefined,
        releaseDate: "2026-04-28T00:00:00.000Z",
        now: Date.parse("2026-04-28T01:00:00.000Z"),
        bucket: 0.99,
      }),
    ).toBe(true);
    expect(
      shouldAdmitToRollout({
        channel: "stable",
        rolloutHours: 0,
        releaseDate: "2026-04-28T00:00:00.000Z",
        now: Date.parse("2026-04-28T01:00:00.000Z"),
        bucket: 0.99,
      }),
    ).toBe(true);
    expect(
      shouldAdmitToRollout({
        channel: "stable",
        rolloutHours: 24,
        releaseDate: undefined,
        now: Date.parse("2026-04-28T01:00:00.000Z"),
        bucket: 0.99,
      }),
    ).toBe(true);
  });

  it("blocks future releases and respects the linear threshold mid-rollout", () => {
    expect(
      shouldAdmitToRollout({
        channel: "stable",
        rolloutHours: 24,
        releaseDate: "2026-04-28T02:00:00.000Z",
        now: Date.parse("2026-04-28T01:00:00.000Z"),
        bucket: 0,
      }),
    ).toBe(false);
    expect(
      shouldAdmitToRollout({
        channel: "stable",
        rolloutHours: 24,
        releaseDate: "2026-04-28T00:00:00.000Z",
        now: Date.parse("2026-04-28T12:00:00.000Z"),
        bucket: 0.49,
      }),
    ).toBe(true);
    expect(
      shouldAdmitToRollout({
        channel: "stable",
        rolloutHours: 24,
        releaseDate: "2026-04-28T00:00:00.000Z",
        now: Date.parse("2026-04-28T12:00:00.000Z"),
        bucket: 0.51,
      }),
    ).toBe(false);
  });

  it("blocks the bucket-zero client at exact release time, admits as soon as time advances", () => {
    expect(
      shouldAdmitToRollout({
        channel: "stable",
        rolloutHours: 24,
        releaseDate: "2026-04-28T00:00:00.000Z",
        now: Date.parse("2026-04-28T00:00:00.000Z"),
        bucket: 0,
      }),
    ).toBe(false);
    expect(
      shouldAdmitToRollout({
        channel: "stable",
        rolloutHours: 24,
        releaseDate: "2026-04-28T00:00:00.000Z",
        now: Date.parse("2026-04-28T00:00:00.001Z"),
        bucket: 0,
      }),
    ).toBe(true);
  });

  it("admits the highest-bucket client at and past the rollout end", () => {
    const maxBucket = (0x100000000 - 1) / 0x100000000;
    expect(
      shouldAdmitToRollout({
        channel: "stable",
        rolloutHours: 24,
        releaseDate: "2026-04-28T00:00:00.000Z",
        now: Date.parse("2026-04-29T00:00:00.000Z"),
        bucket: maxBucket,
      }),
    ).toBe(true);
    expect(
      shouldAdmitToRollout({
        channel: "stable",
        rolloutHours: 24,
        releaseDate: "2026-04-28T00:00:00.000Z",
        now: Date.parse("2027-04-28T00:00:00.000Z"),
        bucket: maxBucket,
      }),
    ).toBe(true);
  });

  it("admits when releaseDate is unparseable", () => {
    expect(
      shouldAdmitToRollout({
        channel: "stable",
        rolloutHours: 24,
        releaseDate: "not a date",
        now: Date.parse("2026-04-28T12:00:00.000Z"),
        bucket: 0.99,
      }),
    ).toBe(true);
  });

  it("treats garbage manifest rollout fields as missing and admits", () => {
    const parsed = rolloutManifestSchema.parse({
      rolloutHours: "not a number",
      releaseDate: 12345,
    });

    expect(
      shouldAdmitToRollout({
        channel: "stable",
        rolloutHours: parsed.rolloutHours,
        releaseDate: parsed.releaseDate,
        now: Date.parse("2026-04-28T12:00:00.000Z"),
        bucket: 0.99,
      }),
    ).toBe(true);
  });

  it("maps the maximum 32-bit slot to a bucket strictly less than 1", () => {
    const allOnes = "ffffffff-ffff-ffff-ffff-ffffffffffff";
    const allZeros = "00000000-0000-0000-0000-000000000000";
    expect(bucketFromStagingUserId(allOnes)).toBeLessThan(1);
    expect(bucketFromStagingUserId(allOnes)).toBeGreaterThan(0.999);
    expect(bucketFromStagingUserId(allZeros)).toBe(0);
  });

  it("creates and then reuses the on-disk staging user id", async () => {
    const tempDir = await mkdtemp(path.join(os.tmpdir(), "paseo-updater-id-"));
    const filePath = path.join(tempDir, ".updaterId");

    try {
      const first = await resolveStagingUserId(filePath);
      const stored = (await readFile(filePath, "utf8")).trim();
      const second = await resolveStagingUserId(filePath);

      expect(UUID.check(stored)).toBeTruthy();
      expect(second).toBe(first);
    } finally {
      await rm(tempDir, { force: true, recursive: true });
    }
  });
});
