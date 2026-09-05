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
import type { RefObject } from "react";
import { SafeAreaView } from "react-native-safe-area-context";

import { useAppRuntime } from "@/core/providers/app-providers";
import { useAppTheme } from "@/core/theme/theme-provider";
import { appChatLayout, appSpacing, appTypography } from "@/core/theme/tokens";
import {
  FIXTURE_CONVERSATION_ID,
  LOCAL_FIXTURE_NOTICE,
} from "@/features/chat/model/chat-fixture";
import { createChatSendController } from "@/features/chat/model/chat-send";

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
    children: "로컬 대화";
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
  const { colorScheme, colors } = useAppTheme();
  const { width } = useWindowDimensions();
  const headingRef = useRef<Text>(null);
  const [latestMessageRevealTarget, setLatestMessageRevealTarget] = useState<
    string | null
  >(null);
  const headingTarget = useMemo<MainHeadingTarget>(
    () => ({
      nativeRef: headingRef,
      props: { accessibilityRole: "header", children: "로컬 대화" },
    }),
    [],
  );
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
                로컬 대화
              </Text>
              <Text
                style={{
                  backgroundColor: colors.noticeSurface,
                  color: colors.text,
                  marginTop: appSpacing.sm,
                  padding: appSpacing.sm,
                }}
              >
                {LOCAL_FIXTURE_NOTICE}
              </Text>
              <ChatMessageList
                conversation={conversation}
                keyboardOverlap={keyboardOverlap}
                keyboardState={keyboardState}
                latestMessageRevealTarget={latestMessageRevealTarget}
                onRetryFailedMessage={(input) => {
                  void controller.retryFailedMessage(input);
                }}
              />
              <ChatComposer
                controller={controller}
                onMessageCommitted={setLatestMessageRevealTarget}
              />
            </View>
          )}
        </ChatKeyboardFrame>
      </SafeAreaView>
    </>
  );
}
