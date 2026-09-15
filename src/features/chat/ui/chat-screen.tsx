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
import { Stack } from "expo-router";

import { useAppRuntime } from "@/core/providers/app-providers";
import { useAppTheme } from "@/core/theme/theme-provider";
import { appChatLayout, appSpacing } from "@/core/theme/tokens";
import {
  FIXTURE_CONVERSATION_ID,
  LOCAL_FIXTURE_NOTICE,
} from "@/features/chat/model/chat-fixture";
import { createChatSendController } from "@/features/chat/model/chat-send";
import type { ChatSendController } from "@/features/chat/model/chat-send";
import { AppText } from "@/shared/ui/app-text";
import { InlineMessage } from "@/shared/ui/inline-message";
import type { ChatConversation } from "../use-chat-conversation";

import type { MediaAttachmentController } from "@/features/media/ui/media-attachment-types";

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

/**
 * Native-header title block, rendered through `Stack.Screen`'s
 * `options.headerTitle` (only when a sync `subtitle` exists) rather than in
 * the scrollable body — the in-body heading `Text` this replaced is gone, so
 * `focusMainHeading`'s `nativeRef` legitimately stays `{ current: null }`
 * (see `defaultFocusMainHeading`, which already no-ops on a null handle).
 */
function HeaderTitle({
  title,
  subtitle,
}: Readonly<{ subtitle?: string; title: string }>) {
  const { colors } = useAppTheme();
  return (
    <View accessibilityRole="header" style={{ alignItems: "center" }}>
      <AppText variant="headline">{title}</AppText>
      {subtitle ? (
        <AppText color={colors.textMuted} variant="caption">
          {subtitle}
        </AppText>
      ) : null}
    </View>
  );
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
  subtitle,
  notice,
  conversation,
  controller,
  onRetryFailedMessage,
  toolbar,
  footer,
  headerRight,
  blocked = false,
  revealInitialLatest = false,
  onVisibleCanonicalMessages,
  focusMainHeading = defaultFocusMainHeading,
  attachmentController = null,
}: Readonly<{
  title: string;
  subtitle?: string;
  notice?: string;
  conversation: ChatConversation;
  controller: Pick<ChatSendController, "send">;
  onRetryFailedMessage: (
    input: Readonly<{ clientMsgId: string; conversationId: string }>,
  ) => void;
  onVisibleCanonicalMessages?: (ids: readonly string[]) => void;
  toolbar?: ReactNode;
  footer?: ReactNode;
  headerRight?: () => ReactNode;
  blocked?: boolean;
  revealInitialLatest?: boolean;
  focusMainHeading?: (target: MainHeadingTarget) => void;
  attachmentController?: MediaAttachmentController | null;
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
      <Stack.Screen
        options={{
          headerRight,
          headerTitle: subtitle
            ? () => <HeaderTitle subtitle={subtitle} title={title} />
            : undefined,
          title,
        }}
      />
      <StatusBar
        barStyle={colorScheme === "dark" ? "light-content" : "dark-content"}
      />
      <SafeAreaView
        edges={["bottom"]}
        style={{ backgroundColor: colors.background, flex: 1 }}
      >
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
              {toolbar}
              {notice ? <InlineMessage kind="notice" message={notice} /> : null}
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
                attachmentController={attachmentController}
              />
            </View>
          )}
        </ChatKeyboardFrame>
      </SafeAreaView>
    </>
  );
}
