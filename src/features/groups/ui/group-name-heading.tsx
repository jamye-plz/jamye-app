import { Pressable, StyleSheet } from "react-native";

import { useAppTheme } from "@/core/theme/theme-provider";
import { appSpacing } from "@/core/theme/tokens";
import { AppSymbol } from "@/shared/ui/app-symbol";
import { AppText } from "@/shared/ui/app-text";

/**
 * I2/I3 (M17/U12): the group name in the group info summary header. With
 * `onRename` (the owner -- only the owner may rename) the name is also the
 * rename entry point: the name and a trailing muted pencil form one button,
 * the `HeaderTitleButton` pattern. Without it, plain text and no pencil.
 */
export function GroupNameHeading({
  name,
  onRename,
}: Readonly<{ name: string; onRename?: () => void }>) {
  const { colors } = useAppTheme();
  const text = (
    <AppText style={styles.name} variant="title">
      {name}
    </AppText>
  );
  if (!onRename) return text;
  return (
    <Pressable
      accessibilityHint="그룹 이름을 바꿉니다"
      accessibilityLabel={name}
      accessibilityRole="button"
      hitSlop={8}
      onPress={onRename}
      style={({ pressed }) => [styles.button, { opacity: pressed ? 0.6 : 1 }]}
      testID="group-detail-rename"
    >
      {text}
      <AppSymbol name="edit" size={18} tintColor={colors.textMuted} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    alignItems: "center",
    flexDirection: "row",
    gap: appSpacing.xs,
    maxWidth: "100%",
    minHeight: 44,
  },
  name: { flexShrink: 1, textAlign: "center" },
});
