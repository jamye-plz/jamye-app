import { Pressable, Text } from "react-native";
import { useAppTheme } from "@/core/theme/theme-provider";
import { appControl, appSpacing } from "@/core/theme/tokens";

export function ChatButton({
  label,
  onPress,
  disabled = false,
}: Readonly<{ label: string; onPress: () => void; disabled?: boolean }>) {
  const { colors } = useAppTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      style={{
        minHeight: appControl.standardHeight,
        padding: appSpacing.sm,
        justifyContent: "center",
      }}
    >
      <Text style={{ color: disabled ? colors.textMuted : colors.primary }}>
        {label}
      </Text>
    </Pressable>
  );
}

export function ChatNotice({
  message,
  error = false,
}: Readonly<{ message: string; error?: boolean }>) {
  const { colors } = useAppTheme();
  return (
    <Text
      accessibilityRole={error ? "alert" : undefined}
      accessibilityLiveRegion={error ? "assertive" : "polite"}
      style={{
        color: error ? colors.error : colors.textMuted,
        padding: appSpacing.sm,
      }}
    >
      {message}
    </Text>
  );
}
