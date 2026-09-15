import { ActivityIndicator, Pressable, View } from "react-native";

import { useAppTheme } from "@/core/theme/theme-provider";
import { appControl, appSpacing } from "@/core/theme/tokens";
import { AppSymbol } from "@/shared/ui/app-symbol";
import { AppText } from "@/shared/ui/app-text";
import { useMediaDownload } from "./use-media-download";

const CAPTION: Partial<
  Record<ReturnType<typeof useMediaDownload>["status"], string>
> = {
  downloading: "받는 중…",
  sharing: "여는 중…",
  error: "다시 시도",
};

export function MediaOpenSaveButton({
  mediaId,
  filename,
  contentType,
  onPrimary = false,
}: Readonly<{
  mediaId: string;
  filename: string | null;
  contentType: string | null;
  onPrimary?: boolean;
}>) {
  const { colors } = useAppTheme();
  const { available, status, errorMessage, openOrSave } = useMediaDownload();
  const busy = status === "downloading" || status === "sharing";
  const label = filename ?? "첨부 파일";
  const actionColor =
    onPrimary || available
      ? onPrimary
        ? colors.onPrimary
        : colors.primary
      : colors.textMuted;
  const caption = CAPTION[status];
  return (
    <View
      style={{
        alignItems: "center",
        flexDirection: "row",
        gap: appSpacing.xxs,
      }}
    >
      <Pressable
        accessibilityLabel={`${label} 열기 또는 저장`}
        accessibilityRole="button"
        accessibilityState={{ disabled: busy || !available, busy }}
        disabled={busy || !available}
        onPress={() => void openOrSave({ mediaId, filename, contentType })}
        style={{
          alignItems: "center",
          justifyContent: "center",
          minHeight: appControl.standardHeight,
          minWidth: appControl.standardHeight,
        }}
      >
        {busy ? (
          <ActivityIndicator color={actionColor} />
        ) : (
          <View testID="media-open-save-icon">
            <AppSymbol name="share" tintColor={actionColor} />
          </View>
        )}
      </Pressable>
      {caption ? (
        <AppText
          accessibilityLiveRegion="polite"
          color={
            status === "error"
              ? onPrimary
                ? colors.onPrimary
                : colors.error
              : actionColor
          }
          variant="caption"
        >
          {caption}
        </AppText>
      ) : null}
      {status === "error" && errorMessage ? (
        <AppText color={onPrimary ? colors.onPrimary : colors.error}>
          {errorMessage}
        </AppText>
      ) : null}
    </View>
  );
}
