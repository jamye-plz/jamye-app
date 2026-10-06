import { View } from "react-native";
import type { FlatList, ViewToken } from "react-native";
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  KeyboardGestureArea,
  KeyboardState,
} from "react-native-keyboard-controller";
import Animated, {
  scrollTo,
  useAnimatedReaction,
  useAnimatedRef,
  useSharedValue,
} from "react-native-reanimated";
import type { SharedValue } from "react-native-reanimated";

import { appChatLayout, appChatMessage } from "@/core/theme/tokens";
import { useReduceMotionEnabled } from "@/shared/platform/use-reduce-motion-enabled";
import { EmptyState } from "@/shared/ui/empty-state";
import { InlineMessage } from "@/shared/ui/inline-message";
import { NativeButton } from "@/shared/ui/native-button";
import type { MessageAttachmentMedia } from "@/features/media/ui/message-attachments-view";

import type { ChatConversation } from "../use-chat-conversation";
import type { ChatMessage } from "../model/chat-message-window";
import { buildChatMessageRowMeta } from "../model/chat-message-grouping";
import {
  decideNewMessageScroll,
  isScrollNearBottom,
} from "../model/chat-new-message-scroll";
import { ChatMessageRow } from "./chat-message-row";
import { ChatNewMessagePill } from "./chat-new-message-pill";

type ChatMessageListScrollCommand = Readonly<{
  animated: true;
  offset: number;
}>;

type ChatMessageListScrollCoordinator = Readonly<{
  setContentHeight: (height: number) => ChatMessageListScrollCommand | null;
  setRenderedMessageIds: (
    localIds: readonly string[],
  ) => ChatMessageListScrollCommand | null;
  setRevealTarget: (
    localId: string | null,
  ) => ChatMessageListScrollCommand | null;
  setScrollOffset: (offset: number) => void;
  setViewportHeight: (height: number) => ChatMessageListScrollCommand | null;
}>;

export function getKeyboardAnchoredScrollOffset({
  contentHeight,
  keyboardOverlap,
  restingViewportHeight,
}: Readonly<{
  contentHeight: number;
  keyboardOverlap: number;
  restingViewportHeight: number;
}>): number {
  "worklet";
  const visibleViewportHeight = Math.max(
    0,
    restingViewportHeight - Math.max(0, keyboardOverlap),
  );
  return Math.max(0, contentHeight - visibleViewportHeight);
}

/**
 * R4/E11: while the viewport is pinned to the bottom (after a reveal, until
 * the user drags), a content-height change follows to the new bottom.
 * Returns `null` when not pinned, not measured yet, or nothing changed.
 */
export function getPinnedBottomFollowOffset({
  contentHeight,
  keyboardOverlap,
  pinned,
  previousContentHeight,
  restingViewportHeight,
}: Readonly<{
  contentHeight: number;
  keyboardOverlap: number;
  pinned: boolean;
  previousContentHeight: number | null;
  restingViewportHeight: number;
}>): number | null {
  "worklet";
  if (
    !pinned ||
    contentHeight <= 0 ||
    restingViewportHeight <= 0 ||
    contentHeight === previousContentHeight
  ) {
    return null;
  }
  return getKeyboardAnchoredScrollOffset({
    contentHeight,
    keyboardOverlap,
    restingViewportHeight,
  });
}

/**
 * R4: dragging the list pulls the keyboard down with the finger. On iOS the
 * scroll view does it (`interactive`); on Android the surrounding
 * `KeyboardGestureArea` does, and its gesture props are Android-only, so the
 * list sets nothing there. The iOS setting was missing: dragging never moved
 * the keyboard (device).
 */
export function resolveListKeyboardDismissMode(
  os: string | undefined,
): "interactive" | undefined {
  return os === "ios" ? "interactive" : undefined;
}

export function createChatMessageListScrollCoordinator(): ChatMessageListScrollCoordinator {
  let contentHeight: number | null = null;
  let viewportHeight: number | null = null;
  let scrollOffset = 0;
  let renderedMessageIds: readonly string[] = [];
  let renderedRevision = 0;
  let settledRevision = -1;
  let revealTarget: string | null = null;
  let lastRevealedTarget: string | null = null;

  const maximumOffset = () =>
    contentHeight === null || viewportHeight === null
      ? null
      : Math.max(0, contentHeight - viewportHeight);

  const clampOffset = (offset: number) => {
    const nonNegativeOffset = Math.max(0, offset);
    const maximum = maximumOffset();
    return maximum === null
      ? nonNegativeOffset
      : Math.min(nonNegativeOffset, maximum);
  };

  const createCommand = (offset: number): ChatMessageListScrollCommand => {
    scrollOffset = clampOffset(offset);
    return { animated: true, offset: scrollOffset };
  };

  const revealSettledTarget = (): ChatMessageListScrollCommand | null => {
    if (
      revealTarget === null ||
      revealTarget === lastRevealedTarget ||
      !renderedMessageIds.includes(revealTarget) ||
      settledRevision !== renderedRevision ||
      maximumOffset() === null
    ) {
      return null;
    }

    lastRevealedTarget = revealTarget;
    return createCommand(maximumOffset() ?? 0);
  };

  return {
    setContentHeight(height) {
      if (!Number.isFinite(height) || height < 0) return null;

      const didContentLayoutChange =
        contentHeight === null || contentHeight !== height;
      contentHeight = height;
      scrollOffset = clampOffset(scrollOffset);

      if (didContentLayoutChange) {
        settledRevision = renderedRevision;
      }

      return revealSettledTarget();
    },
    setRenderedMessageIds(localIds) {
      const didRenderedMessagesChange =
        localIds.length !== renderedMessageIds.length ||
        localIds.some(
          (localId, index) => localId !== renderedMessageIds[index],
        );

      if (didRenderedMessagesChange) {
        renderedMessageIds = [...localIds];
        renderedRevision += 1;
      }

      return null;
    },
    setRevealTarget(localId) {
      revealTarget = localId;
      return revealSettledTarget();
    },
    setScrollOffset(offset) {
      if (!Number.isFinite(offset)) return;
      scrollOffset = clampOffset(offset);
    },
    setViewportHeight(height) {
      if (!Number.isFinite(height) || height <= 0) return null;

      viewportHeight = height;
      scrollOffset = clampOffset(scrollOffset);
      return null;
    },
  };
}

export function ChatMessageList({
  bottomInsetExtra = 0,
  conversation,
  keyboardOverlap,
  keyboardState,
  latestMessageRevealTarget,
  onRetryFailedMessage,
  onShareAttachment,
  onRequestDeleteMessage,
  onRequestDiscardFailedMessage,
  onVisibleCanonicalMessages,
}: Readonly<{
  /** R4 layoutContract: extra bottom content inset on iOS only, equal to the
   * floating `ChatComposer`'s measured height (`chat-screen.tsx`'s
   * `onHeightChange`) -- Android's composer sits below the list in normal
   * flow, so it stays 0 there. */
  bottomInsetExtra?: number;
  conversation: ChatConversation;
  keyboardOverlap?: SharedValue<number>;
  keyboardState?: SharedValue<number>;
  latestMessageRevealTarget: string | null;
  onVisibleCanonicalMessages?: (ids: readonly string[]) => void;
  onRetryFailedMessage: (
    input: Readonly<{
      clientMsgId: string;
      conversationId: string;
    }>,
  ) => void;
  onShareAttachment: (attachment: MessageAttachmentMedia) => void;
  /** AC3/E11: forwarded to `ChatMessageRow` unchanged -- the screen owns the
   * `ConfirmAlert` and only calls the store's `deleteMessage` action once
   * the user confirms (`chat-screen.tsx`'s `ChatConversationScreen`). */
  onRequestDeleteMessage: (
    input: Readonly<{ chatroomId: string; serverMessageId: string }>,
  ) => void;
  /** AC5/A2: same "request, screen confirms" split as `onRequestDeleteMessage`. */
  onRequestDiscardFailedMessage: (
    input: Readonly<{ clientMsgId: string }>,
  ) => void;
}>) {
  const visibleCallback = useRef(onVisibleCanonicalMessages);
  useLayoutEffect(() => {
    visibleCallback.current = onVisibleCanonicalMessages;
  }, [onVisibleCanonicalMessages]);
  const viewabilityConfig = useMemo(
    () => ({ itemVisiblePercentThreshold: 80, minimumViewTime: 350 }),
    [],
  );
  const onViewableItemsChanged = useCallback(
    ({ viewableItems }: { viewableItems: ViewToken<ChatMessage>[] }) => {
      visibleCallback.current?.(
        viewableItems
          .filter((token) => token.isViewable && token.item.serverMessageId)
          .map((token) => token.item.serverMessageId!),
      );
    },
    [],
  );
  const [previewIds, setPreviewIds] = useState<ReadonlySet<string>>(
    () => new Set(),
  );
  const onPreviewItemsChanged = useCallback(
    ({ viewableItems }: { viewableItems: ViewToken<ChatMessage>[] }) => {
      const next = new Set(
        viewableItems
          .filter((token) => token.isViewable)
          .map((token) => token.item.localId),
      );
      setPreviewIds((previous) =>
        previous.size === next.size && [...next].every((id) => previous.has(id))
          ? previous
          : next,
      );
    },
    [],
  );
  const viewabilityConfigCallbackPairs = useMemo(
    () => [
      { viewabilityConfig, onViewableItemsChanged },
      {
        viewabilityConfig: {
          itemVisiblePercentThreshold: 1,
          minimumViewTime: 200,
        },
        onViewableItemsChanged: onPreviewItemsChanged,
      },
    ],
    [viewabilityConfig, onViewableItemsChanged, onPreviewItemsChanged],
  );
  const listRef = useAnimatedRef<FlatList<ChatMessage>>();
  const fallbackKeyboardOverlap = useSharedValue(0);
  const fallbackKeyboardState = useSharedValue(KeyboardState.UNKNOWN);
  const contentHeight = useSharedValue(0);
  const restingViewportHeight = useSharedValue(0);
  const activeKeyboardOverlap = keyboardOverlap ?? fallbackKeyboardOverlap;
  const activeKeyboardState = keyboardState ?? fallbackKeyboardState;
  const [scrollCoordinator] = useState(createChatMessageListScrollCoordinator);
  const renderedMessageIds = useMemo(
    () => conversation.items.map((item) => item.localId),
    [conversation.items],
  );
  const rowMeta = useMemo(
    () => buildChatMessageRowMeta(conversation.items),
    [conversation.items],
  );
  // R4: "맨 아래(임계값 내)를 보고 있으면 자동 스크롤, 위를 읽는 중이면 새
  // 메시지 버튼" -- tracked outside the reveal-target coordinator above (its
  // exact null/command contract stays untouched for E11's pinned
  // "commit-only reveal" unit tests) via the pure decision helper.
  const isNearBottomRef = useRef(true);
  const previousTailLocalIdRef = useRef<string | null>(
    renderedMessageIds.length > 0
      ? renderedMessageIds[renderedMessageIds.length - 1]!
      : null,
  );
  const [showNewMessagePill, setShowNewMessagePill] = useState(false);
  // Every reveal scrolls to the bottom once, but FlatList keeps replacing
  // estimated row heights with measured ones (and renders more rows) after
  // that scroll, so on device the one-shot offset landed short of the end.
  // After a reveal the list stays pinned to the bottom while its content
  // resizes, until the user drags (reading older messages is never
  // interrupted -- E11). The first reveal jumps instead of animating, so
  // opening a room shows the latest messages without a scroll animation.
  const pinnedToBottom = useSharedValue(false);
  const hasRevealedRef = useRef(false);
  // A11YM-AC1: reduce-motion keeps the reveal (offset still lands in the
  // right place) but drops the native scroll animation -- DESIGN.md §8 reduced motion
  // keeps state-change feedback, just not the motion carrying it.
  const reduceMotionEnabled = useReduceMotionEnabled();
  const runScrollCommand = useCallback(
    (command: ChatMessageListScrollCommand | null): boolean => {
      if (command === null) return false;
      const measuredContentHeight = contentHeight.get();
      const measuredRestingViewportHeight = restingViewportHeight.get();
      const offset =
        measuredContentHeight > 0 && measuredRestingViewportHeight > 0
          ? getKeyboardAnchoredScrollOffset({
              contentHeight: measuredContentHeight,
              keyboardOverlap: activeKeyboardOverlap.get(),
              restingViewportHeight: measuredRestingViewportHeight,
            })
          : command.offset;
      listRef.current?.scrollToOffset({
        animated:
          hasRevealedRef.current && command.animated && !reduceMotionEnabled,
        offset,
      });
      hasRevealedRef.current = true;
      pinnedToBottom.set(true);
      return true;
    },
    [
      activeKeyboardOverlap,
      contentHeight,
      listRef,
      pinnedToBottom,
      reduceMotionEnabled,
      restingViewportHeight,
    ],
  );
  const loadOlderFromTopEdge = () => {
    if (conversation.olderPageStatus === "idle" && conversation.hasMore) {
      void conversation.loadOlder();
    }
  };
  const retryOlderPage = () => {
    if (conversation.olderPageStatus === "error" && conversation.hasMore) {
      void conversation.loadOlder();
    }
  };
  const retryInitialPage = () => {
    if (conversation.initialPageStatus === "error") {
      void conversation.retryInitialPage();
    }
  };
  const onStartReached = loadOlderFromTopEdge;
  const hasReadyMessages =
    conversation.initialPageStatus === "ready" && conversation.items.length > 0;
  const renderedLatestMessageRevealTarget =
    latestMessageRevealTarget !== null &&
    conversation.items.some(
      (item) => item.localId === latestMessageRevealTarget,
    )
      ? latestMessageRevealTarget
      : null;

  useAnimatedReaction(
    () => ({
      overlap: activeKeyboardOverlap.value,
      state: activeKeyboardState.value,
    }),
    (keyboard, previousKeyboard) => {
      if (
        previousKeyboard !== null &&
        keyboard.overlap === previousKeyboard.overlap &&
        keyboard.state === previousKeyboard.state
      ) {
        return;
      }
      if (keyboard.state === KeyboardState.UNKNOWN && keyboard.overlap <= 0) {
        return;
      }
      if (contentHeight.value <= 0 || restingViewportHeight.value <= 0) {
        return;
      }

      scrollTo(
        listRef,
        0,
        getKeyboardAnchoredScrollOffset({
          contentHeight: contentHeight.value,
          keyboardOverlap: keyboard.overlap,
          restingViewportHeight: restingViewportHeight.value,
        }),
        false,
      );
    },
  );

  // The pinned follow runs on the UI thread when the content height lands
  // there: a JS `scrollToOffset` from `onContentSizeChange` fires before the
  // native scroll view takes the new size and gets clamped to the old one.
  useAnimatedReaction(
    () => contentHeight.value,
    (height, previousHeight) => {
      const offset = getPinnedBottomFollowOffset({
        contentHeight: height,
        keyboardOverlap: activeKeyboardOverlap.value,
        pinned: pinnedToBottom.value,
        previousContentHeight: previousHeight,
        restingViewportHeight: restingViewportHeight.value,
      });
      if (offset !== null) scrollTo(listRef, 0, offset, false);
    },
  );

  useEffect(() => {
    const nextTailLocalId =
      renderedMessageIds.length > 0
        ? renderedMessageIds[renderedMessageIds.length - 1]!
        : null;
    const newMessageDecision = decideNewMessageScroll({
      commitRevealTarget: renderedLatestMessageRevealTarget,
      isNearBottom: isNearBottomRef.current,
      nextTailLocalId,
      previousTailLocalId: previousTailLocalIdRef.current,
    });
    previousTailLocalIdRef.current = nextTailLocalId;
    if (newMessageDecision === "show-pill") setShowNewMessagePill(true);

    scrollCoordinator.setRenderedMessageIds(renderedMessageIds);
    runScrollCommand(
      scrollCoordinator.setRevealTarget(
        renderedLatestMessageRevealTarget ??
          (newMessageDecision === "auto-scroll" ? nextTailLocalId : null),
      ),
    );
  }, [
    renderedLatestMessageRevealTarget,
    renderedMessageIds,
    runScrollCommand,
    scrollCoordinator,
  ]);

  const scrollToLatest = () => {
    setShowNewMessagePill(false);
    isNearBottomRef.current = true;
    const tail = conversation.items[conversation.items.length - 1];
    if (tail) {
      runScrollCommand(scrollCoordinator.setRevealTarget(tail.localId));
    }
  };

  return (
    <View
      accessibilityLabel="채팅 메시지"
      style={{ flex: 1, position: "relative" }}
    >
      {conversation.initialPageStatus === "loading" ? (
        <InlineMessage kind="notice" message="메시지 불러오는 중..." />
      ) : null}
      {conversation.initialPageStatus === "error" ? (
        <InlineMessage kind="error" message="메시지를 불러오지 못했습니다.">
          <NativeButton
            label="메시지 다시 불러오기"
            onPress={retryInitialPage}
            variant="text"
          />
        </InlineMessage>
      ) : null}
      {conversation.initialPageStatus === "ready" &&
      conversation.items.length === 0 ? (
        <EmptyState
          symbol={{ android: "forum", ios: "bubble.left.and.bubble.right" }}
          title="아직 메시지가 없습니다."
        />
      ) : null}
      {hasReadyMessages && conversation.olderPageStatus === "loading" ? (
        <InlineMessage kind="notice" message="이전 메시지 불러오는 중..." />
      ) : null}
      {hasReadyMessages && conversation.olderPageStatus === "error" ? (
        <InlineMessage
          kind="error"
          message="이전 메시지를 불러오지 못했습니다."
        >
          <NativeButton
            label="이전 메시지 다시 불러오기"
            onPress={retryOlderPage}
            variant="text"
          />
        </InlineMessage>
      ) : null}
      {hasReadyMessages ? (
        <KeyboardGestureArea style={{ flex: 1 }}>
          <Animated.FlatList
            // @expo/ui Host children start at zero size on Android; clipping would
            // detach them before Compose reports their measured height.
            removeClippedSubviews={false}
            data={conversation.items}
            viewabilityConfigCallbackPairs={viewabilityConfigCallbackPairs}
            extraData={previewIds}
            inverted={false}
            keyExtractor={(item) => item.localId}
            keyboardDismissMode={resolveListKeyboardDismissMode(
              process.env.EXPO_OS,
            )}
            maintainVisibleContentPosition={{ minIndexForVisible: 0 }}
            onContentSizeChange={(_width, height) => {
              contentHeight.set(height);
              scrollCoordinator.setRenderedMessageIds(renderedMessageIds);
              runScrollCommand(scrollCoordinator.setContentHeight(height));
              runScrollCommand(
                scrollCoordinator.setRevealTarget(
                  renderedLatestMessageRevealTarget,
                ),
              );
            }}
            onLayout={({ nativeEvent }) => {
              const viewportHeight = nativeEvent.layout.height;
              const overlap = activeKeyboardOverlap.get();
              if (
                restingViewportHeight.get() <= 0 ||
                overlap <= 0.5 ||
                activeKeyboardState.get() === KeyboardState.CLOSED
              ) {
                restingViewportHeight.set(viewportHeight + overlap);
              }
              runScrollCommand(
                scrollCoordinator.setViewportHeight(viewportHeight),
              );
            }}
            onScroll={({ nativeEvent }) => {
              scrollCoordinator.setScrollOffset(nativeEvent.contentOffset.y);
              const nearBottom = isScrollNearBottom({
                contentHeight: nativeEvent.contentSize.height,
                contentOffset: nativeEvent.contentOffset.y,
                viewportHeight: nativeEvent.layoutMeasurement.height,
              });
              isNearBottomRef.current = nearBottom;
              if (nearBottom) setShowNewMessagePill(false);
              if (nativeEvent.contentOffset.y <= 0) onStartReached();
            }}
            onScrollBeginDrag={() => {
              pinnedToBottom.set(false);
            }}
            scrollEventThrottle={16}
            testID="chat-message-list"
            ref={listRef}
            renderItem={({ index, item }) => (
              <ChatMessageRow
                message={item}
                mediaPreviewEnabled={previewIds.has(item.localId)}
                onRetryFailedMessage={onRetryFailedMessage}
                onShareAttachment={onShareAttachment}
                onRequestDeleteMessage={onRequestDeleteMessage}
                onRequestDiscardFailedMessage={onRequestDiscardFailedMessage}
                rowMeta={rowMeta[index]!}
              />
            )}
            style={{
              maxWidth: appChatLayout.conversationMaxWidth,
            }}
            contentContainerStyle={{
              paddingBottom: appChatMessage.groupGap + bottomInsetExtra,
            }}
          />
        </KeyboardGestureArea>
      ) : null}
      {showNewMessagePill ? (
        <ChatNewMessagePill onPress={scrollToLatest} />
      ) : null}
    </View>
  );
}
