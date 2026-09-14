import {
  AccessibilityInfo,
  Pressable,
  Text,
  View,
  useWindowDimensions,
} from "react-native";
import { useEffect, useRef } from "react";

import { useAppTheme } from "@/core/theme/theme-provider";
import {
  appChatLayout,
  appChatMessage,
  appControl,
  appSpacing,
} from "@/core/theme/tokens";
import type { ConnectedChatMedia } from "@/features/chat/model/connected-chat-presentation";
import { MediaImage } from "@/features/media/ui/media-image";
import { MediaOpenSaveButton } from "@/features/media/ui/media-open-save-button";
import { MediaVideoCard } from "@/features/media/ui/media-video-card";
import type { ChatMessage } from "../model/chat-message-window";

const statusLabels = {
  failed: "전송 실패",
  pending: "전송 중",
  sent: "전송됨",
} as const;

/** `item.type` is the wire MIME `content_type` string (e.g. `"image/jpeg"`), never
 * the coarse image/video/audio kind — see media-attachment.ts's mapping note. */
function isImageMime(contentType: string): boolean {
  return contentType.startsWith("image/");
}

function MessageAttachments({
  media,
  isOutgoing,
  previewEnabled,
}: Readonly<{
  media: readonly ConnectedChatMedia[];
  isOutgoing: boolean;
  previewEnabled: boolean;
}>) {
  if (media.length === 0) return null;
  const ordered = [...media].sort(
    (left, right) => left.position - right.position,
  );
  return (
    <View style={{ gap: appSpacing.xxs, marginTop: appSpacing.xxs }}>
      {ordered.map((item) => (
        <View key={item.id}>
          {isImageMime(item.type) ? (
            <MediaImage filename={item.filename} mediaId={item.id} />
          ) : null}
          {item.type === "video/mp4" ? (
            <MediaVideoCard
              mediaId={item.id}
              filename={item.filename}
              thumbnailEnabled={previewEnabled}
            />
          ) : null}
          <MediaOpenSaveButton
            contentType={item.type}
            filename={item.filename}
            mediaId={item.id}
            onPrimary={isOutgoing}
          />
        </View>
      ))}
    </View>
  );
}

export function ChatMessageRow({
  isGroupedWithPrevious = false,
  mediaPreviewEnabled = false,
  message,
  onRetryFailedMessage,
}: Readonly<{
  isGroupedWithPrevious?: boolean;
  mediaPreviewEnabled?: boolean;
  message: ChatMessage;
  onRetryFailedMessage: (
    input: Readonly<{
      clientMsgId: string;
      conversationId: string;
    }>,
  ) => void;
}>) {
  const { colors } = useAppTheme();
  const { width } = useWindowDimensions();
  const previousStatusRef = useRef(message.status);

  useEffect(() => {
    const previousStatus = previousStatusRef.current;
    previousStatusRef.current = message.status;

    if (previousStatus !== message.status) {
      AccessibilityInfo.announceForAccessibility(statusLabels[message.status]);
    }
  }, [message.status]);

  const isOutgoing = message.isOutgoing ?? message.clientMsgId !== null;
  const bubbleMaxWidth =
    width >= appChatLayout.conversationMaxWidth + appSpacing.huge
      ? appChatLayout.wideBubbleMaxWidth
      : appChatLayout.compactBubbleMaxWidth;
  const backgroundColor = isOutgoing ? colors.primary : colors.surface;
  const color = isOutgoing ? colors.onPrimary : colors.text;

  return (
    <View
      style={{
        alignItems: isOutgoing ? "flex-end" : "flex-start",
        marginTop: isGroupedWithPrevious
          ? appChatMessage.sameSenderGap
          : appChatMessage.groupGap,
      }}
    >
      <View
        style={{
          backgroundColor,
          borderRadius: appChatMessage.bubbleRadius,
          borderBottomRightRadius: isOutgoing
            ? appChatMessage.directionalRadius
            : appChatMessage.bubbleRadius,
          borderBottomLeftRadius: isOutgoing
            ? appChatMessage.bubbleRadius
            : appChatMessage.directionalRadius,
          maxWidth: `${bubbleMaxWidth * 100}%`,
          padding: appSpacing.sm,
        }}
      >
        {!isGroupedWithPrevious && message.senderLabel ? (
          <Text style={{ color }}>{message.senderLabel}</Text>
        ) : null}
        {message.body ? (
          <Text
            style={{
              color,
              fontSize: appChatMessage.fontSize,
              lineHeight: appChatMessage.lineHeight,
            }}
          >
            {message.body}
          </Text>
        ) : null}
        <MessageAttachments
          previewEnabled={mediaPreviewEnabled}
          media={message.media ?? []}
          isOutgoing={isOutgoing}
        />
        {(message.media?.length ?? 0) === 0 &&
          message.pendingMedia?.map((item, index) => (
            <Text key={item.mediaUploadId} style={{ color }}>
              첨부 {index + 1}: {item.filename ?? "첨부 파일"} · 서버 전송 대기
            </Text>
          ))}
        <Text style={{ color, fontSize: appChatMessage.timestampFontSize }}>
          {statusLabels[message.status]}
        </Text>
      </View>
      {isOutgoing && message.status === "failed" && message.clientMsgId ? (
        <Pressable
          accessibilityLabel="메시지 다시 보내기"
          accessibilityRole="button"
          onPress={() =>
            onRetryFailedMessage({
              clientMsgId: message.clientMsgId!,
              conversationId: message.conversationId,
            })
          }
          style={{
            justifyContent: "center",
            minHeight: appControl.standardHeight,
          }}
        >
          <Text style={{ color: colors.error }}>메시지 다시 보내기</Text>
        </Pressable>
      ) : null}
    </View>
  );
}
