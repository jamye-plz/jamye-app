import { AccessibilityInfo, Pressable, ScrollView, View } from "react-native";
import { useEffect, useRef } from "react";

import { useAppTheme } from "@/core/theme/theme-provider";
import { appChatComposer, appRadii, appSpacing } from "@/core/theme/tokens";
import { AppSymbol } from "@/shared/ui/app-symbol";
import { AppText } from "@/shared/ui/app-text";
import type { MediaAttachmentQueueItem } from "./media-attachment-types";

const STATUS_LABELS: Record<MediaAttachmentQueueItem["status"], string> = {
  staged: "대기 중",
  uploading: "업로드 중",
  finalizing: "마무리 중",
  confirmed: "첨부 완료",
  failed: "첨부 실패",
  cancelled: "취소됨",
};

function AttachmentCard({
  item,
  onCancel,
  onRetry,
  onRemove,
}: Readonly<{
  item: MediaAttachmentQueueItem;
  onCancel: (localId: string) => void;
  onRetry: (localId: string) => void;
  onRemove: (localId: string) => void;
}>) {
  const { colors } = useAppTheme();
  const previousStatusRef = useRef(item.status);
  useEffect(() => {
    if (previousStatusRef.current !== item.status) {
      AccessibilityInfo.announceForAccessibility(
        `${item.filename ?? "첨부 파일"} ${STATUS_LABELS[item.status]}`,
      );
    }
    previousStatusRef.current = item.status;
  }, [item.filename, item.status]);

  const filename = item.filename ?? "첨부 파일";
  const failed = item.status === "failed";
  const canCancel = item.status === "staged" || item.status === "uploading";
  const canRetry = failed;

  return (
    <View
      style={{
        backgroundColor: colors.surface,
        borderCurve: "continuous",
        borderRadius: appRadii.medium,
        gap: appSpacing.xxs,
        padding: appSpacing.xs,
        width: 140,
      }}
    >
      <AppText numberOfLines={1} variant="footnote">
        {filename}
      </AppText>
      <AppText
        color={failed ? colors.error : colors.textMuted}
        variant="caption"
      >
        {STATUS_LABELS[item.status]}
        {item.status === "uploading" && item.progress > 0
          ? ` ${Math.round(item.progress * 100)}%`
          : ""}
      </AppText>
      {failed && item.errorMessage ? (
        <AppText color={colors.error} variant="caption">
          {item.errorMessage}
        </AppText>
      ) : null}
      <View style={{ flexDirection: "row", gap: appSpacing.xxs }}>
        {canCancel ? (
          <Pressable
            accessibilityLabel={`${filename} 취소`}
            accessibilityRole="button"
            onPress={() => onCancel(item.localId)}
            style={{
              alignItems: "center",
              height: appChatComposer.controlSize,
              justifyContent: "center",
              width: appChatComposer.controlSize,
            }}
          >
            <AppSymbol name="close" size={20} tintColor={colors.textMuted} />
          </Pressable>
        ) : null}
        {canRetry ? (
          <Pressable
            accessibilityLabel={`${filename} 다시 시도`}
            accessibilityRole="button"
            onPress={() => onRetry(item.localId)}
            style={{
              alignItems: "center",
              height: appChatComposer.controlSize,
              justifyContent: "center",
              width: appChatComposer.controlSize,
            }}
          >
            <AppSymbol name="refresh" size={20} tintColor={colors.primary} />
          </Pressable>
        ) : null}
        <Pressable
          accessibilityLabel={`${filename} 제거`}
          accessibilityRole="button"
          onPress={() => onRemove(item.localId)}
          style={{
            alignItems: "center",
            height: appChatComposer.controlSize,
            justifyContent: "center",
            width: appChatComposer.controlSize,
          }}
        >
          <AppSymbol name="delete" size={20} tintColor={colors.textMuted} />
        </Pressable>
      </View>
    </View>
  );
}

export function AttachmentQueueList({
  items,
  onCancel,
  onRetry,
  onRemove,
}: Readonly<{
  items: readonly MediaAttachmentQueueItem[];
  onCancel: (localId: string) => void;
  onRetry: (localId: string) => void;
  onRemove: (localId: string) => void;
}>) {
  if (items.length === 0) return null;
  return (
    <ScrollView
      contentContainerStyle={{ gap: appSpacing.xs }}
      horizontal
      showsHorizontalScrollIndicator={false}
    >
      {items.map((item) => (
        <AttachmentCard
          key={item.localId}
          item={item}
          onCancel={onCancel}
          onRetry={onRetry}
          onRemove={onRemove}
        />
      ))}
    </ScrollView>
  );
}
