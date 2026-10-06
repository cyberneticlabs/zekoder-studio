import type { PluginSurfaceProps } from "@getpaseo/plugin/client";
import { Icon } from "@getpaseo/plugin/client/react-native";
import { useMemo, useState } from "react";
import { Pressable, Text, View } from "react-native";

type Theme = PluginSurfaceProps["theme"];

const WEEKDAYS = ["Mo", "Tu", "We", "Th", "Fr", "Sa", "Su"];
const MONTH_NAMES = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const CELL = 36;

/** The trigger that shows a day and opens its `Calendar`. */
export function DateButton(props: { theme: Theme; title: string; day: string; open: boolean; onPress(): void }) {
  const { theme, title, day, open, onPress } = props;
  return (
    <View style={{ gap: 4 }}>
      <Text style={{ fontSize: 12, color: theme.colors.foregroundMuted }}>{title}</Text>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${title}: ${day}`}
        accessibilityState={{ expanded: open }}
        onPress={onPress}
        style={{
          flexDirection: "row",
          alignItems: "center",
          gap: 6,
          paddingHorizontal: 10,
          paddingVertical: 6,
          borderRadius: 6,
          borderWidth: 1,
          borderColor: open ? theme.colors.accent : theme.colors.border,
          backgroundColor: theme.colors.surface0,
        }}
      >
        <Icon name="Calendar" size={14} color={theme.colors.foregroundMuted} />
        <Text style={{ fontSize: 12, color: theme.colors.foreground }}>{day}</Text>
      </Pressable>
    </View>
  );
}

interface CalendarProps {
  theme: Theme;
  /** Pickable days, `YYYY-MM-DD`, ascending. Every other day is disabled. */
  days: readonly string[];
  /** Currently chosen day, `YYYY-MM-DD`. */
  value: string;
  onPick(day: string): void;
}

/** Month grid (Monday first, UTC like the report's days). Expands in normal flow, so no popup is clipped. */
export function Calendar({ theme, days, value, onPick }: CalendarProps) {
  const available = useMemo(() => new Set(days), [days]);
  const first = days[0] ?? value;
  const last = days[days.length - 1] ?? value;
  const [month, setMonth] = useState(() => value.slice(0, 7));
  const [year, mon] = month.split("-").map(Number);

  const shift = (delta: number) => {
    const d = new Date(Date.UTC(year, mon - 1 + delta, 1));
    setMonth(`${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`);
  };
  const cells = useMemo(() => {
    const lead = (new Date(Date.UTC(year, mon - 1, 1)).getUTCDay() + 6) % 7;
    const count = new Date(Date.UTC(year, mon, 0)).getUTCDate();
    return [
      ...Array.from({ length: lead }, () => null),
      ...Array.from({ length: count }, (_, i) => `${month}-${String(i + 1).padStart(2, "0")}`),
    ];
  }, [month, year, mon]);

  const muted = theme.colors.foregroundMuted;
  const canPrev = month > first.slice(0, 7);
  const canNext = month < last.slice(0, 7);
  const arrow = (glyph: string, enabled: boolean, delta: number, label: string) => (
    <Pressable accessibilityRole="button" accessibilityLabel={label} disabled={!enabled} onPress={() => shift(delta)} style={{ padding: 6, opacity: enabled ? 1 : 0.3 }}>
      <Text style={{ fontSize: 16, color: theme.colors.foreground }}>{glyph}</Text>
    </Pressable>
  );

  return (
    <View
      style={{
        alignSelf: "flex-start",
        gap: 4,
        padding: 8,
        borderRadius: 8,
        borderWidth: 1,
        borderColor: theme.colors.border,
        backgroundColor: theme.colors.surface0,
      }}
    >
      <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
        {arrow("‹", canPrev, -1, "Previous month")}
        <Text style={{ fontSize: 13, fontWeight: "600", color: theme.colors.foreground }}>
          {MONTH_NAMES[mon - 1]} {year}
        </Text>
        {arrow("›", canNext, 1, "Next month")}
      </View>
      <View style={{ flexDirection: "row" }}>
        {WEEKDAYS.map((w) => (
          <Text key={w} style={{ width: CELL, textAlign: "center", fontSize: 11, color: muted }}>
            {w}
          </Text>
        ))}
      </View>
      <View style={{ flexDirection: "row", flexWrap: "wrap", width: CELL * 7 }}>
        {cells.map((day, i) => {
          if (!day) return <View key={`blank-${i}`} style={{ width: CELL, height: CELL }} />;
          const enabled = available.has(day);
          const selected = day === value;
          return (
            <Pressable
              key={day}
              accessibilityRole="button"
              accessibilityLabel={day}
              accessibilityState={{ selected, disabled: !enabled }}
              disabled={!enabled}
              onPress={() => onPick(day)}
              style={{
                width: CELL,
                height: CELL,
                alignItems: "center",
                justifyContent: "center",
                borderRadius: 6,
                backgroundColor: selected ? theme.colors.accent : "transparent",
                opacity: enabled ? 1 : 0.3,
              }}
            >
              <Text style={{ fontSize: 12, color: selected ? theme.colors.accentForeground : theme.colors.foreground }}>
                {Number(day.slice(8))}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}
