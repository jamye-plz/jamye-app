import { Pressable, StyleSheet, View, useWindowDimensions } from "react-native";

import { useAppTheme } from "@/core/theme/theme-provider";
import { appSpacing } from "@/core/theme/tokens";
import { AppSymbol } from "@/shared/ui/app-symbol";
import { AppText } from "@/shared/ui/app-text";

/**
 * Header title, optionally interactive (group home / D7 main chatroom: the
 * group info screen; D7 topic chatroom: the topic detail screen). Rendered
 * through `headerTitle` inside the native bar on both platforms, so the bar
 * itself stays platform-drawn; the muted trailing chevron is the only
 * affordance, shown only when `onPress` is given. Native toolbars offer no
 * title placement, hence a plain `Pressable`/`View` rather than
 * `Stack.Toolbar`. On iOS a custom center view is not shrunk to the space
 * left between the bar items, so the width is capped from the window width
 * (back capsule + two trailing items + margins).
 *
 * `onPress` omitted -- e.g. before D7/E4's title resolves, or the chat
 * fixture's plain title -- renders a non-interactive block instead (no
 * button role, no chevron): D7/E4's "해석 전에는... 탭 동작은 비활성화".
 */
const IOS_BAR_ITEMS_WIDTH = 240;
const MIN_TITLE_WIDTH = 96;
// C15: iOS's native nav bar is a fixed 44pt and never grows for Dynamic
// Type (system titles don't scale either), but this custom `headerTitle`
// view can grow past that budget and slide under the message list. Title
// (headline, 22pt line height) already fills the 44pt button row
// (`styles.button` minHeight), so capping at 2x keeps it at exactly
// 22 * 2 = 44pt. Subtitle (body, 26pt line height) caps at 1.2x = 31.2pt,
// at most ~5pt over its 26pt default. Android is unaffected.
const IOS_TITLE_FONT_SCALE_CAP = 2;
const IOS_SUBTITLE_FONT_SCALE_CAP = 1.2;

export function HeaderTitleButton({
  accessibilityHint,
  onPress,
  subtitle,
  title,
}: Readonly<{
  accessibilityHint?: string;
  onPress?: () => void;
  /** Second line beneath the title, e.g. 대화방의 동기화 상태 (muted caption). */
  subtitle?: string;
  title: string;
}>) {
  const { colors } = useAppTheme();
  const { width } = useWindowDimensions();
  const isIos = process.env.EXPO_OS === "ios";
  const cap = isIos
    ? { maxWidth: Math.max(MIN_TITLE_WIDTH, width - IOS_BAR_ITEMS_WIDTH) }
    : null;
  const content = (
    <>
      <AppText
        maxFontSizeMultiplier={isIos ? IOS_TITLE_FONT_SCALE_CAP : undefined}
        numberOfLines={1}
        style={styles.title}
        variant="headline"
      >
        {title}
      </AppText>
      {onPress ? (
        <AppSymbol name="chevron" size={14} tintColor={colors.textMuted} />
      ) : null}
    </>
  );
  const subtitleNode = subtitle ? (
    <AppText
      color={colors.textMuted}
      maxFontSizeMultiplier={isIos ? IOS_SUBTITLE_FONT_SCALE_CAP : undefined}
      numberOfLines={1}
      style={styles.subtitle}
    >
      {subtitle}
    </AppText>
  ) : null;
  if (!onPress) {
    return (
      <View style={styles.column}>
        <View style={[styles.button, cap]}>{content}</View>
        {subtitleNode}
      </View>
    );
  }
  return (
    <View style={styles.column}>
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
        {content}
      </Pressable>
      {subtitleNode}
    </View>
  );
}

const styles = StyleSheet.create({
  button: {
    alignItems: "center",
    alignSelf: "center",
    flexDirection: "row",
    gap: appSpacing.xxs,
    minHeight: 44,
  },
  column: { alignItems: "center" },
  subtitle: { textAlign: "center" },
  title: { flexShrink: 1 },
});
