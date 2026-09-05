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
import type { ChatMessage } from "../model/chat-message-window";

const statusLabels = {
  failed: "전송 실패",
  pending: "전송 중",
  sent: "전송됨",
} as const;

export function ChatMessageRow({
  isGroupedWithPrevious = false,
  message,
  onRetryFailedMessage,
}: Readonly<{
  isGroupedWithPrevious?: boolean;
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

  const isOutgoing = message.clientMsgId !== null;
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
        <Text
          style={{
            color,
            fontSize: appChatMessage.fontSize,
            lineHeight: appChatMessage.lineHeight,
          }}
        >
          {message.body}
        </Text>
        <Text style={{ color, fontSize: appChatMessage.timestampFontSize }}>
          {statusLabels[message.status]}
        </Text>
      </View>
      {message.status === "failed" && message.clientMsgId ? (
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
