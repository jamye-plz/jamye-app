import { Pressable, Text, View } from "react-native";
import type { FlatList } from "react-native";
import { useCallback, useEffect, useMemo, useState } from "react";
import { KeyboardState } from "react-native-keyboard-controller";
import Animated, {
  scrollTo,
  useAnimatedReaction,
  useAnimatedRef,
  useSharedValue,
} from "react-native-reanimated";
import type { SharedValue } from "react-native-reanimated";

import { useAppTheme } from "@/core/theme/theme-provider";
import { appChatLayout, appChatMessage, appControl } from "@/core/theme/tokens";

import type { ChatConversation } from "../use-chat-conversation";
import type { ChatMessage } from "../model/chat-message-window";
import { ChatMessageRow } from "./chat-message-row";

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
  conversation,
  keyboardOverlap,
  keyboardState,
  latestMessageRevealTarget,
  onRetryFailedMessage,
}: Readonly<{
  conversation: ChatConversation;
  keyboardOverlap?: SharedValue<number>;
  keyboardState?: SharedValue<number>;
  latestMessageRevealTarget: string | null;
  onRetryFailedMessage: (
    input: Readonly<{
      clientMsgId: string;
      conversationId: string;
    }>,
  ) => void;
}>) {
  const { colors } = useAppTheme();
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
  const runScrollCommand = useCallback(
    (command: ChatMessageListScrollCommand | null) => {
      if (command !== null) {
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
        listRef.current?.scrollToOffset({ ...command, offset });
      }
    },
    [activeKeyboardOverlap, contentHeight, listRef, restingViewportHeight],
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

  useEffect(() => {
    scrollCoordinator.setRenderedMessageIds(renderedMessageIds);
    runScrollCommand(
      scrollCoordinator.setRevealTarget(renderedLatestMessageRevealTarget),
    );
  }, [
    renderedLatestMessageRevealTarget,
    renderedMessageIds,
    runScrollCommand,
    scrollCoordinator,
  ]);

  return (
    <View accessibilityLabel="채팅 메시지" style={{ flex: 1 }}>
      {conversation.initialPageStatus === "loading" ? (
        <Text accessibilityLiveRegion="polite" style={{ color: colors.text }}>
          메시지 불러오는 중...
        </Text>
      ) : null}
      {conversation.initialPageStatus === "error" ? (
        <View>
          <Text
            accessibilityLiveRegion="assertive"
            accessibilityRole="alert"
            style={{ color: colors.text }}
          >
            메시지를 불러오지 못했습니다.
          </Text>
          <Pressable
            accessibilityLabel="메시지 다시 불러오기"
            accessibilityRole="button"
            onPress={retryInitialPage}
            style={{
              justifyContent: "center",
              minHeight: appControl.standardHeight,
            }}
          >
            <Text style={{ color: colors.text }}>메시지 다시 불러오기</Text>
          </Pressable>
        </View>
      ) : null}
      {conversation.initialPageStatus === "ready" &&
      conversation.items.length === 0 ? (
        <Text accessibilityLiveRegion="polite" style={{ color: colors.text }}>
          아직 메시지가 없습니다.
        </Text>
      ) : null}
      {hasReadyMessages && conversation.olderPageStatus === "loading" ? (
        <Text accessibilityLiveRegion="polite" style={{ color: colors.text }}>
          이전 메시지 불러오는 중...
        </Text>
      ) : null}
      {hasReadyMessages && conversation.olderPageStatus === "error" ? (
        <Pressable
          accessibilityLabel="이전 메시지 다시 불러오기"
          accessibilityRole="button"
          onPress={retryOlderPage}
          style={{
            justifyContent: "center",
            minHeight: appControl.standardHeight,
          }}
        >
          <Text style={{ color: colors.text }}>이전 메시지 다시 불러오기</Text>
        </Pressable>
      ) : null}
      {hasReadyMessages ? (
        <Animated.FlatList
          data={conversation.items}
          inverted={false}
          keyExtractor={(item) => item.localId}
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
            if (nativeEvent.contentOffset.y <= 0) onStartReached();
          }}
          scrollEventThrottle={16}
          ref={listRef}
          renderItem={({ index, item }) => (
            <ChatMessageRow
              isGroupedWithPrevious={
                index > 0 &&
                conversation.items[index - 1]?.senderId === item.senderId
              }
              message={item}
              onRetryFailedMessage={onRetryFailedMessage}
            />
          )}
          style={{
            maxWidth: appChatLayout.conversationMaxWidth,
          }}
          contentContainerStyle={{ paddingBottom: appChatMessage.groupGap }}
        />
      ) : null}
    </View>
  );
}
