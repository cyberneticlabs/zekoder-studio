/**
 * Fork-owned: lets the app install the `zekoder` plugin on a host whose daemon does not ship it
 * built in (stock upstream daemons). The pin below is test-locked to `plugins/zekoder.lock.json`.
 */
export const ZEKODER_PLUGIN_ID = "zekoder";
/** The one place to change the npm package name. */
export const ZEKODER_NPM_PACKAGE = "@cyberneticlabs/paseo-zekoder";
/** Keep equal to `version` in `plugins/zekoder.lock.json`. Publish the npm package before bumping. */
export const ZEKODER_PLUGIN_VERSION = "0.11.1";
export const ZEKODER_PLUGIN_SOURCE = `npm:${ZEKODER_NPM_PACKAGE}@${ZEKODER_PLUGIN_VERSION}`;

/** Mirrors the sidebar items in `plugins/zekoder/index.client.tsx`. */
export const ZEKODER_PLACEHOLDER_ITEMS = [
  { id: "issues", title: "Issues", icon: "ListTodo" },
  { id: "reports", title: "Reports", icon: "Activity" },
  { id: "zekoder", title: "Zekoder", icon: "Settings" },
] as const;

export type HostZekoderStatus =
  | "unknown"
  | "present"
  | "unsupported"
  | "install"
  | "enable-plugin"
  | "enable-plugins"
  | "failed";

export interface HostZekoderStatusInput {
  connected: boolean;
  /** The host reports the `plugins` feature. */
  pluginsSupported: boolean;
  sourceInstallSupported: boolean;
  /** Plugin ids in the daemon catalog, or null while loading. */
  catalogPluginIds: readonly string[] | null;
  /** `listPlugins()` items, or null while loading. */
  installed: readonly { id: string; enabled: boolean; status: string; error?: string }[] | null;
  /** The daemon's `pluginsEnabled`, or null while the config is loading. */
  pluginsEnabled: boolean | null;
}

export function resolveHostZekoderStatus(input: HostZekoderStatusInput): HostZekoderStatus {
  if (!input.connected || !input.pluginsSupported) return "unknown";
  if (input.catalogPluginIds === null || input.installed === null) return "unknown";
  if (input.catalogPluginIds.includes(ZEKODER_PLUGIN_ID)) return "present";
  if (!input.sourceInstallSupported) return "unsupported";
  const item = input.installed.find((plugin) => plugin.id === ZEKODER_PLUGIN_ID);
  if (!item) return "install";
  if (item.status === "failed") return item.error ? "failed" : "unknown";
  if (!item.enabled) return "enable-plugin";
  if (input.pluginsEnabled === null) return "unknown";
  return input.pluginsEnabled ? "unknown" : "enable-plugins";
}

/** The host Zekoder surfaces follow: the route's host, else the active workspace's host. */
export function resolveZekoderActiveHost(
  routeHostId: string | null,
  workspaceHostId: string | null,
): string | null {
  return routeHostId ?? workspaceHostId ?? null;
}

export function shouldShowZekoderPlaceholders(
  hasZekoderGroup: boolean,
  status: HostZekoderStatus,
): boolean {
  return !hasZekoderGroup && status !== "present" && status !== "unknown";
}

export function isProvisionableStatus(
  status: HostZekoderStatus,
): status is "install" | "enable-plugin" | "enable-plugins" {
  return status === "install" || status === "enable-plugin" || status === "enable-plugins";
}
