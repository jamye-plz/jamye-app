import { useState } from "react";
import { Pressable, Text, View } from "react-native";

import { useAppTheme } from "@/core/theme/theme-provider";
import { appControl, appSpacing } from "@/core/theme/tokens";
import type { MediaAttachmentController } from "./media-attachment-types";
import { useMediaPicker } from "./use-media-picker";

/**
 * Owner/manager-only topic image add action. `controller` is the same
 * `useMediaUploadQueue("topic", topicId, canManage)` shape the chat composer uses —
 * the topic scope already only ever holds one active item (the queue itself rejects a
 * second add while one is in flight or confirmed).
 */
export function TopicImageUploadButton({
  canManage,
  controller,
}: Readonly<{
  canManage: boolean;
  controller: MediaAttachmentController;
}>) {
  const { colors } = useAppTheme();
  const picker = useMediaPicker("topic", controller.scopeKey);
  const [pickerError, setPickerError] = useState<string | null>(null);
  if (!canManage || controller.available === false) return null;

  const item = controller.items[0] ?? null;
  const busy =
    item !== null &&
    (item.status === "uploading" || item.status === "finalizing");

  const addImage = async () => {
    if (item !== null && item.status !== "confirmed") return;
    if (item?.status === "confirmed") controller.remove(item.localId);
    const outcome = await picker.pickImageOrVideoAsset();
    if (outcome.status === "staged") {
      setPickerError(null);
      controller.addImageOrVideo(outcome.asset);
    } else if (outcome.status === "rejected") {
      setPickerError(outcome.message);
    } else if (outcome.status === "permission_denied") {
      setPickerError(
        outcome.canAskAgain
          ? "사진 접근 권한이 필요합니다."
          : "사진 접근 권한이 거부되었습니다. 기기 설정에서 Jamye의 사진 접근을 허용해 주세요.",
      );
    }
  };

  return (
    <View style={{ gap: appSpacing.xxs }}>
      <Pressable
        accessibilityLabel="주제 이미지 추가"
        accessibilityRole="button"
        accessibilityState={{
          busy: busy || picker.busy,
          disabled:
            busy ||
            picker.busy ||
            (item !== null && item.status !== "confirmed"),
        }}
        disabled={
          busy || picker.busy || (item !== null && item.status !== "confirmed")
        }
        onPress={() => void addImage()}
        style={{
          justifyContent: "center",
          minHeight: appControl.standardHeight,
        }}
      >
        <Text style={{ color: colors.primary }}>
          {picker.busy
            ? "이미지 선택·변환 중…"
            : busy
              ? "이미지 업로드 중…"
              : "주제 이미지 추가"}
        </Text>
      </Pressable>
      {pickerError ? (
        <Text style={{ color: colors.error }}>{pickerError}</Text>
      ) : null}
      {item?.status === "failed" ? (
        <>
          <Text style={{ color: colors.error }}>
            {item.errorMessage ?? "업로드에 실패했습니다."}
          </Text>
          <Pressable
            accessibilityLabel="주제 이미지 업로드 다시 시도"
            accessibilityRole="button"
            onPress={() => controller.retry(item.localId)}
            style={{
              justifyContent: "center",
              minHeight: appControl.standardHeight,
            }}
          >
            <Text style={{ color: colors.primary }}>다시 시도</Text>
          </Pressable>
          <Pressable
            accessibilityLabel="주제 이미지 업로드 취소"
            accessibilityRole="button"
            onPress={() => controller.remove(item.localId)}
            style={{
              justifyContent: "center",
              minHeight: appControl.standardHeight,
            }}
          >
            <Text style={{ color: colors.textMuted }}>취소</Text>
          </Pressable>
        </>
      ) : null}
      {item?.status === "confirmed" ? (
        <Text accessibilityLiveRegion="polite" style={{ color: colors.text }}>
          이미지를 추가했습니다.
        </Text>
      ) : null}
    </View>
  );
}
