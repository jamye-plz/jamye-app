import { AccessibilityInfo, Pressable, Text, View } from "react-native";
import { useEffect, useRef } from "react";

import { useAppTheme } from "@/core/theme/theme-provider";
import { appControl, appSpacing } from "@/core/theme/tokens";
import type { MediaAttachmentQueueItem } from "./media-attachment-types";

const STATUS_LABELS: Record<MediaAttachmentQueueItem["status"], string> = {
  staged: "대기 중",
  uploading: "업로드 중",
  finalizing: "마무리 중",
  confirmed: "첨부 완료",
  failed: "첨부 실패",
  cancelled: "취소됨",
};

function AttachmentRow({
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

  const canCancel = item.status === "staged" || item.status === "uploading";
  const canRetry = item.status === "failed";

  return (
    <View
      style={{
        backgroundColor: colors.surface,
        borderRadius: 12,
        flexDirection: "row",
        alignItems: "center",
        gap: appSpacing.xs,
        padding: appSpacing.xs,
      }}
    >
      <View style={{ flex: 1 }}>
        <Text numberOfLines={1} style={{ color: colors.text }}>
          {item.filename ?? "첨부 파일"}
        </Text>
        <Text
          style={{
            color: item.status === "failed" ? colors.error : colors.textMuted,
          }}
        >
          {STATUS_LABELS[item.status]}
          {item.status === "uploading" && item.progress > 0
            ? ` ${Math.round(item.progress * 100)}%`
            : ""}
        </Text>
        {item.status === "failed" && item.errorMessage ? (
          <Text style={{ color: colors.error }}>{item.errorMessage}</Text>
        ) : null}
      </View>
      {canCancel ? (
        <Pressable
          accessibilityLabel={`${item.filename ?? "첨부 파일"} 취소`}
          accessibilityRole="button"
          onPress={() => onCancel(item.localId)}
          style={{
            justifyContent: "center",
            minHeight: appControl.standardHeight,
          }}
        >
          <Text style={{ color: colors.error }}>취소</Text>
        </Pressable>
      ) : null}
      {canRetry ? (
        <Pressable
          accessibilityLabel={`${item.filename ?? "첨부 파일"} 다시 시도`}
          accessibilityRole="button"
          onPress={() => onRetry(item.localId)}
          style={{
            justifyContent: "center",
            minHeight: appControl.standardHeight,
          }}
        >
          <Text style={{ color: colors.primary }}>다시 시도</Text>
        </Pressable>
      ) : null}
      <Pressable
        accessibilityLabel={`${item.filename ?? "첨부 파일"} 제거`}
        accessibilityRole="button"
        onPress={() => onRemove(item.localId)}
        style={{
          justifyContent: "center",
          minHeight: appControl.standardHeight,
        }}
      >
        <Text style={{ color: colors.textMuted }}>제거</Text>
      </Pressable>
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
    <View style={{ gap: appSpacing.xxs, marginBottom: appSpacing.xs }}>
      {items.map((item) => (
        <AttachmentRow
          key={item.localId}
          item={item}
          onCancel={onCancel}
          onRetry={onRetry}
          onRemove={onRemove}
        />
      ))}
    </View>
  );
}
