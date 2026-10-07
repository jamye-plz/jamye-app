import {
  AccessibilityInfo,
  Platform,
  StatusBar,
  Text,
  View,
  useWindowDimensions,
} from "react-native";
import { useEffect, useMemo, useRef, useState } from "react";
import type { RefObject, ReactNode } from "react";
import { SafeAreaView } from "react-native-safe-area-context";
import { Stack } from "expo-router";
import { Host } from "@expo/ui";

import { useAppTheme } from "@/core/theme/theme-provider";
import { appChatLayout, appSpacing } from "@/core/theme/tokens";
import type { ChatConversation } from "@/features/chat/model/chat-message-window";
import { destructiveConfirmCopy } from "@/features/chat/model/destructive-confirm-copy";
import type { PendingDestructive } from "@/features/chat/model/destructive-confirm-copy";
import { useMediaSharing } from "@/features/media/model/media-sharing";
import { ConfirmAlert } from "@/shared/ui/confirm-alert";
import { HeaderActions } from "@/shared/ui/header-actions";
import type { HeaderAction } from "@/shared/ui/header-actions";
import { HeaderTitleButton } from "@/shared/ui/header-title-button";

import type { MediaAttachmentController } from "@/features/media/ui/media-attachment-types";

import { ChatComposer } from "./chat-composer";
import { ChatKeyboardFrame as AndroidChatKeyboardFrame } from "./chat-keyboard-frame.android";
import { ChatKeyboardFrame as IosChatKeyboardFrame } from "./chat-keyboard-frame.ios";
import { ChatMessageList } from "./chat-message-list";
import type { ChatSendController } from "./use-chat-composer";
import { SystemFeedbackHost } from "@/shared/ui/system-feedback";

const ChatKeyboardFrame =
  Platform.OS === "ios" ? IosChatKeyboardFrame : AndroidChatKeyboardFrame;

/** R4 layoutContract: on iOS the composer's material floats over the list,
 * so the list's bottom content inset must grow by the composer's own
 * measured height (reported through `onHeightChange`); on Android the
 * composer sits in normal flow below the list, which already reserves its
 * own space, so no extra inset is added there. */
const FLOATING_COMPOSER_INSET_PLATFORM = process.env.EXPO_OS === "ios";

/** A11YF-AC1/A13: visually hidden (1x1, clipped, transparent text) but still
 * in the accessibility tree -- the real mounted element `headingRef`
 * attaches to so `AccessibilityInfo.sendAccessibilityEvent` has a
 * HostInstance to target. `opacity: 0` is deliberately avoided: iOS
 * accessibility can treat an alpha-0 view as hidden and skip it entirely,
 * which would make VoiceOver unable to reach this element at all. `color:
 * "transparent"` keeps the text itself invisible without hiding the element
 * from accessibility. The native `Stack.Screen` header (rendered through
 * `HeaderTitleButton`) stays the visible title; this duplicate announces the
 * same heading content for initial VoiceOver focus on route entry
 * (DESIGN.md "Screen and Main Heading", C16 VoiceOver order heading -> messages ->
 * composer -> send).
 *
 * iOS only (`supportsMainHeadingFocus`, A13): real-device TalkBack 16.0/API
 * 36 confirmed the double-reading this file's own C16 comment once flagged
 * only as a risk -- TalkBack's node tree surfaced this hidden heading with
 * the same text as the visible header title/subtitle, so it announced the
 * heading twice on route entry. Android now renders neither this element nor
 * the focus request below, so TalkBack's default order applies (Navigate up
 * -> header title -> messages -> composer) with no duplicate. */
const HIDDEN_HEADING_STYLE = {
  color: "transparent" as const,
  height: 1,
  overflow: "hidden" as const,
  position: "absolute" as const,
  width: 1,
} as const;

type MainHeadingTarget = Readonly<{
  nativeRef: RefObject<Text | null>;
  props: Readonly<{
    accessibilityRole: "header";
    children: string;
  }>;
}>;

/** A13: gates both the hidden heading (`HIDDEN_HEADING_STYLE`) and its
 * initial focus call to iOS. Exported as a plain function of an explicit
 * `os` argument (mirrors `resolveThemeColorForOs` in core/theme/tokens.ts
 * and `authIntroText` in features/auth/ui/auth-screen.tsx) because
 * jest-expo's babel caller always inlines `process.env.EXPO_OS` to the
 * literal "ios" (`jest-expo/src/resolveBabelOptions.js`), so no render in
 * this app's test suite can ever observe the Android branch -- this
 * function is the directly-testable seam for it instead. */
export function supportsMainHeadingFocus(os: string | undefined): boolean {
  return os === "ios";
}

/** A11YF-AC1: `sendAccessibilityEvent(handle, "focus")` is the Fabric-era
 * replacement for the deprecated `setAccessibilityFocus(reactTag)` --
 * `findNodeHandle` resolves through the pre-Fabric legacy path
 * (`legacySendAccessibilityEvent`,
 * `node_modules/react-native/Libraries/Components/AccessibilityInfo/AccessibilityInfo.js:444-467`)
 * and returns `null` for a Fabric host instance (this app has
 * `newArchEnabled=true`), so `setAccessibilityFocus` never actually fired.
 * `sendAccessibilityEvent` takes the mounted `HostInstance` directly.
 *
 * A13: only called on iOS (`supportsMainHeadingFocus`) -- RN Fabric maps
 * "focus" to `AccessibilityEvent.TYPE_VIEW_FOCUSED`
 * (`FabricUIManager.sendAccessibilityEventFromJS`), which TalkBack ignores
 * for a non-input view, so this call was already a no-op on Android before
 * this gate (confirmed on a real device, TalkBack 16.0, API 36). */
function defaultFocusMainHeading(target: MainHeadingTarget): void {
  const node = target.nativeRef.current;
  if (node !== null) {
    AccessibilityInfo.sendAccessibilityEvent(node, "focus");
  }
}

export function ChatConversationScreen({
  title,
  subtitle,
  titleAccessibilityHint,
  onTitlePress,
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
  conversation: ChatConversation;
  controller: ChatSendController;
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
  // DESIGN.md "Screen and Main Heading": the heading focus rule targets the header title, or on
  // the chat screen the header subtitle (sync status) when one is shown.
  const headingContent = subtitle ?? title;
  const headingTarget = useMemo<MainHeadingTarget>(
    () => ({
      nativeRef: headingRef,
      props: { accessibilityRole: "header", children: headingContent },
    }),
    [headingContent],
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

  // A11YF-AC1 (DESIGN.md "Screen and Main Heading" "once on route entry"): `headingTarget` is
  // recomputed whenever `headingContent` changes (e.g. the subtitle's sync
  // status updates while the user is reading), which would otherwise rerun
  // this effect and yank focus back to the heading mid-read. This ref guards
  // the one-time focus call per mount without limiting how often the
  // (still-visible-to-screen-readers) heading text itself updates.
  const hasFocusedHeadingRef = useRef(false);
  // A13: real-device TalkBack 16.0/API 36 heard this heading twice (same
  // text as the header) and never acted on this effect's focus request
  // anyway (RN Fabric's "focus" maps to `TYPE_VIEW_FOCUSED`, which TalkBack
  // ignores for a non-input view) -- so neither the heading nor this focus
  // call renders on Android; TalkBack's own default order (Navigate up ->
  // header title -> messages -> composer) applies there instead.
  const showsMainHeading = supportsMainHeadingFocus(process.env.EXPO_OS);
  useEffect(() => {
    if (!showsMainHeading) return;
    if (hasFocusedHeadingRef.current) return;
    hasFocusedHeadingRef.current = true;
    focusMainHeading(headingTarget);
  }, [focusMainHeading, headingTarget, showsMainHeading]);

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
                {showsMainHeading ? (
                  <Text
                    ref={headingRef}
                    style={HIDDEN_HEADING_STYLE}
                    {...headingTarget.props}
                  />
                ) : null}
                {toolbar}
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
