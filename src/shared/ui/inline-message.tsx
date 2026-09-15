import { SymbolView } from "expo-symbols";
import type { ReactNode } from "react";
import { StyleSheet, Text, View } from "react-native";

import { useAppThemeOrSystem } from "@/core/theme/theme-provider";
import { appRadii, appSpacing } from "@/core/theme/tokens";

type InlineMessageProps = Readonly<{
  children?: ReactNode;
  kind?: "error" | "notice";
  message: string;
  testID?: string;
}>;

export function InlineMessage({
  children,
  kind = "notice",
  message,
  testID,
}: InlineMessageProps) {
  const { colors } = useAppThemeOrSystem();
  const isError = kind === "error";

  return (
    <View
      accessible={isError ? true : undefined}
      accessibilityLiveRegion={isError ? "assertive" : "polite"}
      accessibilityRole={isError ? "alert" : undefined}
      style={[
        styles.row,
        {
          backgroundColor: isError ? colors.surfaceMuted : colors.noticeSurface,
          borderCurve: "continuous",
          borderRadius: appRadii.medium,
        },
      ]}
      testID={testID}
    >
      <SymbolView
        name={
          isError
            ? { android: "error", ios: "exclamationmark.triangle" }
            : { android: "info", ios: "info.circle" }
        }
        size={18}
        tintColor={isError ? colors.error : colors.textMuted}
      />
      <View style={styles.body}>
        <Text
          selectable
          style={[
            styles.message,
            { color: isError ? colors.error : colors.text },
          ]}
        >
          {message}
        </Text>
        {children}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  body: {
    flex: 1,
    gap: appSpacing.xs,
  },
  message: {
    fontSize: 15,
    lineHeight: 20,
  },
  row: {
    flexDirection: "row",
    gap: appSpacing.xs,
    padding: appSpacing.sm,
  },
});
