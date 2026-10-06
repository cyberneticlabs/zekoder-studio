import { Dimensions } from "react-native";
import type { PluginPanelLocation } from "@getpaseo/plugin/client";

/**
 * Windows narrower than this (iPad portrait, split view, phones) are treated as compact. Header
 * buttons and composer pills get no `layout`, so the width is read directly. The cut-off is an
 * approximation of the Paseo host's compact layout, whose breakpoint is not exposed to plugins.
 */
export const COMPACT_MAX_WIDTH = 1024;

/**
 * Where to open a plugin panel from code. The right (explorer) panel is probably not shown on
 * compact layouts, so opening into it does nothing there. The main pane always works.
 */
export function panelOpenLocation(): PluginPanelLocation {
  return Dimensions.get("window").width < COMPACT_MAX_WIDTH ? "workspace" : "explorer";
}
