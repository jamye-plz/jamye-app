import { View } from "react-native";

import { useAppTheme } from "@/core/theme/theme-provider";
import { appSpacing } from "@/core/theme/tokens";
import { AppText } from "@/shared/ui/app-text";

/**
 * R1/E7: centered date divider rendered above the first message of a new
 * local calendar date, e.g. "9월 27일 토요일"
 * (`formatJamyeTimeLabel(..., {mode:"chatDate"})`).
 */
export function ChatDateSeparator({ label }: Readonly<{ label: string }>) {
  const { colors } = useAppTheme();
  return (
    <View
      accessibilityElementsHidden={false}
      importantForAccessibility="yes"
      style={{
        alignItems: "center",
        marginBottom: appSpacing.xs,
        marginTop: appSpacing.md,
      }}
    >
      <AppText color={colors.textMuted} variant="caption">
        {label}
      </AppText>
    </View>
  );
}
