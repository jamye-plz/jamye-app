import {
  AccessibilityInfo,
  Platform,
  StatusBar,
  Text,
  View,
  findNodeHandle,
  useWindowDimensions,
} from "react-native";
import { useEffect, useMemo, useRef, useState } from "react";
import type { RefObject, ReactNode } from "react";
import { SafeAreaView } from "react-native-safe-area-context";

import { useAppRuntime } from "@/core/providers/app-providers";
import { useAppTheme } from "@/core/theme/theme-provider";
import { appChatLayout, appSpacing, appTypography } from "@/core/theme/tokens";
import {
  FIXTURE_CONVERSATION_ID,
  LOCAL_FIXTURE_NOTICE,
} from "@/features/chat/model/chat-fixture";
import { createChatSendController } from "@/features/chat/model/chat-send";
import type { ChatSendController } from "@/features/chat/model/chat-send";
import type { ChatConversation } from "../use-chat-conversation";

import { useChatConversation } from "../use-chat-conversation";
import { ChatComposer } from "./chat-composer";
import { ChatKeyboardFrame as AndroidChatKeyboardFrame } from "./chat-keyboard-frame.android";
import { ChatKeyboardFrame as IosChatKeyboardFrame } from "./chat-keyboard-frame.ios";
import { ChatMessageList } from "./chat-message-list";

const ChatKeyboardFrame =
  Platform.OS === "ios" ? IosChatKeyboardFrame : AndroidChatKeyboardFrame;

type MainHeadingTarget = Readonly<{
  nativeRef: RefObject<Text | null>;
  props: Readonly<{
    accessibilityRole: "header";
    children: string;
  }>;
}>;

function defaultFocusMainHeading(target: MainHeadingTarget): void {
  const nativeHandle = findNodeHandle(target.nativeRef.current);
  if (nativeHandle !== null) {
    AccessibilityInfo.setAccessibilityFocus(nativeHandle);
  }
}

export function ChatScreen({
  focusMainHeading = defaultFocusMainHeading,
}: Readonly<{
  focusMainHeading?: (target: MainHeadingTarget) => void;
}>) {
  const { repository, clock, messageIdentity } = useAppRuntime();
  const conversation = useChatConversation({
    conversationId: FIXTURE_CONVERSATION_ID,
    repository,
  });
  const controller = createChatSendController({
    clock,
    conversationId: FIXTURE_CONVERSATION_ID,
    messageIdentity,
    repository,
    senderId: "local-user",
  });
  return (
    <ChatConversationScreen
      title="로컬 대화"
      notice={LOCAL_FIXTURE_NOTICE}
      conversation={conversation}
      controller={controller}
      onRetryFailedMessage={(input) => {
        void controller.retryFailedMessage(input);
      }}
      focusMainHeading={focusMainHeading}
    />
  );
}

export function ChatConversationScreen({
  title,
  notice,
  conversation,
  controller,
  onRetryFailedMessage,
  toolbar,
  footer,
  blocked = false,
  revealInitialLatest = false,
  onVisibleCanonicalMessages,
  focusMainHeading = defaultFocusMainHeading,
}: Readonly<{
  title: string;
  notice?: string;
  conversation: ChatConversation;
  controller: Pick<ChatSendController, "send">;
  onRetryFailedMessage: (
    input: Readonly<{ clientMsgId: string; conversationId: string }>,
  ) => void;
  onVisibleCanonicalMessages?: (ids: readonly string[]) => void;
  toolbar?: ReactNode;
  footer?: ReactNode;
  blocked?: boolean;
  revealInitialLatest?: boolean;
  focusMainHeading?: (target: MainHeadingTarget) => void;
}>) {
  const { colorScheme, colors } = useAppTheme();
  const { width } = useWindowDimensions();
  const headingRef = useRef<Text>(null);
  const [latestMessageRevealTarget, setLatestMessageRevealTarget] = useState<
    string | null
  >(null);
  const headingTarget = useMemo<MainHeadingTarget>(
    () => ({
      nativeRef: headingRef,
      props: { accessibilityRole: "header", children: title },
    }),
    [title],
  );
  const revealedInitial = useRef(false);
  useEffect(() => {
    if (
      revealInitialLatest &&
      !revealedInitial.current &&
      conversation.initialPageStatus === "ready" &&
      conversation.items.length > 0
    ) {
      revealedInitial.current = true;
      setLatestMessageRevealTarget(
        conversation.items[conversation.items.length - 1]!.localId,
      );
    }
  }, [conversation, revealInitialLatest]);

  useEffect(() => {
    focusMainHeading(headingTarget);
  }, [focusMainHeading, headingTarget]);

  return (
    <>
      <StatusBar
        barStyle={colorScheme === "dark" ? "light-content" : "dark-content"}
      />
      <SafeAreaView style={{ backgroundColor: colors.background, flex: 1 }}>
        <ChatKeyboardFrame>
          {({ keyboardOverlap, keyboardState }) => (
            <View
              style={{
                alignSelf: "center",
                flex: 1,
                maxWidth: appChatLayout.conversationMaxWidth,
                paddingHorizontal:
                  width >= appChatLayout.conversationMaxWidth + appSpacing.huge
                    ? appSpacing.xl
                    : appSpacing.md,
                width: "100%",
              }}
            >
              <Text
                ref={headingRef}
                accessibilityRole="header"
                style={{ color: colors.text, ...appTypography.title }}
              >
                {title}
              </Text>
              {toolbar}
              {notice ? (
                <Text
                  style={{
                    backgroundColor: colors.noticeSurface,
                    color: colors.text,
                    marginTop: appSpacing.sm,
                    padding: appSpacing.sm,
                  }}
                >
                  {notice}
                </Text>
              ) : null}
              <ChatMessageList
                conversation={conversation}
                keyboardOverlap={keyboardOverlap}
                keyboardState={keyboardState}
                latestMessageRevealTarget={latestMessageRevealTarget}
                onRetryFailedMessage={onRetryFailedMessage}
                onVisibleCanonicalMessages={onVisibleCanonicalMessages}
              />
              {footer}
              <ChatComposer
                controller={controller}
                blocked={blocked}
                onMessageCommitted={setLatestMessageRevealTarget}
              />
            </View>
          )}
        </ChatKeyboardFrame>
      </SafeAreaView>
    </>
  );
}
