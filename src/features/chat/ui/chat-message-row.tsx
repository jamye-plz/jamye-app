import {
  AccessibilityInfo,
  Text,
  View,
  useWindowDimensions,
} from "react-native";
import { useEffect, useRef } from "react";
import { useRouter } from "expo-router";

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
import { parseTopicAnnouncement } from "../model/topic-announcement";
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

/** E2: exact copy for a locally tombstoned row -- no attachments, no menu. */
const DELETED_MESSAGE_LABEL = "삭제된 메시지입니다.";

/** E2/C2/U2: exact copy for a media_expired failed row (plan
 * api_contracts.E2_media_expired_failure.row_ui). */
const MEDIA_EXPIRED_REASON = "첨부 업로드 시간이 지나 보낼 수 없습니다.";

export function ChatMessageRow({
  rowMeta,
  message,
  mediaPreviewEnabled = false,
  onRetryFailedMessage,
  onShareAttachment,
  onRequestDeleteMessage,
  onRequestDiscardFailedMessage,
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
  /** R2 공유 menu action and the voice bubble's inline share button:
   * forwarded down from a single screen-level `useMediaSharing()` call (its
   * own `useFocusEffect` must not be re-subscribed once per row). */
  onShareAttachment: (attachment: MessageAttachmentMedia) => void;
  /** AC3/E11: own server-backed, non-pending, not-yet-deleted message only.
   * This is a *request* -- the screen owns showing `ConfirmAlert`
   * (`메시지를 삭제할까요?` / `모든 사람의 대화방에서 삭제됩니다.` / `삭제`)
   * and only calls the store's `deleteMessage` action on confirm. */
  onRequestDeleteMessage: (
    input: Readonly<{ chatroomId: string; serverMessageId: string }>,
  ) => void;
  /** AC5/A2: own failed message only. Same row-level "request, screen
   * confirms" split as `onRequestDeleteMessage`
   * (`메시지를 버릴까요?` / `전송하지 못한 메시지를 이 기기에서 지웁니다.` / `버리기`). */
  onRequestDiscardFailedMessage: (
    input: Readonly<{ clientMsgId: string }>,
  ) => void;
}>) {
  const { colors } = useAppTheme();
  const { width } = useWindowDimensions();
  const router = useRouter();
  const previousStatusRef = useRef(message.status);
  const menuOpenRef = useRef<(() => void) | null>(null);

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

  // E2: a deleted system message (topic announcement, etc.) is hidden with
  // no placeholder at all -- unlike a deleted user message, which keeps its
  // row and alignment. listMessagesWindow already excludes
  // kind='system' AND deleted_at_ms IS NOT NULL rows at the SQLite layer;
  // this is defense in depth against any other row source reaching here.
  if (isSystem && message.deletedAtMs != null) return null;

  // E1/C1/U4: a deleted topic's announcement is normally already excluded at
  // the SQLite layer (markAnnouncementDeleted turns it into a deleted system
  // row). Like the isSystem check above, this is defense in depth: an
  // announcement-shaped row that reaches here deleted renders nothing,
  // never the generic "삭제된 메시지입니다." placeholder.
  const announcement = !isSystem ? parseTopicAnnouncement(message.body) : null;
  if (announcement && message.deletedAtMs != null) return null;

  const isDeleted = message.deletedAtMs != null;
  // E2/C2/U2: a distinct terminal failure -- retry stays hidden, the row
  // shows a fixed reason and 버리기 instead (plan
  // api_contracts.E2_media_expired_failure.row_ui).
  const isMediaExpired =
    message.status === "failed" && message.errorCode === "media_expired";

  const retry = () => {
    if (!message.clientMsgId) return;
    onRetryFailedMessage({
      clientMsgId: message.clientMsgId,
      conversationId: message.conversationId,
    });
  };

  const discardFailed = () => {
    if (!message.clientMsgId) return;
    onRequestDiscardFailedMessage({ clientMsgId: message.clientMsgId });
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
  const media = isDeleted ? [] : (message.media ?? []);
  const hasAttachments = media.length > 0;
  // "전송됨" is only ever shown visibly on the single last outgoing bubble
  // (`rowMeta.showSentStatus`, computed once linearly for the whole list);
  // pending/failed always render on their own row.
  const statusCaptionVisible = message.status !== "sent" || showSentStatus;
  const statusCaptionText =
    message.status === "sent"
      ? `${timeLabel} · ${statusLabels.sent}`
      : isMediaExpired
        ? MEDIA_EXPIRED_REASON
        : statusLabels[message.status];
  const bubbleAccessibilityLabel = isDeleted
    ? DELETED_MESSAGE_LABEL
    : message.body
      ? `${message.body}, ${statusCaptionVisible ? statusCaptionText : statusLabels[message.status]}`
      : statusCaptionVisible
        ? statusCaptionText
        : statusLabels[message.status];

  // F-10/A20: a long-press on a photo, video or voice attachment opens this
  // row's menu (공유, 삭제) instead of sharing at once. On iOS the native
  // menu opens by itself and `openRef` stays empty; the attachment still
  // takes the long-press so it does not also play or open the viewer.
  const openMenuFromAttachment = () => menuOpenRef.current?.();
  const menuActions: ChatMessageMenuAction[] = [];
  if (!isDeleted && message.body) {
    menuActions.push({
      key: "copy",
      label: "복사",
      systemImage: "doc.on.doc",
      onPress: () => void copyMessageBodyToClipboard(message.body),
    });
  }
  if (!isDeleted && hasAttachments) {
    menuActions.push({
      key: "share",
      label: "공유",
      systemImage: "square.and.arrow.up",
      onPress: () => {
        const first = [...media].sort((a, b) => a.position - b.position)[0];
        if (first) onShareAttachment(first);
      },
    });
  }
  if (
    !isDeleted &&
    isOutgoing &&
    message.status === "failed" &&
    message.clientMsgId &&
    !isMediaExpired
  ) {
    menuActions.push({
      key: "retry",
      label: "다시 보내기",
      systemImage: "arrow.clockwise",
      onPress: retry,
    });
  }
  // E11: destructive 삭제 is always the last item, own messages only, never
  // on a pending or already-deleted row. AC3 (server-backed, sent) and AC5
  // (failed, discard) share one menu slot since a message is never both.
  if (
    !isDeleted &&
    isOutgoing &&
    message.status === "sent" &&
    message.serverMessageId
  ) {
    const serverMessageId = message.serverMessageId;
    menuActions.push({
      key: "delete",
      label: "삭제",
      systemImage: "trash",
      destructive: true,
      onPress: () =>
        onRequestDeleteMessage({
          chatroomId: message.conversationId,
          serverMessageId,
        }),
    });
  } else if (
    !isDeleted &&
    isOutgoing &&
    message.status === "failed" &&
    message.clientMsgId
  ) {
    const clientMsgId = message.clientMsgId;
    menuActions.push({
      key: "delete",
      label: "삭제",
      systemImage: "trash",
      destructive: true,
      onPress: () => onRequestDiscardFailedMessage({ clientMsgId }),
    });
  }

  const pendingCaptions =
    isDeleted || hasAttachments ? [] : (message.pendingMedia ?? []);
  const textBubble = isDeleted ? (
    <View
      accessible
      accessibilityLabel={bubbleAccessibilityLabel}
      style={{
        borderCurve: "continuous",
        borderRadius: appChatMessage.bubbleRadius,
        maxWidth: bubbleMaxWidth,
        paddingHorizontal: 14,
        paddingVertical: 10,
      }}
    >
      <AppText color={colors.textMuted} variant="body">
        {DELETED_MESSAGE_LABEL}
      </AppText>
    </View>
  ) : message.body || pendingCaptions.length > 0 ? (
    <View
      // Announcement bubble: `accessible` is intentionally omitted here so
      // the nested link below keeps its own native accessibility focus stop
      // (VoiceOver/TalkBack) -- an `accessible` ancestor would collapse the
      // whole subtree into one non-activatable block and swallow the link.
      accessible={announcement ? undefined : true}
      accessibilityLabel={announcement ? undefined : bubbleAccessibilityLabel}
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
      {announcement ? (
        <Text
          style={{
            color,
            fontSize: appChatMessage.fontSize,
            lineHeight: appChatMessage.lineHeight,
          }}
        >
          {announcement.prefix}
          <Text
            accessibilityLabel={announcement.title}
            accessibilityRole="link"
            onPress={() => router.push(announcement.href)}
            // Inherits the bubble's text color: my own bubble is itself
            // colors.primary, so a primary-colored title vanished there.
            style={{ textDecorationLine: "underline" }}
          >
            {announcement.title}
          </Text>
        </Text>
      ) : message.body ? (
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
          onLongPressAttachment={openMenuFromAttachment}
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
    <ChatMessageMenu
      actions={menuActions}
      alignEnd={isOutgoing}
      openRef={menuOpenRef}
    >
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
        {!isDeleted && message.status === "failed" && message.clientMsgId ? (
          // `NativeButton` stretches its host across its parent, so the
          // parent itself shrinks to the button and moves to my side.
          <View style={{ alignSelf: "flex-end" }}>
            <NativeButton
              label={isMediaExpired ? "버리기" : "메시지 다시 보내기"}
              onPress={isMediaExpired ? discardFailed : retry}
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
