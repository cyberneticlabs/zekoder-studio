import { useMemo } from "react";
import { Image } from "react-native";
import { StyleSheet } from "react-native-unistyles";

interface PaseoLogoProps {
  size?: number;
  color?: string;
}

/* eslint-disable @typescript-eslint/no-require-imports */
// White Zekoder mark; the tint below replaces its color.
const BRAND_MARK = require("../../../assets/images/brand-mark.png");
/* eslint-enable @typescript-eslint/no-require-imports */

export function PaseoLogo({ size = 64, color }: PaseoLogoProps) {
  const sizeStyle = useMemo(() => ({ width: size, height: size }), [size]);
  const colorStyle = useMemo(() => (color ? { tintColor: color } : null), [color]);

  return (
    <Image
      source={BRAND_MARK}
      resizeMode="contain"
      style={[styles.foregroundTint, sizeStyle, colorStyle]}
    />
  );
}

const styles = StyleSheet.create((theme) => ({
  foregroundTint: {
    tintColor: theme.colors.foreground,
  },
}));
