import type { PluginSurfaceProps } from "@getpaseo/plugin/client";
import { Icon } from "@getpaseo/plugin/client/react-native";
import { Pressable, Text, View } from "react-native";
import type { ZekoderIssue } from "../shared/issues.js";

type Theme = PluginSurfaceProps["theme"];

const TYPE_ICONS: Record<string, string> = {
  feature: "Sparkles",
  bug: "Bug",
  followup: "ListChecks",
  "vendor-issues": "Building2",
  decision: "Scale",
  idea: "Lightbulb",
};

interface IssueRowProps {
  issue: ZekoderIssue;
  theme: Theme;
  selected: boolean;
  onPress(): void;
}

export function IssueRow({ issue, theme, selected, onPress }: IssueRowProps) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected }}
      accessibilityLabel={`${issue.type} ${issue.id}: ${issue.title}`}
      onPress={onPress}
      style={{
        paddingHorizontal: 8,
        borderRadius: 6,
        backgroundColor: selected ? theme.colors.surface2 : "transparent",
        flexDirection: "row",
        gap: 10,
        paddingVertical: 10,
        borderBottomWidth: 1,
        borderBottomColor: theme.colors.border,
      }}
    >
      <Icon
        name={TYPE_ICONS[issue.type] ?? "Circle"}
        size={16}
        color={theme.colors.foregroundMuted}
      />
      <View style={{ flex: 1, gap: 2 }}>
        <Text style={{ color: theme.colors.foreground, fontWeight: "500" }}>{issue.title}</Text>
        <Text style={{ fontSize: 12, color: theme.colors.foregroundMuted }}>
          {issue.type} {issue.id}
          {issue.severity ? ` · ${issue.severity}` : ""}
        </Text>
        {issue.snippet ? (
          <Text numberOfLines={2} style={{ fontSize: 12, color: theme.colors.foregroundMuted }}>
            {issue.snippet}
          </Text>
        ) : null}
      </View>
      <Text style={{ fontSize: 12, color: statusColor(issue.status, theme) }}>{issue.status}</Text>
    </Pressable>
  );
}

export function statusColor(status: string, theme: Theme): string {
  if (status === "merged" || status === "accepted") return theme.colors.statusSuccess;
  if (status === "in-progress" || status === "ready" || status === "pr-open") {
    return theme.colors.statusWarning;
  }
  if (status === "rejected") return theme.colors.statusDanger;
  return theme.colors.foregroundMuted;
}
