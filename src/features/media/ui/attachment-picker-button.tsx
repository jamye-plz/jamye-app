import { Pressable, Text, View } from "react-native";

import { useAppTheme } from "@/core/theme/theme-provider";
import { appChatComposer, appSpacing } from "@/core/theme/tokens";

function AttachButton({
  label,
  disabled,
  onPress,
}: Readonly<{ label: string; disabled: boolean; onPress: () => void }>) {
  const { colors } = useAppTheme();
  return (
    <Pressable
      accessibilityLabel={label}
      accessibilityRole="button"
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => ({
        alignItems: "center",
        backgroundColor: colors.surfaceMuted,
        borderRadius: appChatComposer.borderRadius,
        height: appChatComposer.controlSize,
        justifyContent: "center",
        minWidth: appChatComposer.controlSize,
        opacity: disabled ? 0.5 : pressed ? 0.72 : 1,
        paddingHorizontal: appSpacing.sm,
      })}
    >
      <Text style={{ color: colors.text }}>{label}</Text>
    </Pressable>
  );
}

export function AttachmentPickerButtons({
  canAddImageOrVideo,
  canAddAudio,
  busy,
  onAddImageOrVideo,
  onAddAudio,
}: Readonly<{
  canAddImageOrVideo: boolean;
  canAddAudio: boolean;
  busy: boolean;
  onAddImageOrVideo: () => void;
  onAddAudio: () => void;
}>) {
  const { colors } = useAppTheme();
  return (
    <View style={{ gap: appSpacing.xxs }}>
      {busy ? (
        <Text
          accessibilityLiveRegion="polite"
          style={{ color: colors.textMuted }}
        >
          파일 선택·변환 중…
        </Text>
      ) : null}
      <View style={{ flexDirection: "row", gap: appSpacing.xs }}>
        <AttachButton
          label="사진·동영상 첨부"
          disabled={busy || !canAddImageOrVideo}
          onPress={onAddImageOrVideo}
        />
        <AttachButton
          label="음성 파일 첨부"
          disabled={busy || !canAddAudio}
          onPress={onAddAudio}
        />
      </View>
    </View>
  );
}
