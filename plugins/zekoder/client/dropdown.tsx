import type { PluginSurfaceProps } from "@getpaseo/plugin/client";
import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { Pressable, ScrollView, Text, View, type ViewStyle } from "react-native";

type Theme = PluginSurfaceProps["theme"];

export interface DropdownOption {
  value: string;
  label: string;
}

interface DropdownProps {
  theme: Theme;
  label: string;
  /** `null` = nothing chosen; the trigger shows `placeholder`. */
  value: string | null;
  options: readonly DropdownOption[];
  placeholder: string;
  width?: number;
  /** Caps the open list and scrolls inside it; defaults to DEFAULT_MAX_LIST_HEIGHT. */
  maxListHeight?: number;
  disabled?: boolean;
  onChange(value: string): void;
}

const DEFAULT_MAX_LIST_HEIGHT = 240;
const OPEN_Z_INDEX = 1000;

/** The slice of the web DOM used to detect a press outside the open list (the plugin lib has no DOM types). */
interface DomNode {
  contains(other: unknown): boolean;
}
interface DomDocument {
  addEventListener(type: "pointerdown", listener: (event: { target: unknown }) => void, capture: boolean): void;
  removeEventListener(type: "pointerdown", listener: (event: { target: unknown }) => void, capture: boolean): void;
}

/**
 * Every View is its own stacking context on web, so an open list is only as high as its lowest ancestor.
 * Wrap each View between a Dropdown and the screen's scroll root in `Raise`; it lifts itself while any
 * Dropdown below it is open.
 */
const RaiseContext = createContext<((open: boolean) => void) | null>(null);

export function Raise({ style, children }: { style?: ViewStyle; children: ReactNode }) {
  const parent = useContext(RaiseContext);
  const [openBelow, setOpenBelow] = useState(0);
  const report = useCallback((open: boolean) => setOpenBelow((count) => count + (open ? 1 : -1)), []);
  const raised = openBelow > 0;

  useEffect(() => {
    if (!raised || !parent) return;
    parent(true);
    return () => parent(false);
  }, [raised, parent]);

  return (
    <RaiseContext.Provider value={report}>
      <View style={[style, { zIndex: raised ? OPEN_Z_INDEX : 0 }]}>{children}</View>
    </RaiseContext.Provider>
  );
}

/** Overlay dropdown: the open list floats over the content below the trigger and never pushes it down. */
export function Dropdown({
  theme,
  label,
  value,
  options,
  placeholder,
  width = 200,
  maxListHeight = DEFAULT_MAX_LIST_HEIGHT,
  disabled,
  onChange,
}: DropdownProps) {
  const [open, setOpen] = useState(false);
  const reportOpen = useContext(RaiseContext);
  useEffect(() => {
    if (!open || !reportOpen) return;
    reportOpen(true);
    return () => reportOpen(false);
  }, [open, reportOpen]);
  const root = useRef<unknown>(null);
  useEffect(() => {
    // Web only: a press anywhere outside the dropdown closes it without choosing anything.
    const doc = (globalThis as { document?: DomDocument }).document;
    if (!open || !doc) return;
    const dismiss = ({ target }: { target: unknown }) => {
      const node = root.current as DomNode | null;
      if (node && !node.contains(target)) setOpen(false);
    };
    doc.addEventListener("pointerdown", dismiss, true);
    return () => doc.removeEventListener("pointerdown", dismiss, true);
  }, [open]);
  const selected = options.find((option) => option.value === value);
  const border = { borderWidth: 1, borderColor: theme.colors.border, borderRadius: 6 };

  return (
    <View ref={root as never} style={{ width, zIndex: open ? OPEN_Z_INDEX : 0 }}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={label}
        accessibilityState={{ expanded: open, disabled }}
        disabled={disabled}
        onPress={() => setOpen((current) => !current)}
        style={{
          flexDirection: "row",
          justifyContent: "space-between",
          gap: 6,
          paddingHorizontal: 8,
          paddingVertical: 5,
          backgroundColor: theme.colors.surface1,
          opacity: disabled ? 0.5 : 1,
          ...border,
        }}
      >
        <Text
          numberOfLines={1}
          style={{ flexShrink: 1, fontSize: 12, color: selected ? theme.colors.foreground : theme.colors.foregroundMuted }}
        >
          {selected?.label ?? placeholder}
        </Text>
        <Text style={{ fontSize: 12, color: theme.colors.foregroundMuted }}>{open ? "▴" : "▾"}</Text>
      </Pressable>
      {open && (
        <ScrollView
          nestedScrollEnabled
          style={{
            position: "absolute",
            top: "100%",
            left: 0,
            right: 0,
            marginTop: 2,
            maxHeight: maxListHeight,
            zIndex: OPEN_Z_INDEX,
            elevation: 8,
            shadowColor: "#000",
            shadowOpacity: 0.25,
            shadowRadius: 8,
            shadowOffset: { width: 0, height: 4 },
            backgroundColor: theme.colors.surface1,
            ...border,
          }}
        >
          {options.map((option) => (
            <Pressable
              key={option.value}
              accessibilityRole="menuitem"
              accessibilityState={{ selected: option.value === value }}
              onPress={() => {
                setOpen(false);
                if (option.value !== value) onChange(option.value);
              }}
              style={{
                paddingHorizontal: 8,
                paddingVertical: 5,
                backgroundColor: option.value === value ? theme.colors.accent : "transparent",
              }}
            >
              <Text
                style={{
                  fontSize: 12,
                  color: option.value === value ? theme.colors.accentForeground : theme.colors.foreground,
                }}
              >
                {option.label}
              </Text>
            </Pressable>
          ))}
        </ScrollView>
      )}
    </View>
  );
}
