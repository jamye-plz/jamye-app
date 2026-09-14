import { Pressable, Text } from "react-native";

import { useAppTheme } from "@/core/theme/theme-provider";
import { appControl } from "@/core/theme/tokens";
import { useMediaDownload } from "./use-media-download";

const STATUS_LABEL: Record<
  ReturnType<typeof useMediaDownload>["status"],
  string
> = {
  idle: "열기·저장",
  downloading: "받는 중…",
  sharing: "여는 중…",
  error: "다시 시도",
  unavailable: "지금은 열 수 없습니다",
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
  const actionColor = onPrimary ? colors.onPrimary : colors.primary;
  return (
    <>
      <Pressable
        accessibilityLabel={`${label} 열기 또는 저장`}
        accessibilityRole="button"
        accessibilityState={{ disabled: busy || !available, busy }}
        disabled={busy || !available}
        onPress={() => void openOrSave({ mediaId, filename, contentType })}
        style={{
          justifyContent: "center",
          minHeight: appControl.standardHeight,
        }}
      >
        <Text
          accessibilityLiveRegion="polite"
          style={{
            color: onPrimary || available ? actionColor : colors.textMuted,
          }}
        >
          {STATUS_LABEL[status]}
        </Text>
      </Pressable>
      {status === "error" && errorMessage ? (
        <Text style={{ color: onPrimary ? colors.onPrimary : colors.error }}>
          {errorMessage}
        </Text>
      ) : null}
    </>
  );
}
