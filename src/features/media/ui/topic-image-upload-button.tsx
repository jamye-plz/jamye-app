import { useState } from "react";
import { ActivityIndicator, Pressable, StyleSheet, View } from "react-native";

import { useAppTheme } from "@/core/theme/theme-provider";
import { appChatComposer, appSpacing } from "@/core/theme/tokens";
import { AppSymbol } from "@/shared/ui/app-symbol";
import { AppText } from "@/shared/ui/app-text";
import { NativeButton } from "@/shared/ui/native-button";
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
  const disabled =
    busy || picker.busy || (item !== null && item.status !== "confirmed");

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
        accessibilityState={{ busy: busy || picker.busy, disabled }}
        disabled={disabled}
        hitSlop={8}
        onPress={() => void addImage()}
        style={({ pressed }) => [
          styles.button,
          { opacity: disabled ? 0.4 : pressed ? 0.5 : 1 },
        ]}
      >
        {busy || picker.busy ? (
          <ActivityIndicator
            color={colors.primary}
            testID="topic-image-upload-progress"
          />
        ) : (
          <AppSymbol name="image" tintColor={colors.primary} />
        )}
      </Pressable>
      {pickerError ? (
        <AppText color={colors.error}>{pickerError}</AppText>
      ) : null}
      {item?.status === "failed" ? (
        <>
          <AppText color={colors.error}>
            {item.errorMessage ?? "업로드에 실패했습니다."}
          </AppText>
          <NativeButton
            label="주제 이미지 업로드 다시 시도"
            onPress={() => controller.retry(item.localId)}
            variant="text"
          />
          <NativeButton
            label="주제 이미지 업로드 취소"
            onPress={() => controller.remove(item.localId)}
            variant="text"
          />
        </>
      ) : null}
      {item?.status === "confirmed" ? (
        <AppText accessibilityLiveRegion="polite" color={colors.text}>
          이미지를 추가했습니다.
        </AppText>
      ) : null}
    </View>
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
