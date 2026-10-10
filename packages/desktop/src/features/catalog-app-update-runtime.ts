import type { AppReleaseChannel } from "./app-update-rollout.js";
import type {
  AppUpdateInstallRequest,
  AppUpdateRuntime,
  AppUpdateRuntimeConfiguration,
  RuntimeUpdateCheckResult,
  RuntimeUpdateInfo,
} from "./app-update-service.js";
import type { DesktopFeedSelection } from "./desktop-release-catalog.js";

const UPDATE_CHANNEL_NOT_PUBLISHED_CODE = "ERR_UPDATER_CHANNEL_FILE_NOT_FOUND";

function isUpdateChannelNotPublished(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    error.code === UPDATE_CHANNEL_NOT_PUBLISHED_CODE
  );
}

interface UpdaterLogger {
  debug?: ((message: string) => void) | null;
  info(message?: unknown): void;
  warn(message?: unknown): void;
  error(message?: unknown): void;
}

/** The slice of electron-updater's AppUpdater this runtime drives; tests implement it in memory. */
export interface ElectronUpdaterPort {
  autoDownload: boolean;
  autoRunAppAfterInstall: boolean;
  autoInstallOnAppQuit: boolean;
  allowPrerelease: boolean;
  allowDowngrade: boolean;
  isUserWithinRollout: (info: RuntimeUpdateInfo) => boolean | Promise<boolean>;
  logger: UpdaterLogger | null;
  setFeedURL(options: { provider: "generic"; url: string; channel: string }): void;
  checkForUpdates(): Promise<{ isUpdateAvailable: boolean; updateInfo: unknown } | null>;
  downloadUpdate(): Promise<unknown>;
  quitAndInstall(isSilent: boolean, isForceRunAfter: boolean): void;
  on(event: "update-available" | "update-downloaded", listener: (info: unknown) => void): unknown;
  on(event: "error", listener: (error: unknown) => void): unknown;
}

export interface UpdateLifecycleLog {
  updateAvailable(targetVersion: string): void;
  updateDownloaded(targetVersion: string): void;
  downloadRequested(targetVersion: string): void;
  quitAndInstallRequested(details: AppUpdateInstallRequest): void;
}

export interface CatalogAppUpdateRuntimeDeps {
  /** Resolved on first use so unpackaged apps never instantiate electron-updater. */
  updater: () => ElectronUpdaterPort;
  /**
   * Resolves the immutable feed for a channel from the fork catalog. Returns null when nothing is
   * published for this machine; throws for invalid catalogs and network failures.
   */
  resolveFeed(releaseChannel: AppReleaseChannel): Promise<DesktopFeedSelection | null>;
  log: UpdateLifecycleLog;
}

/**
 * Drives electron-updater against fork-owned immutable snapshots. Every check re-reads the
 * catalog and re-points the updater with setFeedURL, so electron-updater never falls back to the
 * feed baked into the app (upstream). Downloads reuse the feed selected by the last check.
 */
export class CatalogAppUpdateRuntime implements AppUpdateRuntime {
  private configured = false;
  private releaseChannel: AppReleaseChannel = "stable";
  private pinned: DesktopFeedSelection | null = null;
  private mismatchedVersion: string | null = null;

  constructor(private readonly deps: CatalogAppUpdateRuntimeDeps) {}

  configure(input: AppUpdateRuntimeConfiguration): void {
    const { log } = this.deps;
    const updater = this.deps.updater();
    this.releaseChannel = input.releaseChannel;
    updater.autoDownload = true;
    updater.autoRunAppAfterInstall = true;
    // Paseo revalidates the current catalog before explicitly installing on quit.
    // Electron's built-in handler would install an older download without checking
    // whether a newer release has superseded it.
    updater.autoInstallOnAppQuit = false;
    updater.allowPrerelease = input.releaseChannel === "beta";
    // The channel travels in setFeedURL: assigning updater.channel would flip allowDowngrade on.
    updater.allowDowngrade = false;
    updater.isUserWithinRollout = async (info) => {
      // Runs before electron-updater announces or auto-downloads an update, so a feed whose
      // YAML disagrees with the catalog never reaches the download step.
      if (this.pinned === null || info.version !== this.pinned.version) {
        this.mismatchedVersion = info.version;
        return false;
      }
      try {
        return await input.shouldAdmitUpdate(info);
      } catch {
        return true;
      }
    };

    if (this.configured) return;
    this.configured = true;

    // electron-updater logs every emitted error before consumers can classify it.
    // Paseo reports genuine check, runtime, and install failures through the
    // callbacks below, so leave internal error logging disabled to avoid both
    // duplicate logs and expected missing-channel noise.
    const updaterLogger = updater.logger;
    updater.logger = {
      debug: updaterLogger?.debug ? (message) => updaterLogger.debug?.(message) : undefined,
      error: () => undefined,
      info: (message) => updaterLogger?.info(message),
      warn: (message) => updaterLogger?.warn(message),
    };

    updater.on("update-available", (info) => {
      const updateInfo = info as RuntimeUpdateInfo;
      log.updateAvailable(updateInfo.version);
      input.onUpdateAvailable(updateInfo);
    });
    updater.on("update-downloaded", (info) => {
      const updateInfo = info as RuntimeUpdateInfo;
      log.updateDownloaded(updateInfo.version);
      input.onUpdateDownloaded(updateInfo);
    });
    updater.on("error", (error) => {
      if (isUpdateChannelNotPublished(error)) return;
      input.onError(error);
    });
  }

  async checkForUpdates(): Promise<RuntimeUpdateCheckResult | null> {
    this.pinned = null;
    this.mismatchedVersion = null;

    const selection = await this.deps.resolveFeed(this.releaseChannel);
    if (selection === null) return null;

    const updater = this.deps.updater();
    updater.setFeedURL({
      provider: "generic",
      url: selection.feedUrl,
      channel: selection.updaterChannel,
    });
    this.pinned = selection;

    try {
      const result = await updater.checkForUpdates();
      if (!result) return null;
      const updateInfo = result.updateInfo as RuntimeUpdateInfo;
      if (this.mismatchedVersion !== null || updateInfo.version !== selection.version) {
        throw new Error(
          `Update feed version ${this.mismatchedVersion ?? updateInfo.version} does not match release catalog version ${selection.version}.`,
        );
      }
      return { isUpdateAvailable: result.isUpdateAvailable, updateInfo };
    } catch (error) {
      if (isUpdateChannelNotPublished(error)) return null;
      throw error;
    }
  }

  downloadUpdate(targetVersion: string): Promise<unknown> {
    this.deps.log.downloadRequested(targetVersion);
    return this.deps.updater().downloadUpdate();
  }

  quitAndInstall({ targetVersion, isSilent, isForceRunAfter }: AppUpdateInstallRequest): void {
    const { log } = this.deps;
    const updater = this.deps.updater();
    updater.autoRunAppAfterInstall = isForceRunAfter;
    log.quitAndInstallRequested({ targetVersion, isSilent, isForceRunAfter });
    updater.quitAndInstall(isSilent, isForceRunAfter);
  }
}
