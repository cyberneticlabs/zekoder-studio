import { createBrandedAppUpdateService } from "../auto-updater";
import {
  FakeCatalogTransport,
  FakeElectronUpdater,
  loadWireCatalogFixture,
  type FakeFeedInfo,
} from "./fake-electron-updater";

export const ARM_MAC = { platform: "darwin", arch: "arm64" };

export type Fixture = ReturnType<typeof loadWireCatalogFixture>;
export type BrandedHarness = ReturnType<typeof createHarness>;

export function releaseFeedInfo(release: Fixture["releases"][string]): FakeFeedInfo {
  return {
    version: release.version,
    releaseNotes: `Notes for ${release.version}`,
    releaseDate: release.publishedAt,
    rolloutHours: release.channel === "stable" ? 36 : 0,
  };
}

// Wires the real service and catalog runtime to in-memory edges. Feed YAML is published the way
// the pipeline does: latest* only for stable snapshots, beta* (an alias) for every snapshot.
export function createHarness(input: {
  platform?: string;
  arch?: string;
  currentVersion: string;
  packaged?: boolean;
  catalog?: unknown;
  bucket?: number;
  now?: string;
  publishFeeds?: boolean;
  isUnsignedInstall?: () => Promise<boolean>;
}) {
  const platform = input.platform ?? ARM_MAC.platform;
  const arch = input.arch ?? ARM_MAC.arch;
  const transport = new FakeCatalogTransport();
  transport.catalog = input.catalog === undefined ? loadWireCatalogFixture() : input.catalog;
  const updater = new FakeElectronUpdater({ platform, currentVersion: input.currentVersion });
  const wire = transport.catalog as Fixture | null;
  for (const release of input.publishFeeds === false ? [] : Object.values(wire?.releases ?? {})) {
    for (const target of release.targets) {
      if (target.platform !== platform || target.arch !== arch) continue;
      if (release.channel === "stable") {
        updater.publishFeed(target.feedUrl, "latest", releaseFeedInfo(release));
      }
      updater.publishFeed(target.feedUrl, "beta", releaseFeedInfo(release));
    }
  }
  const checkErrors: unknown[] = [];
  const runtimeErrors: unknown[] = [];
  let updaterResolved = 0;
  const service = createBrandedAppUpdateService({
    updater: () => {
      updaterResolved += 1;
      return updater;
    },
    transport,
    platform,
    arch,
    isPackaged: () => input.packaged ?? true,
    now: () => Date.parse(input.now ?? "2026-10-20T00:00:00.000Z"),
    bucket: async () => input.bucket ?? 0.5,
    isUnsignedInstall: input.isUnsignedInstall,
    reportCheckError: (error) => checkErrors.push(error),
    reportRuntimeError: (error) => runtimeErrors.push(error),
  });
  return {
    service,
    updater,
    transport,
    checkErrors,
    runtimeErrors,
    get updaterResolved() {
      return updaterResolved;
    },
  };
}

export function releaseOf(catalog: Fixture, tag: string) {
  return catalog.releases[tag];
}

export function targetOf(release: Fixture["releases"][string], platform: string, arch: string) {
  const target = release.targets.find((c) => c.platform === platform && c.arch === arch);
  if (!target) throw new Error(`fixture has no ${platform}/${arch} target`);
  return target;
}

/**
 * Publishes `tag` as a copy of an existing snapshot (new tag, version and feed directories) and
 * moves the matching channel pointers to it, as a later release would.
 */
export function publishFollowingRelease(
  harness: BrandedHarness,
  { from, tag }: { from: string; tag: string },
): string {
  const catalog = harness.transport.catalog as Fixture;
  const version = tag.slice(1);
  const copy = JSON.parse(
    JSON.stringify(catalog.releases[from]).replaceAll(from, tag).replaceAll(from.slice(1), version),
  ) as Fixture["releases"][string];
  catalog.releases[tag] = copy;
  if (copy.channel === "stable") catalog.channels.stable = tag;
  catalog.channels.beta = tag;
  for (const target of copy.targets) {
    if (target.platform !== ARM_MAC.platform || target.arch !== ARM_MAC.arch) continue;
    if (copy.channel === "stable") {
      harness.updater.publishFeed(target.feedUrl, "latest", releaseFeedInfo(copy));
    }
    harness.updater.publishFeed(target.feedUrl, "beta", releaseFeedInfo(copy));
  }
  return targetOf(copy, ARM_MAC.platform, ARM_MAC.arch).feedUrl;
}
