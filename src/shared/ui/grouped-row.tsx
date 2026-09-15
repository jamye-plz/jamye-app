import { SymbolView } from "expo-symbols";
import type { ReactNode } from "react";
import type { ColorValue } from "react-native";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { useAppThemeOrSystem } from "@/core/theme/theme-provider";
import { appControl, appSpacing } from "@/core/theme/tokens";

type GroupedRowProps = Readonly<{
  accessibilityHint?: string;
  accessibilityLabel?: string;
  busy?: boolean;
  chevron?: boolean;
  destructive?: boolean;
  disabled?: boolean;
  leading?: ReactNode;
  onPress?: () => void;
  selected?: boolean;
  subtitle?: string;
  testID?: string;
  title: string;
  trailing?: ReactNode;
}>;

export function GroupedRow({
  accessibilityHint,
  accessibilityLabel,
  busy,
  chevron,
  destructive,
  disabled,
  leading,
  onPress,
  selected,
  subtitle,
  testID,
  title,
  trailing,
}: GroupedRowProps) {
  const { colors } = useAppThemeOrSystem();
  const isPressable = onPress !== undefined;
  const showChevron =
    process.env.EXPO_OS === "ios" && isPressable && (chevron ?? true);
  const titleColor: ColorValue = destructive
    ? colors.error
    : selected
      ? colors.primary
      : disabled
        ? colors.textMuted
        : colors.text;
  const resolvedAccessibilityLabel =
    accessibilityLabel ?? (subtitle ? `${title}, ${subtitle}` : title);

  const content = (
    <>
      {leading}
      <View style={styles.textColumn}>
        <Text style={[styles.title, { color: titleColor }]}>{title}</Text>
        {subtitle ? (
          <Text style={[styles.subtitle, { color: colors.textMuted }]}>
            {subtitle}
          </Text>
        ) : null}
      </View>
      {trailing}
      {showChevron ? (
        <SymbolView
          name={{ android: "chevron_right", ios: "chevron.right" }}
          size={14}
          testID="grouped-row-chevron"
          tintColor={colors.textTertiary}
        />
      ) : null}
    </>
  );

  if (!isPressable) {
    return (
      <View style={styles.row} testID={testID}>
        {content}
      </View>
    );
  }

  return (
    <Pressable
      accessibilityHint={accessibilityHint}
      accessibilityLabel={resolvedAccessibilityLabel}
      accessibilityRole="button"
      accessibilityState={{ busy, disabled: disabled ?? busy, selected }}
      disabled={disabled ?? busy}
      onPress={onPress}
      style={({ pressed }) => [
        styles.row,
        pressed ? { backgroundColor: colors.fill } : null,
      ]}
      testID={testID}
    >
      {content}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    alignItems: "center",
    flexDirection: "row",
    gap: appSpacing.sm,
    minHeight: appControl.standardHeight,
    paddingHorizontal: appSpacing.md,
    paddingVertical: appSpacing.sm,
  },
  subtitle: {
    fontSize: 13,
    lineHeight: 18,
  },
  textColumn: {
    flex: 1,
  },
  title: {
    fontSize: 16,
    lineHeight: 22,
  },
});
