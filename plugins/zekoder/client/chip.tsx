import type { PluginSurfaceProps } from "@getpaseo/plugin/client";
import { Pressable, Text } from "react-native";

interface ChipProps {
  theme: PluginSurfaceProps["theme"];
  label: string;
  selected: boolean;
  onPress(): void;
}

export function Chip({ theme, label, selected, onPress }: ChipProps) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected }}
      accessibilityLabel={label}
      onPress={onPress}
      style={{
        paddingHorizontal: 10,
        paddingVertical: 4,
        borderRadius: 999,
        borderWidth: 1,
        borderColor: selected ? theme.colors.accent : theme.colors.border,
        backgroundColor: selected ? theme.colors.accent : theme.colors.surface1,
      }}
    >
      <Text
        style={{
          fontSize: 12,
          color: selected ? theme.colors.accentForeground : theme.colors.foreground,
        }}
      >
        {label}
      </Text>
    </Pressable>
  );
}
