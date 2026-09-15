import type { ColorValue, TextProps, TextStyle } from "react-native";
import { StyleSheet, Text } from "react-native";

import { useAppThemeOrSystem } from "@/core/theme/theme-provider";
import { appTypography } from "@/core/theme/tokens";

// Platform text styles (iOS HIG / Material type scale), extended beyond the
// four legacy names kept in `appTypography` (tokens.ts is not touched here).
export const appTextStyles = {
  largeTitle: {
    fontSize: 34,
    fontWeight: "700",
    letterSpacing: -0.4,
    lineHeight: 41,
  },
  title: appTypography.title,
  headline: {
    fontSize: 17,
    fontWeight: "600",
    lineHeight: 22,
  },
  body: appTypography.body,
  subheadline: {
    fontSize: 15,
    fontWeight: "400",
    lineHeight: 20,
  },
  footnote: {
    fontSize: 13,
    fontWeight: "400",
    lineHeight: 18,
  },
  caption: {
    fontSize: 12,
    fontWeight: "400",
    lineHeight: 16,
  },
  label: appTypography.label,
  metadata: appTypography.metadata,
} as const;

type AppTextVariant = keyof typeof appTextStyles;

type AppTextProps = TextProps & {
  color?: ColorValue;
  variant?: AppTextVariant;
  tabular?: boolean;
};

export function AppText({
  color,
  style,
  tabular = false,
  variant = "body",
  ...textProps
}: AppTextProps) {
  const { colors } = useAppThemeOrSystem();
  return (
    <Text
      {...textProps}
      allowFontScaling
      style={[
        styles[variant],
        { color: color ?? colors.text },
        tabular ? tabularStyle : null,
        style,
      ]}
    />
  );
}

const styles = StyleSheet.create(appTextStyles);
const tabularStyle: TextStyle = { fontVariant: ["tabular-nums"] };
