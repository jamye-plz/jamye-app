import type { AndroidSymbol, SFSymbol } from "expo-symbols";
import { SymbolView } from "expo-symbols";
import type { ReactNode } from "react";
import { StyleSheet, Text, View } from "react-native";

import { useAppThemeOrSystem } from "@/core/theme/theme-provider";
import { appSpacing } from "@/core/theme/tokens";

type EmptyStateProps = Readonly<{
  children?: ReactNode;
  description?: string;
  symbol?: { android: AndroidSymbol; ios: SFSymbol };
  testID?: string;
  title: string;
}>;

export function EmptyState({
  children,
  description,
  symbol,
  testID,
  title,
}: EmptyStateProps) {
  const { colors } = useAppThemeOrSystem();

  return (
    <View
      accessibilityLiveRegion="polite"
      style={styles.container}
      testID={testID}
    >
      {symbol ? (
        <SymbolView name={symbol} size={44} tintColor={colors.textTertiary} />
      ) : null}
      <Text
        accessibilityRole="header"
        style={[styles.title, { color: colors.text }]}
      >
        {title}
      </Text>
      {description ? (
        <Text style={[styles.description, { color: colors.textMuted }]}>
          {description}
        </Text>
      ) : null}
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: "center",
    gap: appSpacing.xs,
    paddingVertical: appSpacing.xxl,
  },
  description: {
    fontSize: 15,
    lineHeight: 20,
    textAlign: "center",
  },
  title: {
    fontSize: 17,
    fontWeight: "600",
    lineHeight: 22,
  },
});
