import type { ColorValue } from "react-native";
import { Pressable, StyleSheet } from "react-native";

import { useAppThemeOrSystem } from "@/core/theme/theme-provider";
import { appChatComposer } from "@/core/theme/tokens";
import type { AppSymbolName } from "@/shared/ui/app-symbol";
import { AppSymbol } from "@/shared/ui/app-symbol";

export function HeaderIconButton({
  symbol,
  accessibilityLabel,
  onPress,
  disabled = false,
  tintColor,
  testID,
}: Readonly<{
  symbol: AppSymbolName;
  accessibilityLabel: string;
  onPress: () => void;
  disabled?: boolean;
  tintColor?: ColorValue;
  testID?: string;
}>) {
  const { colors } = useAppThemeOrSystem();
  return (
    <Pressable
      accessibilityLabel={accessibilityLabel}
      accessibilityRole="button"
      accessibilityState={{ disabled }}
      disabled={disabled}
      hitSlop={8}
      onPress={onPress}
      style={({ pressed }) => [
        styles.button,
        { opacity: disabled ? 0.4 : pressed ? 0.5 : 1 },
      ]}
      testID={testID}
    >
      <AppSymbol
        name={symbol}
        size={22}
        tintColor={tintColor ?? colors.primary}
      />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    alignItems: "center",
    borderCurve: "continuous",
    justifyContent: "center",
    minHeight: appChatComposer.controlSize,
    minWidth: appChatComposer.controlSize,
  },
});
