import { execFile } from "node:child_process";
import { randomBytes } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { app } from "electron";
import { UUID } from "builder-util-runtime";
import log from "electron-log/main";
import { autoUpdater } from "electron-updater";
import {
  createAppUpdateService,
  type AppUpdateCheckResult,
  type AppUpdateInstallRequest,
  type AppUpdateInstallResult,
  type AppUpdateService,
} from "./app-update-service.js";
import { CatalogAppUpdateRuntime, type ElectronUpdaterPort } from "./catalog-app-update-runtime.js";
import {
  createHttpCatalogTransport,
  resolveDesktopFeed,
  type DesktopCatalogTransport,
} from "./desktop-release-catalog.js";
import {
  bucketFromStagingUserId,
  rolloutManifestSchema,
  shouldAdmitAppUpdate,
  type AppReleaseChannel,
  type AppUpdateCheckIntent,
} from "./app-update-rollout.js";

export {
  bucketFromStagingUserId,
  rolloutManifestSchema,
  shouldAdmitAppUpdate,
  type AppReleaseChannel,
  type AppUpdateCheckIntent,
  type AppUpdateCheckResult,
  type AppUpdateInstallResult,
};

let cachedStagingUserIdPromise: Promise<string> | null = null;

interface AppUpdateLogSink {
  info(message: string, details: object): void;
}

interface AppUpdateCheckLogDetails {
  currentVersion: string;
  releaseChannel: AppReleaseChannel;
  intent: AppUpdateCheckIntent;
}

interface AppUpdateCheckCompletedLogDetails extends AppUpdateCheckLogDetails {
  targetVersion: string;
  hasUpdate: boolean;
  readyToInstall: boolean;
  errorMessage: string | null;
}

export function createAppUpdateLifecycleLogger(logger: AppUpdateLogSink) {
  return {
    checkStarted(details: AppUpdateCheckLogDetails): void {
      logger.info("[auto-updater] check started", details);
    },
    checkCompleted(details: AppUpdateCheckCompletedLogDetails): void {
      logger.info("[auto-updater] check completed", details);
    },
    updateAvailable(targetVersion: string): void {
      logger.info("[auto-updater] update available", { targetVersion });
    },
    updateDownloaded(targetVersion: string): void {
      logger.info("[auto-updater] update downloaded", { targetVersion });
    },
    downloadRequested(targetVersion: string): void {
      logger.info("[auto-updater] download requested", { targetVersion });
    },
    quitAndInstallRequested(details: AppUpdateInstallRequest): void {
      logger.info("[auto-updater] quitAndInstall requested", details);
    },
  };
}

const updateLifecycleLog = createAppUpdateLifecycleLogger(log);

export function shouldAdmitToRollout(args: {
  channel: AppReleaseChannel;
  rolloutHours: number | undefined;
  releaseDate: string | undefined;
  now: number;
  bucket: number;
}): boolean {
  return shouldAdmitAppUpdate({ ...args, intent: "automatic" });
}

export async function resolveStagingUserId(filePath: string): Promise<string> {
  try {
    const id = (await readFile(filePath, "utf8")).trim();
    if (UUID.check(id)) {
      return id;
    }
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
      console.warn(`[auto-updater] Couldn't read staging user ID, creating a blank one: ${error}`);
    }
  }

  const id = UUID.v5(randomBytes(4096), UUID.OID);

  try {
    await mkdir(path.dirname(filePath), { recursive: true });
    await writeFile(filePath, id);
  } catch (error) {
    console.warn(`[auto-updater] Couldn't write out staging user ID: ${error}`);
  }

  return id;
}

export function getStagingUserId(): Promise<string> {
  if (cachedStagingUserIdPromise == null) {
    cachedStagingUserIdPromise = resolveStagingUserId(
      path.join(app.getPath("userData"), ".updaterId"),
    );
  }
  return cachedStagingUserIdPromise;
}

export function shouldInstallAppUpdateOnQuit(input: {
  platform: NodeJS.Platform;
  isAppImage: boolean;
}): boolean {
  // AppImage's no-relaunch install path blocks while launching the replacement
  // binary, which can hang after the running file has already been replaced.
  return !(input.platform === "linux" && input.isAppImage);
}

/** Pure classification of `codesign -dv` output (stderr, merged with the error text on failure). */
export function isUnsignedCodesignOutput(output: string): boolean {
  if (/code object is not signed at all/i.test(output)) return true;
  if (/^Signature=adhoc$/m.test(output)) return true;
  // Only trust a missing Team ID when codesign described the bundle; empty or foreign output
  // (codesign missing, bundle unreadable) says nothing about signing.
  if (!/^Identifier=/m.test(output)) return false;
  const teamId = /^TeamIdentifier=(.*)$/m.exec(output)?.[1]?.trim();
  return !teamId || teamId === "not set";
}

/** `/X/Zekoder.app/Contents/MacOS/Zekoder` -> `/X/Zekoder.app`, or null outside an app bundle. */
export function resolveAppBundlePath(execPath: string): string | null {
  return /^(.*?\.app)(?:\/|$)/.exec(execPath)?.[1] ?? null;
}

export async function detectUnsignedMacApp(deps: {
  platform: string;
  execPath: string;
  runCodesign(bundlePath: string): Promise<string>;
}): Promise<boolean> {
  if (deps.platform !== "darwin") return false;
  const bundlePath = resolveAppBundlePath(deps.execPath);
  if (bundlePath === null) return false;
  return isUnsignedCodesignOutput(await deps.runCodesign(bundlePath));
}

// codesign reports on stderr and exits non-zero for an unsigned bundle, so both outcomes are output.
function runCodesignDescribe(bundlePath: string): Promise<string> {
  return new Promise((resolve) => {
    execFile("codesign", ["-dv", bundlePath], { timeout: 10_000 }, (error, stdout, stderr) => {
      resolve(`${stdout}\n${stderr}\n${error ? String(error) : ""}`);
    });
  });
}

export interface BrandedAppUpdateServiceDeps {
  /** Resolved on first use; unpackaged apps never instantiate electron-updater. */
  updater: () => ElectronUpdaterPort;
  transport: DesktopCatalogTransport;
  platform: string;
  arch: string;
  isPackaged(): boolean;
  now(): number;
  bucket(): Promise<number>;
  /** Resolves true for an unsigned or ad-hoc running app; see AppUpdateServiceDeps. */
  isUnsignedInstall?(): Promise<boolean>;
  reportCheckError?(error: unknown): void;
  reportRuntimeError?(error: unknown): void;
  reportInstallError?(message: string): void;
}

/**
 * Update service for the Zekoder fork: every check reads the fork-owned release catalog and
 * pins electron-updater to the selected immutable snapshot, so upstream feeds are never queried.
 */
export function createBrandedAppUpdateService(deps: BrandedAppUpdateServiceDeps): AppUpdateService {
  return createAppUpdateService({
    runtime: new CatalogAppUpdateRuntime({
      updater: deps.updater,
      resolveFeed: (releaseChannel) =>
        resolveDesktopFeed({
          transport: deps.transport,
          releaseChannel,
          platform: deps.platform,
          arch: deps.arch,
        }),
      log: updateLifecycleLog,
    }),
    isPackaged: deps.isPackaged,
    now: deps.now,
    bucket: deps.bucket,
    isUnsignedInstall: deps.isUnsignedInstall,
    reportCheckError: deps.reportCheckError,
    reportRuntimeError: deps.reportRuntimeError,
    reportInstallError: deps.reportInstallError,
  });
}

let appUpdateService: AppUpdateService | null = null;

function getAppUpdateService(): AppUpdateService {
  appUpdateService ??= createBrandedAppUpdateService({
    updater: () => autoUpdater as unknown as ElectronUpdaterPort,
    transport: createHttpCatalogTransport(),
    platform: process.platform,
    arch: process.arch,
    isPackaged: () => app.isPackaged,
    now: () => Date.now(),
    bucket: async () => bucketFromStagingUserId(await getStagingUserId()),
    isUnsignedInstall: () =>
      detectUnsignedMacApp({
        platform: process.platform,
        execPath: process.execPath,
        runCodesign: runCodesignDescribe,
      }),
    reportCheckError: (error) => {
      console.error("[auto-updater] Failed to check for updates:", error);
    },
    reportRuntimeError: (error) => {
      console.error("[auto-updater] Updater event failed:", error);
    },
    reportInstallError: (message) => {
      console.error("[auto-updater] Failed to download/install update:", message);
    },
  });
  return appUpdateService;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export async function checkForAppUpdate({
  currentVersion,
  releaseChannel,
  intent,
}: {
  currentVersion: string;
  releaseChannel: AppReleaseChannel;
  intent: AppUpdateCheckIntent;
}): Promise<AppUpdateCheckResult> {
  updateLifecycleLog.checkStarted({ currentVersion, releaseChannel, intent });
  const result = await getAppUpdateService().checkForAppUpdate({
    currentVersion,
    releaseChannel,
    intent,
  });
  updateLifecycleLog.checkCompleted({
    currentVersion,
    targetVersion: result.latestVersion,
    releaseChannel,
    intent,
    hasUpdate: result.hasUpdate,
    readyToInstall: result.readyToInstall,
    errorMessage: result.errorMessage,
  });
  return result;
}

export async function downloadAndInstallUpdate(
  {
    currentVersion,
    releaseChannel,
  }: {
    currentVersion: string;
    releaseChannel: AppReleaseChannel;
  },
  onBeforeQuit?: () => Promise<void>,
): Promise<AppUpdateInstallResult> {
  return getAppUpdateService().downloadAndInstallUpdate(
    { currentVersion, releaseChannel },
    onBeforeQuit,
  );
}

export async function installAppUpdateOnQuit({
  currentVersion,
  releaseChannel,
  signal,
}: {
  currentVersion: string;
  releaseChannel: AppReleaseChannel;
  signal: AbortSignal;
}): Promise<boolean> {
  if (
    !shouldInstallAppUpdateOnQuit({
      platform: process.platform,
      isAppImage: Boolean(process.env.APPIMAGE),
    })
  ) {
    return false;
  }

  return getAppUpdateService().installUpdateOnQuit({ currentVersion, releaseChannel, signal });
}
