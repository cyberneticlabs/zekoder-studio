import type { AppReleaseChannel } from "../features/auto-updater.js";
import type { DesktopSettings, DesktopSettingsStore } from "./desktop-settings.js";

export type DesktopCommandHandler = (args?: Record<string, unknown>) => unknown;

export function createDesktopSettingsCommandHandlers({
  settingsStore,
  onReleaseChannelChanged,
}: {
  settingsStore: DesktopSettingsStore;
  /** Called with the stored channel after any command that may have changed it. */
  onReleaseChannelChanged?: (channel: AppReleaseChannel) => Promise<void>;
}): Record<string, DesktopCommandHandler> {
  const notifyChannel = async (settings: DesktopSettings): Promise<DesktopSettings> => {
    await onReleaseChannelChanged?.(settings.releaseChannel);
    return settings;
  };
  return {
    get_desktop_settings: () => settingsStore.get(),
    patch_desktop_settings: async (args) => {
      const settings = await settingsStore.patch(args);
      return args?.releaseChannel === undefined ? settings : notifyChannel(settings);
    },
    migrate_legacy_desktop_settings: async (args) =>
      notifyChannel(await settingsStore.migrateLegacyRendererSettings(args)),
  };
}
