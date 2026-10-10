import { readFileSync } from "node:fs";
import path from "node:path";
import type { ElectronUpdaterPort } from "../catalog-app-update-runtime.js";
import type { DesktopCatalogTransport } from "../desktop-release-catalog.js";
import type { RuntimeUpdateInfo } from "../app-update-service.js";

// In-memory stand-ins for the two network edges of the branded updater: the catalog read and
// electron-updater's generic provider. They record every URL touched so tests can prove the
// updater never leaves the fork-owned desktop prefix.

export interface WireRelease {
  tag: string;
  version: string;
  channel: string;
  releaseNotesUrl: string;
  publishedAt: string;
  targets: Array<{ platform: string; arch: string; feedUrl: string }>;
}

export interface WireCatalog {
  schemaVersion: number;
  channels: { stable: string | null; beta: string | null };
  releases: Record<string, WireRelease>;
}

// The catalog shape written by scripts/desktop-release; the same file is validated against the
// publisher's own validateCatalog in scripts/desktop-release/release-data.test.mjs.
export function loadWireCatalogFixture(): WireCatalog {
  return JSON.parse(
    readFileSync(path.join(__dirname, "../__fixtures__/desktop-release-catalog.wire.json"), "utf8"),
  ) as WireCatalog;
}

export class FakeCatalogTransport implements DesktopCatalogTransport {
  catalog: unknown = null;
  failure: Error | null = null;
  readonly requested: string[] = [];

  async fetchCatalog(url: string): Promise<unknown | null> {
    this.requested.push(url);
    if (this.failure) throw this.failure;
    return this.catalog === null ? null : structuredClone(this.catalog);
  }
}

export interface FakeFeedInfo extends RuntimeUpdateInfo {
  releaseDate?: string;
  rolloutHours?: number;
}

function channelFile(platform: string, channel: string): string {
  if (platform === "darwin") return `${channel}-mac.yml`;
  if (platform === "linux") return `${channel}-linux.yml`;
  return `${channel}.yml`;
}

function versionKey(version: string): { core: number[]; beta: number | null } {
  const [core, pre] = version.split("-beta.");
  return { core: core.split(".").map(Number), beta: pre === undefined ? null : Number(pre) };
}

// semver ordering for the x.y.z and x.y.z-beta.n shapes the pipeline produces.
function isNewer(candidate: string, current: string): boolean {
  const a = versionKey(candidate);
  const b = versionKey(current);
  for (let index = 0; index < 3; index += 1) {
    if (a.core[index] !== b.core[index]) return a.core[index] > b.core[index];
  }
  if (a.beta === b.beta) return false;
  if (a.beta === null) return true;
  if (b.beta === null) return false;
  return a.beta > b.beta;
}

interface FeedRequest {
  url: string;
}

export class FakeElectronUpdater implements ElectronUpdaterPort {
  autoDownload = false;
  autoRunAppAfterInstall = false;
  autoInstallOnAppQuit = true;
  allowPrerelease = false;
  allowDowngrade = false;
  isUserWithinRollout: ElectronUpdaterPort["isUserWithinRollout"] = () => true;
  logger: ElectronUpdaterPort["logger"] = null;

  readonly feedCalls: Array<{ provider: string; url: string; channel: string }> = [];
  /** Every feed file electron-updater would have fetched. */
  readonly feedRequests: FeedRequest[] = [];
  /** Checks attempted before any feed was set: electron-updater would read its baked-in feed. */
  bakedInFeedChecks = 0;
  readonly downloads: Array<{ version: string; feedUrl: string }> = [];
  readonly downloaded: Array<{ version: string; feedUrl: string }> = [];
  readonly installs: Array<{ isSilent: boolean; isForceRunAfter: boolean }> = [];

  private readonly feeds = new Map<string, FakeFeedInfo>();
  private readonly handlers = new Map<string, Array<(value: unknown) => void>>();
  private feed: { url: string; channel: string } | null = null;
  private lastCheck: { info: FakeFeedInfo; feedUrl: string } | null = null;
  private activeDownload: {
    info: FakeFeedInfo;
    feedUrl: string;
    promise: Promise<void>;
    finish(): void;
    fail(error: Error): void;
  } | null = null;
  private failure: Error | null = null;

  constructor(private readonly options: { platform: string; currentVersion: string }) {}

  /** Publishes the YAML electron-builder would have written under a snapshot directory. */
  publishFeed(feedUrl: string, channel: "latest" | "beta", info: FakeFeedInfo): void {
    this.feeds.set(`${feedUrl}${channelFile(this.options.platform, channel)}`, info);
  }

  failChecks(error: Error | null): void {
    this.failure = error;
  }

  get feedUrls(): string[] {
    return this.feedRequests.map((request) => request.url);
  }

  setFeedURL(options: { provider: "generic"; url: string; channel: string }): void {
    this.feedCalls.push(options);
    this.feed = { url: options.url, channel: options.channel };
  }

  async checkForUpdates(): Promise<{ isUpdateAvailable: boolean; updateInfo: unknown } | null> {
    if (!this.feed) {
      this.bakedInFeedChecks += 1;
      throw new Error("check without a configured feed");
    }
    const url = `${this.feed.url}${channelFile(this.options.platform, this.feed.channel)}`;
    this.feedRequests.push({ url });
    if (this.failure) throw this.failure;
    const info = this.feeds.get(url);
    if (!info) {
      throw Object.assign(new Error(`Cannot find channel update info at ${url}`), {
        code: "ERR_UPDATER_CHANNEL_FILE_NOT_FOUND",
      });
    }

    this.lastCheck = { info, feedUrl: this.feed.url };
    if (info.version === this.options.currentVersion) {
      return { isUpdateAvailable: false, updateInfo: info };
    }
    const admitted = await this.isUserWithinRollout(info);
    const newer = isNewer(info.version, this.options.currentVersion);
    const isUpdateAvailable = admitted && (newer || this.allowDowngrade);
    if (isUpdateAvailable) {
      this.emit("update-available", info);
      // electron-updater's auto-download goes through downloadUpdate(), which joins an in-flight one.
      if (this.autoDownload) void this.downloadUpdate().catch(() => undefined);
    }
    return { isUpdateAvailable, updateInfo: info };
  }

  downloadUpdate(): Promise<unknown> {
    if (this.activeDownload) return this.activeDownload.promise;
    if (!this.lastCheck) return Promise.reject(new Error("check for updates first"));
    return this.startDownload(this.lastCheck.info, this.lastCheck.feedUrl);
  }

  quitAndInstall(isSilent: boolean, isForceRunAfter: boolean): void {
    this.installs.push({ isSilent, isForceRunAfter });
  }

  on(event: string, listener: (value: never) => void): this {
    const list = this.handlers.get(event) ?? [];
    list.push(listener as (value: unknown) => void);
    this.handlers.set(event, list);
    return this;
  }

  /** Completes the in-flight download, as the network eventually would. */
  finishDownload(): void {
    this.activeDownload?.finish();
  }

  failDownload(error: Error): void {
    this.activeDownload?.fail(error);
  }

  get hasActiveDownload(): boolean {
    return this.activeDownload !== null;
  }

  private startDownload(info: FakeFeedInfo, feedUrl: string): Promise<void> {
    this.downloads.push({ version: info.version, feedUrl });
    let finish!: () => void;
    let fail!: (error: Error) => void;
    const promise = new Promise<void>((resolve, reject) => {
      finish = () => {
        this.activeDownload = null;
        this.downloaded.push({ version: info.version, feedUrl });
        this.emit("update-downloaded", info);
        resolve();
      };
      fail = (error) => {
        this.activeDownload = null;
        this.emit("error", error);
        reject(error);
      };
    });
    void promise.catch(() => undefined);
    this.activeDownload = { info, feedUrl, promise, finish, fail };
    return promise;
  }

  private emit(event: string, value: unknown): void {
    for (const handler of this.handlers.get(event) ?? []) handler(value);
  }
}
