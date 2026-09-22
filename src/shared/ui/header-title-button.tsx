import { Pressable, StyleSheet, useWindowDimensions } from "react-native";

import { useAppTheme } from "@/core/theme/theme-provider";
import { appSpacing } from "@/core/theme/tokens";
import { AppSymbol } from "@/shared/ui/app-symbol";
import { AppText } from "@/shared/ui/app-text";

/**
 * Header title that opens something (group home: the group info screen).
 * Rendered through `headerTitle` inside the native bar on both platforms, so
 * the bar itself stays platform-drawn; the muted trailing chevron is the only
 * affordance. Native toolbars offer no title placement, hence a plain
 * Pressable rather than `Stack.Toolbar`. On iOS a custom center view is not
 * shrunk to the space left between the bar items, so the width is capped
 * from the window width (back capsule + two trailing items + margins).
 */
const IOS_BAR_ITEMS_WIDTH = 240;
const MIN_TITLE_WIDTH = 96;

export function HeaderTitleButton({
  accessibilityHint,
  onPress,
  title,
}: Readonly<{
  accessibilityHint: string;
  onPress: () => void;
  title: string;
}>) {
  const { colors } = useAppTheme();
  const { width } = useWindowDimensions();
  const cap =
    process.env.EXPO_OS === "ios"
      ? { maxWidth: Math.max(MIN_TITLE_WIDTH, width - IOS_BAR_ITEMS_WIDTH) }
      : null;
  return (
    <Pressable
      accessibilityHint={accessibilityHint}
      accessibilityLabel={title}
      accessibilityRole="button"
      hitSlop={8}
      onPress={onPress}
      style={({ pressed }) => [
        styles.button,
        cap,
        { opacity: pressed ? 0.6 : 1 },
      ]}
    >
      <AppText numberOfLines={1} style={styles.title} variant="headline">
        {title}
      </AppText>
      <AppSymbol name="chevron" size={14} tintColor={colors.textMuted} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    alignItems: "center",
    flexDirection: "row",
    gap: appSpacing.xxs,
    minHeight: 44,
  },
  title: { flexShrink: 1 },
});
