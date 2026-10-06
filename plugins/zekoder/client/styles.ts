import type { PluginSurfaceProps } from "@getpaseo/plugin/client";

/** The plugin's text-input look; spread it first, then override size/padding per field. */
export function inputStyle(theme: PluginSurfaceProps["theme"]) {
  return {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.surface1,
    color: theme.colors.foreground,
  };
}
