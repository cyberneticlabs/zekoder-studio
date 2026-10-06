import type { PluginSurfaceProps } from "@getpaseo/plugin/client";
import { Icon } from "@getpaseo/plugin/client/react-native";
import { Pressable, Text } from "react-native";

type Theme = PluginSurfaceProps["theme"];

interface ButtonProps {
  theme: Theme;
  icon: string;
  label: string;
  disabled?: boolean;
  primary?: boolean;
  onPress(): void;
}

export function Button({ theme, icon, label, disabled, primary, onPress }: ButtonProps) {
  const color = primary ? theme.colors.accentForeground : theme.colors.foreground;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      style={{
        flexDirection: "row",
        alignItems: "center",
        gap: 6,
        paddingHorizontal: 12,
        paddingVertical: 6,
        borderRadius: 6,
        borderWidth: 1,
        borderColor: primary ? theme.colors.accent : theme.colors.border,
        backgroundColor: primary ? theme.colors.accent : theme.colors.surface1,
        opacity: disabled ? 0.6 : 1,
      }}
    >
      <Icon name={icon} size={14} color={color} />
      <Text style={{ fontSize: 12, color }}>{label}</Text>
    </Pressable>
  );
}
