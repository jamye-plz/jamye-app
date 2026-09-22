import { useRef } from "react";
import type { ReactNode } from "react";
import {
  FlatList,
  Platform,
  Pressable,
  RefreshControl,
  StyleSheet,
  View,
} from "react-native";
import ReanimatedSwipeable from "react-native-gesture-handler/ReanimatedSwipeable";
import type { SwipeableMethods } from "react-native-gesture-handler/ReanimatedSwipeable";

import type { Topic } from "@/core/contracts/server";
import { useAppTheme } from "@/core/theme/theme-provider";
import { appRadii, appSpacing } from "@/core/theme/tokens";
import { AppSymbol } from "@/shared/ui/app-symbol";
import { AppText } from "@/shared/ui/app-text";
import { EmptyState } from "@/shared/ui/empty-state";
import { NativeButton } from "@/shared/ui/native-button";

import type { TopicListProps } from "./topic-list.types";

export type * from "./topic-list.types";

/**
 * Topic list for Android (and the default platform): a virtualized FlatList of
 * swipeable cards. Tap opens the topic's chatroom; a trailing swipe reveals
 * 상세 and, when a delete handler exists, 삭제. iOS resolves to `topic-list.ios.tsx` (SwiftUI List + SwipeActions)
 * because expo-ui's Compose layer has no swipe-to-reveal primitive yet
 * (Material 3 `SwipeToDismissBox` is the Compose counterpart).
 */
export function TopicList({
  empty,
  loadMore,
  onDelete,
  onOpenChat,
  onOpenDetail,
  onRefresh,
  refreshing,
  topics,
}: TopicListProps) {
  return (
    <FlatList
      // @expo/ui Host children start at zero size on Android; clipping would
      // detach them before Compose reports their measured height.
      removeClippedSubviews={false}
      accessibilityLabel="주제 목록"
      contentContainerStyle={styles.content}
      contentInsetAdjustmentBehavior="automatic"
      data={topics}
      keyExtractor={(item) => item.id}
      ListEmptyComponent={
        empty ? (
          <EmptyState
            symbol={{ android: "forum", ios: "text.bubble" }}
            title="선택한 날짜에 주제가 없습니다."
          />
        ) : null
      }
      ListFooterComponent={
        loadMore ? (
          <NativeButton
            busy={loadMore.busy}
            disabled={loadMore.disabled}
            label="주제 더 보기"
            onPress={loadMore.onPress}
            variant="text"
          />
        ) : null
      }
      refreshControl={
        <RefreshControl
          onRefresh={() => void onRefresh()}
          refreshing={refreshing}
        />
      }
      renderItem={({ item }) => (
        <TopicRow
          item={item}
          onOpenChat={() => onOpenChat(item)}
          onDelete={onDelete ? () => onDelete(item) : undefined}
          onOpenDetail={() => onOpenDetail(item)}
        />
      )}
      style={styles.list}
    />
  );
}

/**
 * One topic as a swipeable card. Every swipe action is also exposed as an
 * accessibility action so screen readers never depend on the swipe.
 */
function TopicRow({
  item,
  onDelete,
  onOpenChat,
  onOpenDetail,
}: Readonly<{
  item: Topic;
  onDelete?: () => void;
  onOpenChat: () => void;
  onOpenDetail: () => void;
}>) {
  const { colors } = useAppTheme();
  const swipeable = useRef<SwipeableMethods>(null);
  const act = (run: () => void) => () => {
    swipeable.current?.close();
    run();
  };
  const renderActions = (): ReactNode => (
    <View style={styles.rowActions}>
      <Pressable
        accessibilityLabel={`주제 ${item.title} 상세`}
        accessibilityRole="button"
        onPress={act(onOpenDetail)}
        style={({ pressed }) => [
          styles.rowAction,
          { backgroundColor: colors.surfaceMuted, opacity: pressed ? 0.7 : 1 },
        ]}
      >
        <AppSymbol name="info" size={22} tintColor={colors.text} />
        <AppText color={colors.text} variant="caption">
          상세
        </AppText>
      </Pressable>
      {onDelete ? (
        <Pressable
          accessibilityLabel={`주제 ${item.title} 삭제`}
          accessibilityRole="button"
          onPress={act(onDelete)}
          style={({ pressed }) => [
            styles.rowAction,
            {
              backgroundColor: colors.surfaceMuted,
              opacity: pressed ? 0.7 : 1,
            },
          ]}
        >
          <AppSymbol name="delete" size={22} tintColor={colors.error} />
          <AppText color={colors.error} variant="caption">
            삭제
          </AppText>
        </Pressable>
      ) : null}
    </View>
  );
  return (
    <ReanimatedSwipeable
      containerStyle={[
        styles.card,
        { backgroundColor: colors.secondaryGroupedBackground },
      ]}
      friction={2}
      overshootRight={false}
      ref={swipeable}
      renderRightActions={renderActions}
      rightThreshold={40}
    >
      <Pressable
        accessibilityActions={[
          { label: "대화방 열기", name: "activate" },
          { label: "주제 상세", name: "detail" },
          ...(onDelete ? [{ label: "주제 삭제", name: "delete" }] : []),
        ]}
        accessibilityHint={`대화방을 엽니다. 왼쪽으로 밀면 ${onDelete ? "상세·삭제" : "상세"} 동작이 나타납니다.`}
        accessibilityLabel={`주제 ${item.title}, 작성자 ${item.authorNickname}`}
        accessibilityRole="button"
        onAccessibilityAction={(event) => {
          if (event.nativeEvent.actionName === "detail") onOpenDetail();
          else if (event.nativeEvent.actionName === "delete") onDelete?.();
          else onOpenChat();
        }}
        onPress={onOpenChat}
        style={({ pressed }) => [
          styles.row,
          pressed ? { backgroundColor: colors.fill } : null,
        ]}
      >
        <View style={styles.textColumn}>
          <AppText variant="headline">{item.title}</AppText>
          <AppText color={colors.textMuted} variant="subheadline">
            {topicSubtitle(item)}
          </AppText>
        </View>
        {item.tags.length ? (
          <AppText color={colors.textMuted} variant="caption">
            {item.tags.map((tag) => `#${tag.tag}`).join(" ")}
          </AppText>
        ) : null}
      </Pressable>
    </ReanimatedSwipeable>
  );
}

export function topicSubtitle(topic: Topic): string {
  return `${topic.authorNickname} · ${topic.status === "seed" ? "새 주제" : "이야기 있음"}`;
}

const styles = StyleSheet.create({
  card: {
    borderCurve: "continuous",
    borderRadius: appRadii.medium,
    overflow: "hidden",
  },
  content: {
    alignSelf: "center",
    gap: appSpacing.sm,
    maxWidth: 720,
    padding: appSpacing.md,
    paddingBottom: Platform.OS === "android" ? appSpacing.xxxl : appSpacing.md,
    width: "100%",
  },
  list: { flex: 1 },
  row: {
    alignItems: "center",
    flexDirection: "row",
    gap: appSpacing.sm,
    minHeight: 64,
    paddingHorizontal: appSpacing.md,
    paddingVertical: appSpacing.sm,
  },
  rowAction: {
    alignItems: "center",
    gap: appSpacing.xxs,
    justifyContent: "center",
    width: 88,
  },
  rowActions: { flexDirection: "row" },
  textColumn: { flex: 1, gap: appSpacing.xxs },
});
