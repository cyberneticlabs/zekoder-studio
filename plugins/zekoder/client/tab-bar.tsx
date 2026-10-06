import type { PluginSurfaceProps } from "@getpaseo/plugin/client";
import { Pressable, Text, View } from "react-native";

export interface Tab<Id extends string> {
  id: Id;
  label: string;
  /** Shows a warning dot next to the label, e.g. "update available". */
  dot?: string;
}

interface TabBarProps<Id extends string> {
  theme: PluginSurfaceProps["theme"];
  compact: boolean;
  /** No horizontal padding, for a bar nested inside an already padded container. */
  flush?: boolean;
  tabs: readonly Tab<Id>[];
  selected: Id;
  onSelect(id: Id): void;
}

export function TabBar<Id extends string>({ theme, compact, flush, tabs, selected, onSelect }: TabBarProps<Id>) {
  return (
    <View
      style={{
        flexDirection: "row",
        gap: 16,
        paddingHorizontal: flush ? 0 : compact ? 16 : 24,
        borderBottomWidth: 1,
        borderBottomColor: theme.colors.border,
      }}
    >
      {tabs.map(({ id, label, dot }) => {
        const active = selected === id;
        return (
          <Pressable
            key={id}
            accessibilityRole="tab"
            accessibilityState={{ selected: active }}
            accessibilityLabel={label}
            onPress={() => onSelect(id)}
            style={{
              flexDirection: "row",
              alignItems: "center",
              gap: 6,
              paddingVertical: 10,
              borderBottomWidth: 2,
              borderBottomColor: active ? theme.colors.accent : "transparent",
            }}
          >
            <Text
              style={{
                fontSize: 14,
                fontWeight: active ? "600" : "400",
                color: active ? theme.colors.foreground : theme.colors.foregroundMuted,
              }}
            >
              {label}
            </Text>
            {dot && (
              <View
                accessibilityLabel={dot}
                style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: theme.colors.statusWarning }}
              />
            )}
          </Pressable>
        );
      })}
    </View>
  );
}
