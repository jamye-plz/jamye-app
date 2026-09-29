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
import { Host } from "@expo/ui";

import { useAppRuntime } from "@/core/providers/app-providers";
import { useAppTheme } from "@/core/theme/theme-provider";
import { appChatLayout, appSpacing } from "@/core/theme/tokens";
import {
  FIXTURE_CONVERSATION_ID,
  LOCAL_FIXTURE_NOTICE,
} from "@/features/chat/model/chat-fixture";
import { createChatSendController } from "@/features/chat/model/chat-send";
import type { ChatSendController } from "@/features/chat/model/chat-send";
import { destructiveConfirmCopy } from "@/features/chat/model/destructive-confirm-copy";
import type { PendingDestructive } from "@/features/chat/model/destructive-confirm-copy";
import { useMediaSharing } from "@/features/media/model/media-sharing";
import { ConfirmAlert } from "@/shared/ui/confirm-alert";
import { HeaderActions } from "@/shared/ui/header-actions";
import type { HeaderAction } from "@/shared/ui/header-actions";
import { HeaderTitleButton } from "@/shared/ui/header-title-button";
import { InlineMessage } from "@/shared/ui/inline-message";
import type { ChatConversation } from "../use-chat-conversation";

import type { MediaAttachmentController } from "@/features/media/ui/media-attachment-types";

import { useChatConversation } from "../use-chat-conversation";
import { ChatComposer } from "./chat-composer";
import { ChatKeyboardFrame as AndroidChatKeyboardFrame } from "./chat-keyboard-frame.android";
import { ChatKeyboardFrame as IosChatKeyboardFrame } from "./chat-keyboard-frame.ios";
import { ChatMessageList } from "./chat-message-list";
import { SystemFeedbackHost } from "@/shared/ui/system-feedback";

const ChatKeyboardFrame =
  Platform.OS === "ios" ? IosChatKeyboardFrame : AndroidChatKeyboardFrame;

/** R4 layoutContract: on iOS the composer's material floats over the list,
 * so the list's bottom content inset must grow by the composer's own
 * measured height (reported through `onHeightChange`); on Android the
 * composer sits in normal flow below the list, which already reserves its
 * own space, so no extra inset is added there. */
const FLOATING_COMPOSER_INSET_PLATFORM = process.env.EXPO_OS === "ios";

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
      // M5 local fixture messages never carry a serverMessageId, so
      // ChatMessageRow's menu never surfaces 삭제 here -- these two are
      // unreachable no-ops, required only because ChatConversationScreen is
      // the shared shell the connected screen also renders through.
      onDeleteMessage={() => {}}
      onDiscardFailedMessage={() => {}}
      focusMainHeading={focusMainHeading}
    />
  );
}

export function ChatConversationScreen({
  title,
  subtitle,
  titleAccessibilityHint,
  onTitlePress,
  notice,
  conversation,
  controller,
  onRetryFailedMessage,
  onDeleteMessage,
  onDiscardFailedMessage,
  toolbar,
  footer,
  headerActions,
  blocked = false,
  revealInitialLatest = false,
  onVisibleCanonicalMessages,
  focusMainHeading = defaultFocusMainHeading,
  attachmentController = null,
}: Readonly<{
  title: string;
  subtitle?: string;
  /** D7/E4: main chatroom → 그룹 정보, topic chatroom → 주제 상세. Omitted
   * (including while title resolution is pending) renders a non-interactive
   * title, per `HeaderTitleButton`. */
  onTitlePress?: () => void;
  titleAccessibilityHint?: string;
  notice?: string;
  conversation: ChatConversation;
  controller: Pick<ChatSendController, "send">;
  onRetryFailedMessage: (
    input: Readonly<{ clientMsgId: string; conversationId: string }>,
  ) => void;
  /** AC3: called only after this screen's own `ConfirmAlert` is confirmed. */
  onDeleteMessage: (
    input: Readonly<{ chatroomId: string; serverMessageId: string }>,
  ) => void;
  /** AC5: called only after this screen's own `ConfirmAlert`(버리기) is confirmed. */
  onDiscardFailedMessage: (input: Readonly<{ clientMsgId: string }>) => void;
  onVisibleCanonicalMessages?: (ids: readonly string[]) => void;
  toolbar?: ReactNode;
  footer?: ReactNode;
  headerActions?: readonly HeaderAction[];
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
  const [composerHeight, setComposerHeight] = useState(0);
  // AC3/AC5/E10: one nullable "pending destructive action" slot (topic-list.tsx's
  // ConfirmAlert precedent) shared by delete (server-backed, server call) and
  // discard (failed, local-only) -- a message is never both, and the two only
  // differ in confirm copy + which store action fires on confirm.
  const [pendingDestructive, setPendingDestructive] =
    useState<PendingDestructive | null>(null);
  const destructiveCopy = pendingDestructive
    ? destructiveConfirmCopy(pendingDestructive)
    : null;
  const { shareAttachment } = useMediaSharing();
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
          headerTitle:
            subtitle || onTitlePress
              ? () => (
                  <HeaderTitleButton
                    accessibilityHint={titleAccessibilityHint}
                    onPress={onTitlePress}
                    subtitle={subtitle}
                    title={title}
                  />
                )
              : undefined,
          title,
        }}
      />
      {headerActions ? <HeaderActions actions={headerActions} /> : null}
      <StatusBar
        barStyle={colorScheme === "dark" ? "light-content" : "dark-content"}
      />
      <SystemFeedbackHost>
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
                    width >=
                    appChatLayout.conversationMaxWidth + appSpacing.huge
                      ? appSpacing.xl
                      : appSpacing.md,
                  width: "100%",
                }}
              >
                {toolbar}
                {notice ? (
                  <InlineMessage kind="notice" message={notice} />
                ) : null}
                <ChatMessageList
                  bottomInsetExtra={
                    FLOATING_COMPOSER_INSET_PLATFORM ? composerHeight : 0
                  }
                  conversation={conversation}
                  keyboardOverlap={keyboardOverlap}
                  keyboardState={keyboardState}
                  latestMessageRevealTarget={latestMessageRevealTarget}
                  onRetryFailedMessage={onRetryFailedMessage}
                  onShareAttachment={shareAttachment}
                  onRequestDeleteMessage={(input) =>
                    setPendingDestructive({ kind: "delete", ...input })
                  }
                  onRequestDiscardFailedMessage={(input) =>
                    setPendingDestructive({ kind: "discard", ...input })
                  }
                  onVisibleCanonicalMessages={onVisibleCanonicalMessages}
                />
                {footer}
                {/* iOS: the composer floats over the list (W1 Liquid Glass
                    overlay) instead of taking flex space below it -- taking
                    both would double the bottom inset, since the list already
                    reserves `composerHeight` via `bottomInsetExtra` above.
                    Android keeps the composer in normal flow (M3, no
                    overlay), matching `FLOATING_COMPOSER_INSET_PLATFORM`'s
                    existing iOS-only `bottomInsetExtra` gate. */}
                <View
                  pointerEvents="box-none"
                  style={
                    FLOATING_COMPOSER_INSET_PLATFORM
                      ? { bottom: 0, left: 0, position: "absolute", right: 0 }
                      : undefined
                  }
                >
                  <ChatComposer
                    controller={controller}
                    blocked={blocked}
                    onMessageCommitted={setLatestMessageRevealTarget}
                    attachmentController={attachmentController}
                    onHeightChange={setComposerHeight}
                  />
                </View>
                {/* Own Host: a modal alert presentation is a separate
                    SwiftUI/Compose subtree from the list/composer above
                    (DESIGN.md §4 interop), matching topic-list.tsx's
                    delete-confirm precedent. */}
                <Host matchContents seedColor={colors.primary}>
                  <ConfirmAlert
                    confirmLabel={destructiveCopy?.confirmLabel ?? "삭제"}
                    destructive
                    isPresented={pendingDestructive !== null}
                    message={destructiveCopy?.message}
                    onConfirm={() => {
                      const target = pendingDestructive;
                      setPendingDestructive(null);
                      if (!target) return;
                      if (target.kind === "delete") {
                        onDeleteMessage({
                          chatroomId: target.chatroomId,
                          serverMessageId: target.serverMessageId,
                        });
                      } else {
                        onDiscardFailedMessage({
                          clientMsgId: target.clientMsgId,
                        });
                      }
                    }}
                    onDismiss={() => setPendingDestructive(null)}
                    testID="chat-message-delete-confirm"
                    title={destructiveCopy?.title ?? ""}
                  />
                </Host>
              </View>
            )}
          </ChatKeyboardFrame>
        </SafeAreaView>
      </SystemFeedbackHost>
    </>
  );
}
