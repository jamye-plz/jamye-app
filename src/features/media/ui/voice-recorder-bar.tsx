import { Pressable, View } from "react-native";

import { useAppTheme } from "@/core/theme/theme-provider";
import { appChatComposer, appRadii, appSpacing } from "@/core/theme/tokens";
import { AppSymbol } from "@/shared/ui/app-symbol";
import { AppText } from "@/shared/ui/app-text";

/** `0:12`, `3:00` -- tabular, no leading zero on minutes (V1). */
export function formatVoiceClockMs(ms: number): string {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

/** Normalizes expo-audio's dBFS metering (~ -160 silent .. 0 loud) to 0..1. */
function normalizeMetering(dB: number): number {
  const FLOOR_DB = -50;
  if (!Number.isFinite(dB)) return 0;
  return Math.min(1, Math.max(0, (dB - FLOOR_DB) / -FLOOR_DB));
}

/**
 * A single level bar reflecting the current metering reading. Deliberately
 * does not use `react-native-reanimated`/worklets -- every recorder-state
 * tick already re-renders this tree (driven by `useAudioRecorderState`'s
 * 100ms interval), so the bar height simply tracks the latest value on each
 * render. There is nothing to ease between renders, so this is "static" by
 * construction and needs no separate `prefers-reduced-motion` branch.
 */
function LevelBar({ metering }: Readonly<{ metering: number }>) {
  const level = normalizeMetering(metering);
  return (
    <View
      accessibilityElementsHidden
      importantForAccessibility="no"
      style={{
        alignItems: "flex-end",
        height: 20,
        justifyContent: "center",
        width: 24,
      }}
      testID="voice-level-bar"
    >
      <View
        style={{
          backgroundColor: "#E53935",
          borderRadius: appRadii.small,
          height: Math.round(20 * (0.15 + level * 0.85)),
          width: 6,
        }}
      />
    </View>
  );
}

export function VoiceRecordingBar({
  elapsedMs,
  metering,
  onDelete,
  onStop,
}: Readonly<{
  elapsedMs: number;
  metering: number;
  onDelete: () => void;
  onStop: () => void;
}>) {
  const { colors } = useAppTheme();
  return (
    <View
      style={{
        alignItems: "center",
        backgroundColor: colors.surface,
        borderCurve: "continuous",
        borderRadius: appRadii.full,
        flexDirection: "row",
        gap: appSpacing.xs,
        minHeight: appChatComposer.minHeight,
        paddingHorizontal: appSpacing.sm,
        paddingVertical: 8,
      }}
      testID="voice-recording-bar"
    >
      <View
        accessibilityElementsHidden
        importantForAccessibility="no"
        style={{
          backgroundColor: "#E53935",
          borderRadius: 5,
          height: 10,
          width: 10,
        }}
      />
      <AppText
        accessibilityLabel={`녹음 시간 ${formatVoiceClockMs(elapsedMs)}`}
        style={{ fontVariant: ["tabular-nums"] }}
        variant="body"
      >
        {formatVoiceClockMs(elapsedMs)}
      </AppText>
      <LevelBar metering={metering} />
      <View style={{ flex: 1 }} />
      <Pressable
        accessibilityLabel="삭제"
        accessibilityRole="button"
        onPress={onDelete}
        style={{
          alignItems: "center",
          height: appChatComposer.controlSize,
          justifyContent: "center",
          width: appChatComposer.controlSize,
        }}
      >
        <AppSymbol name="delete" size={22} tintColor={colors.textMuted} />
      </Pressable>
      <Pressable
        accessibilityLabel="정지"
        accessibilityRole="button"
        onPress={onStop}
        style={{
          alignItems: "center",
          backgroundColor: colors.primary,
          borderCurve: "continuous",
          borderRadius: 22,
          height: appChatComposer.controlSize,
          justifyContent: "center",
          width: appChatComposer.controlSize,
        }}
      >
        <AppSymbol name="stop" size={20} tintColor={colors.onPrimary} />
      </Pressable>
    </View>
  );
}

export function VoicePreviewBar({
  isPlaying,
  positionMillis,
  durationMillis,
  onTogglePlayback,
  onDelete,
  onSend,
  sendDisabled,
}: Readonly<{
  isPlaying: boolean;
  positionMillis: number;
  durationMillis: number;
  onTogglePlayback: () => void;
  onDelete: () => void;
  onSend: () => void;
  sendDisabled: boolean;
}>) {
  const { colors } = useAppTheme();
  const progress =
    durationMillis > 0 ? Math.min(1, positionMillis / durationMillis) : 0;
  return (
    <View
      style={{
        alignItems: "center",
        backgroundColor: colors.surface,
        borderCurve: "continuous",
        borderRadius: appRadii.full,
        flexDirection: "row",
        gap: appSpacing.xs,
        minHeight: appChatComposer.minHeight,
        paddingHorizontal: appSpacing.sm,
        paddingVertical: 8,
      }}
      testID="voice-preview-bar"
    >
      <Pressable
        accessibilityLabel={isPlaying ? "일시정지" : "재생"}
        accessibilityRole="button"
        onPress={onTogglePlayback}
        style={{
          alignItems: "center",
          height: appChatComposer.controlSize,
          justifyContent: "center",
          width: appChatComposer.controlSize,
        }}
      >
        <AppSymbol
          name={isPlaying ? "pause" : "play"}
          size={28}
          tintColor={colors.primary}
        />
      </Pressable>
      <View
        style={{
          backgroundColor: colors.border,
          borderRadius: appRadii.full,
          flex: 1,
          height: 4,
          overflow: "hidden",
        }}
      >
        <View
          style={{
            backgroundColor: colors.primary,
            height: 4,
            width: `${Math.round(progress * 100)}%`,
          }}
        />
      </View>
      <AppText style={{ fontVariant: ["tabular-nums"] }} variant="footnote">
        {formatVoiceClockMs(isPlaying ? positionMillis : durationMillis)}
      </AppText>
      <Pressable
        accessibilityLabel="삭제"
        accessibilityRole="button"
        onPress={onDelete}
        style={{
          alignItems: "center",
          height: appChatComposer.controlSize,
          justifyContent: "center",
          width: appChatComposer.controlSize,
        }}
      >
        <AppSymbol name="delete" size={22} tintColor={colors.textMuted} />
      </Pressable>
      <Pressable
        accessibilityLabel="보내기"
        accessibilityRole="button"
        accessibilityState={{ disabled: sendDisabled }}
        disabled={sendDisabled}
        onPress={onSend}
        style={({ pressed }) => ({
          alignItems: "center",
          backgroundColor: sendDisabled ? colors.fill : colors.primary,
          borderCurve: "continuous",
          borderRadius: 22,
          height: appChatComposer.controlSize,
          justifyContent: "center",
          opacity: pressed ? 0.72 : 1,
          width: appChatComposer.controlSize,
        })}
      >
        <AppSymbol
          name="send"
          size={20}
          tintColor={sendDisabled ? colors.textMuted : colors.onPrimary}
        />
      </Pressable>
    </View>
  );
}
