import { Platform } from "react-native";
import { getIsElectronRuntime, getIsElectronRuntimeMac } from "@/constants/layout";
import type { ShortcutOs } from "@/utils/format-shortcut";
import { isNative } from "@/constants/platform";
import { isMacUserAgent } from "@/utils/mac-user-agent";

export function getShortcutOs(): ShortcutOs {
  if (isNative) {
    return Platform.OS === "ios" ? "mac" : "non-mac";
  }
  if (getIsElectronRuntimeMac()) return "mac";
  // Electron reports its own platform; the browser user agent must not override a non-mac answer.
  if (getIsElectronRuntime()) return "non-mac";
  return isMacUserAgent() ? "mac" : "non-mac";
}
