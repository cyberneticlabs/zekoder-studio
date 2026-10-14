import { readFileSync } from "node:fs";
import path from "node:path";
import type { Logger } from "pino";
import semver from "semver";
import type { BuiltinPluginUpdateStatus } from "@getpaseo/protocol/messages";
import type { BuiltinPluginLoader } from "../index.js";
import type { BuiltinPluginUpdateStatusProvider } from "../../index.js";
import { BuiltinPluginUpdater } from "./index.js";
import { MANIFEST_URL, TRUSTED_KEYS } from "./trusted-keys.js";

export const UPDATED_BUILTIN_PLUGIN_ID = "zekoder";
export const PLUGIN_UPDATES_ENV = "ZEKODER_PLUGIN_UPDATES";
const PACKAGED_ROOT_NAME = "builtin-plugins";
const LOCK_FILE = "zekoder.lock.json";

/** The pinned version recorded in `<root>/zekoder.lock.json`, or null when absent or invalid. */
function readLockVersion(root: string): string | null {
  try {
    const parsed: unknown = JSON.parse(readFileSync(path.join(root, LOCK_FILE), "utf8"));
    const version = (parsed as { version?: unknown } | null)?.version;
    return typeof version === "string" && semver.valid(version) ? version : null;
  } catch {
    return null;
  }
}

export interface BuiltinUpdateWiring {
  updater: BuiltinPluginUpdater | null;
  status: BuiltinPluginUpdateStatusProvider;
}

/**
 * Builds the updater for desktop-launched daemons that run from a packaged or built
 * `builtin-plugins` root, and the status provider the status RPC reads. Everything else gets a
 * provider that reports updates as disabled.
 */
export function createBuiltinUpdateWiring(input: {
  loader: BuiltinPluginLoader;
  desktopManaged: boolean;
  env: Record<string, string | undefined>;
  paseoHome: string;
  daemonVersion: string;
  logger: Logger;
  injectedStatus?: BuiltinPluginUpdateStatusProvider;
}): BuiltinUpdateWiring {
  const { loader } = input;
  const lockVersion = loader.ids.has(UPDATED_BUILTIN_PLUGIN_ID)
    ? readLockVersion(loader.root)
    : null;
  const eligible =
    input.desktopManaged &&
    input.env[PLUGIN_UPDATES_ENV] !== "off" &&
    path.basename(loader.root) === PACKAGED_ROOT_NAME &&
    lockVersion !== null;
  const updater = eligible
    ? new BuiltinPluginUpdater({
        pluginId: UPDATED_BUILTIN_PLUGIN_ID,
        paseoHome: input.paseoHome,
        bundledVersion: lockVersion,
        daemonVersion: input.daemonVersion,
        manifestUrl: MANIFEST_URL,
        trustedKeys: TRUSTED_KEYS,
        logger: input.logger,
      })
    : null;
  if (input.injectedStatus) return { updater, status: input.injectedStatus };
  return {
    updater,
    status: {
      list(pluginId) {
        const statuses = updater ? [updater.getStatus()] : disabledStatuses(lockVersion);
        return pluginId === undefined
          ? statuses
          : statuses.filter((status) => status.pluginId === pluginId);
      },
    },
  };
}

function disabledStatuses(lockVersion: string | null): BuiltinPluginUpdateStatus[] {
  if (lockVersion === null) return [];
  return [
    {
      pluginId: UPDATED_BUILTIN_PLUGIN_ID,
      runningVersion: lockVersion,
      source: "bundled",
      bundledVersion: lockVersion,
      enabled: false,
    },
  ];
}
