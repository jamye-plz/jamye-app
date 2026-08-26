import type { TextProps } from "react-native";
import { StyleSheet, Text } from "react-native";

import { appTypography } from "@/core/theme/tokens";

type AppTextVariant = keyof typeof appTypography;

type AppTextProps = TextProps & {
  color: string;
  variant?: AppTextVariant;
};

export function AppText({
  color,
  style,
  variant = "body",
  ...textProps
}: AppTextProps) {
  return (
    <Text
      {...textProps}
      allowFontScaling
      style={[styles[variant], { color }, style]}
    />
  );
}

const styles = StyleSheet.create(appTypography);
