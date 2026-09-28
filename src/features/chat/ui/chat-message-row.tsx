import {
  AccessibilityInfo,
  Text,
  View,
  useWindowDimensions,
} from "react-native";
import { useEffect, useRef } from "react";

import { useAppTheme } from "@/core/theme/theme-provider";
import { appChatLayout, appChatMessage, appSpacing } from "@/core/theme/tokens";
import { AppText } from "@/shared/ui/app-text";
import { Avatar } from "@/shared/ui/avatar";
import { NativeButton } from "@/shared/ui/native-button";
import { copyMessageBodyToClipboard } from "@/features/chat/platform/clipboard";
import { MessageAttachmentsView } from "@/features/media/ui/message-attachments-view";
import type { MessageAttachmentMedia } from "@/features/media/ui/message-attachments-view";
import { openMediaViewer } from "@/features/media/ui/media-viewer-store";

import type { ChatMessage } from "../model/chat-message-window";
import type { ChatMessageRowMeta } from "../model/chat-message-grouping";
import { ChatDateSeparator } from "./chat-date-separator";
import { ChatMessageMenu } from "./chat-message-menu";
import type { ChatMessageMenuAction } from "./chat-message-menu.types";

/** R1/E7: "약 28" incoming-group avatar diameter -- intentionally not a
 * shared token (would add a key to the `appChatMessage`/`appChatLayout`
 * pinned-token contract in `chat-accessibility.test.tsx`, which asserts
 * `toEqual` on their exact current shape). */
const AVATAR_SIZE = 28;

const statusLabels = {
  failed: "전송 실패",
  pending: "전송 중",
  sent: "전송됨",
} as const;

export function ChatMessageRow({
  rowMeta,
  message,
  mediaPreviewEnabled = false,
  onRetryFailedMessage,
  onShareAttachment,
}: Readonly<{
  rowMeta: ChatMessageRowMeta;
  message: ChatMessage;
  mediaPreviewEnabled?: boolean;
  onRetryFailedMessage: (
    input: Readonly<{
      clientMsgId: string;
      conversationId: string;
    }>,
  ) => void;
  /** R2 저장·공유 / R3 per-attachment long-press: forwarded down from a
   * single screen-level `useMediaSharing()` call (its own `useFocusEffect`
   * must not be re-subscribed once per row). */
  onShareAttachment: (attachment: MessageAttachmentMedia) => void;
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

  const {
    isOutgoing,
    isSystem,
    isGroupedWithPrevious,
    isLastInGroup,
    showDateSeparator,
    dateSeparatorLabel,
    timeLabel,
    showSentStatus,
  } = rowMeta;

  const retry = () => {
    if (!message.clientMsgId) return;
    onRetryFailedMessage({
      clientMsgId: message.clientMsgId,
      conversationId: message.conversationId,
    });
  };

  if (isSystem) {
    return (
      <View>
        {showDateSeparator ? (
          <ChatDateSeparator label={dateSeparatorLabel} />
        ) : null}
        <View
          style={{
            alignItems: "center",
            marginTop: isGroupedWithPrevious
              ? appChatMessage.sameSenderGap
              : appChatMessage.groupGap,
          }}
        >
          <AppText color={colors.textMuted} variant="caption">
            {message.body || "표시할 수 없는 메시지입니다."}
          </AppText>
        </View>
      </View>
    );
  }

  const bubbleMaxWidthRatio =
    width >= appChatLayout.conversationMaxWidth + appSpacing.huge
      ? appChatLayout.wideBubbleMaxWidth
      : appChatLayout.compactBubbleMaxWidth;
  // A number, not a percentage: the platform menu wrappers host the bubble
  // in a content-sized native view, where a percentage has no width to
  // resolve against and long unbroken text (URLs) would not wrap.
  const bubbleMaxWidth = Math.round(
    Math.min(width, appChatLayout.conversationMaxWidth) * bubbleMaxWidthRatio,
  );
  const backgroundColor = isOutgoing ? colors.primary : colors.surface;
  const color = isOutgoing ? colors.onPrimary : colors.text;
  const media = message.media ?? [];
  const hasAttachments = media.length > 0;
  // "전송됨" is only ever shown visibly on the single last outgoing bubble
  // (`rowMeta.showSentStatus`, computed once linearly for the whole list);
  // pending/failed always render on their own row.
  const statusCaptionVisible = message.status !== "sent" || showSentStatus;
  const statusCaptionText =
    message.status === "sent"
      ? `${timeLabel} · ${statusLabels.sent}`
      : statusLabels[message.status];
  const bubbleAccessibilityLabel = message.body
    ? `${message.body}, ${statusCaptionVisible ? statusCaptionText : statusLabels[message.status]}`
    : statusCaptionVisible
      ? statusCaptionText
      : statusLabels[message.status];

  const menuActions: ChatMessageMenuAction[] = [];
  if (message.body) {
    menuActions.push({
      key: "copy",
      label: "복사",
      systemImage: "doc.on.doc",
      onPress: () => void copyMessageBodyToClipboard(message.body),
    });
  }
  if (hasAttachments) {
    menuActions.push({
      key: "save-share",
      label: "저장·공유",
      systemImage: "square.and.arrow.up",
      onPress: () => {
        const first = [...media].sort((a, b) => a.position - b.position)[0];
        if (first) onShareAttachment(first);
      },
    });
  }
  if (isOutgoing && message.status === "failed" && message.clientMsgId) {
    menuActions.push({
      key: "retry",
      label: "다시 보내기",
      systemImage: "arrow.clockwise",
      onPress: retry,
    });
  }

  const pendingCaptions = hasAttachments ? [] : (message.pendingMedia ?? []);
  const textBubble =
    message.body || pendingCaptions.length > 0 ? (
      <View
        accessible
        accessibilityLabel={bubbleAccessibilityLabel}
        style={{
          backgroundColor,
          borderBottomLeftRadius: isOutgoing
            ? appChatMessage.bubbleRadius
            : appChatMessage.directionalRadius,
          borderBottomRightRadius: isOutgoing
            ? appChatMessage.directionalRadius
            : appChatMessage.bubbleRadius,
          borderCurve: "continuous",
          borderRadius: appChatMessage.bubbleRadius,
          maxWidth: bubbleMaxWidth,
          paddingHorizontal: 14,
          paddingVertical: 10,
        }}
      >
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
        {pendingCaptions.map((item, index) => (
          <AppText color={color} key={item.mediaUploadId} variant="caption">
            첨부 {index + 1}: {item.filename ?? "첨부 파일"} · 서버 전송 대기
          </AppText>
        ))}
      </View>
    ) : null;

  // R3: photos/videos sit bare (rounded, no colored bubble) with the text
  // bubble, if any, below them; a voice attachment brings its own bubble.
  const bubble = (
    <View
      style={{
        alignItems: isOutgoing ? "flex-end" : "flex-start",
        gap: appSpacing.xxs,
      }}
    >
      {hasAttachments ? (
        <MessageAttachmentsView
          attachments={media}
          mine={isOutgoing}
          onLongPressAttachment={onShareAttachment}
          onOpenViewer={(startIndex) =>
            openMediaViewer({
              attachments: media,
              messageId: message.localId,
              startIndex,
            })
          }
          onShareAttachment={onShareAttachment}
          previewEnabled={mediaPreviewEnabled}
        />
      ) : null}
      {textBubble}
    </View>
  );

  const menuWrapped = (
    <ChatMessageMenu actions={menuActions} alignEnd={isOutgoing}>
      {bubble}
    </ChatMessageMenu>
  );

  if (isOutgoing) {
    return (
      <View>
        {showDateSeparator ? (
          <ChatDateSeparator label={dateSeparatorLabel} />
        ) : null}
        <View
          style={{
            alignItems: "flex-end",
            marginTop: isGroupedWithPrevious
              ? appChatMessage.sameSenderGap
              : appChatMessage.groupGap,
          }}
        >
          {menuWrapped}
          {/* R1: the send status sits under my last bubble (and pending/
              failed under their own row); other groups end in their time. */}
          {statusCaptionVisible || isLastInGroup ? (
            <AppText
              color={
                message.status === "failed" ? colors.error : colors.textMuted
              }
              variant="caption"
            >
              {statusCaptionVisible ? statusCaptionText : timeLabel}
            </AppText>
          ) : null}
        </View>
        {message.status === "failed" && message.clientMsgId ? (
          // `NativeButton` stretches its host across its parent, so the
          // parent itself shrinks to the button and moves to my side.
          <View style={{ alignSelf: "flex-end" }}>
            <NativeButton
              label="메시지 다시 보내기"
              onPress={retry}
              variant="text"
            />
          </View>
        ) : null}
      </View>
    );
  }

  return (
    <View>
      {showDateSeparator ? (
        <ChatDateSeparator label={dateSeparatorLabel} />
      ) : null}
      <View
        style={{
          alignItems: "flex-end",
          flexDirection: "row",
          marginTop: isGroupedWithPrevious
            ? appChatMessage.sameSenderGap
            : appChatMessage.groupGap,
        }}
      >
        <View style={{ marginRight: appSpacing.xxs, width: AVATAR_SIZE }}>
          {isLastInGroup ? (
            <Avatar
              name={message.senderLabel ?? "?"}
              size={AVATAR_SIZE}
              testID="chat-row-avatar"
              uri={message.senderAvatarUrl}
            />
          ) : null}
        </View>
        <View style={{ alignItems: "flex-start", flex: 1 }}>
          {!isGroupedWithPrevious && message.senderLabel ? (
            <AppText color={colors.textMuted} variant="caption">
              {message.senderLabel}
            </AppText>
          ) : null}
          {menuWrapped}
        </View>
      </View>
      {/* R1: the avatar sits beside the group's last bubble, so the time
          goes on its own line under the bubble column, not beside it. */}
      {isLastInGroup ? (
        <View style={{ paddingLeft: AVATAR_SIZE + appSpacing.xxs }}>
          <AppText color={colors.textMuted} variant="caption">
            {timeLabel}
          </AppText>
        </View>
      ) : null}
    </View>
  );
}
