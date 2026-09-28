import { Pressable, View } from "react-native";

import { useAppTheme } from "@/core/theme/theme-provider";
import { appRadii, appSpacing } from "@/core/theme/tokens";
import { AppSymbol } from "@/shared/ui/app-symbol";
import { AppText } from "@/shared/ui/app-text";

/**
 * R4 "새 메시지" pill: floats above the composer when the user is reading
 * further up and a message has just arrived (`ChatMessageList` shows/hides
 * it -- never a forced scroll, per E11). Neutral surface color (not the
 * Berry primary): this is a utility affordance, not a primary action
 * (`docs/adr/0011` -- Berry reserved for selective/primary actions).
 */
export function ChatNewMessagePill({
  onPress,
}: Readonly<{ onPress: () => void }>) {
  const { colors } = useAppTheme();
  return (
    <View
      pointerEvents="box-none"
      style={{
        alignItems: "center",
        bottom: appSpacing.sm,
        left: 0,
        position: "absolute",
        right: 0,
      }}
    >
      <Pressable
        accessibilityLabel="새 메시지, 눌러서 맨 아래로 이동"
        accessibilityRole="button"
        onPress={onPress}
        style={{
          alignItems: "center",
          backgroundColor: colors.surface,
          borderColor: colors.border,
          borderRadius: appRadii.full,
          borderWidth: 1,
          flexDirection: "row",
          gap: appSpacing.xxs,
          minHeight: 44,
          paddingHorizontal: appSpacing.md,
          paddingVertical: appSpacing.xs,
          shadowColor: "#000",
          shadowOffset: { height: 2, width: 0 },
          shadowOpacity: 0.15,
          shadowRadius: 6,
        }}
      >
        <AppSymbol name="scrollDown" size={16} tintColor={colors.text} />
        <AppText color={colors.text} variant="caption">
          새 메시지
        </AppText>
      </Pressable>
    </View>
  );
}
