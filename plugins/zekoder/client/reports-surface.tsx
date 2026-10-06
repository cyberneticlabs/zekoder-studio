import type { PluginSurfaceProps } from "@getpaseo/plugin/client";
import { View } from "react-native";
import { CodingHealthPage } from "./coding-health-tab.js";

export function ReportsSurface(props: PluginSurfaceProps) {
  return (
    <View style={{ flex: 1, backgroundColor: props.theme.colors.surface0 }}>
      <CodingHealthPage {...props} />
    </View>
  );
}
