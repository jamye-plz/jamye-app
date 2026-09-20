import { Stack, useFocusEffect, useRouter } from "expo-router";
import { useCallback, useState, useSyncExternalStore } from "react";
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  RefreshControl,
  StyleSheet,
  View,
} from "react-native";

import type { Notification } from "@/core/contracts/server";
import { useAppTheme } from "@/core/theme/theme-provider";
import { appRadii, appSpacing } from "@/core/theme/tokens";
import { APP_SYMBOLS } from "@/shared/ui/app-symbol";
import { AppText } from "@/shared/ui/app-text";
import { EmptyState } from "@/shared/ui/empty-state";
import { InlineMessage } from "@/shared/ui/inline-message";
import { NativeButton } from "@/shared/ui/native-button";

import type { NotificationDestination } from "../data/notification-destination-resolver";
import { getNotificationCopy } from "../model/notification-copy";
import type {
  NotificationsErrorOutcome,
  NotificationsStore,
} from "../model/notifications-store";
import { notificationsStore as defaultNotificationsStore } from "../model/notifications-store";

const ERROR_COPY: Record<NotificationsErrorOutcome, string> = {
  forbidden: "이 알림함에 접근할 수 없습니다.",
  invalid_response: "서버 응답을 확인할 수 없습니다.",
  network: "네트워크 연결을 확인해 주세요.",
  not_found: "알림을 찾을 수 없습니다.",
  unauthorized: "다시 로그인해 주세요.",
  unavailable: "서버를 사용할 수 없습니다. 잠시 후 다시 시도해 주세요.",
  unknown: "알 수 없는 오류가 발생했습니다.",
  validation: "요청을 처리할 수 없습니다.",
};

export function NotificationsInboxScreen({
  store = defaultNotificationsStore,
}: Readonly<{ store?: NotificationsStore }> = {}) {
  const state = useSyncExternalStore(store.subscribe, store.getState);
  const { colors } = useAppTheme();
  const router = useRouter();
  const [inaccessibleId, setInaccessibleId] = useState<string | null>(null);
  const [resolvingId, setResolvingId] = useState<string | null>(null);

  useFocusEffect(
    useCallback(() => {
      void store.actions.refresh();
    }, [store]),
  );

  async function handlePress(notification: Notification): Promise<void> {
    // Destination resolution can take a while on a cache miss (it may page
    // through the user's chatrooms), so the tapped row shows a busy state
    // and ignores re-taps until the outcome is known.
    if (resolvingId !== null) return;
    setInaccessibleId(null);
    setResolvingId(notification.id);
    try {
      await store.actions.markRead(notification.id);
      if (!notification.conversationId) {
        setInaccessibleId(notification.id);
        return;
      }
      const destination = await store.actions.resolveDestination(
        notification.conversationId,
      );
      if (destination.status !== "resolved") {
        setInaccessibleId(notification.id);
        return;
      }
      navigateToDestination(destination);
    } finally {
      setResolvingId(null);
    }
  }

  function navigateToDestination(
    destination: Extract<NotificationDestination, { status: "resolved" }>,
  ): void {
    if (destination.kind === "topic") {
      router.push({
        params: {
          groupId: destination.groupId,
          topicId: destination.topicId ?? "",
        },
        pathname: "/groups/[groupId]/topics/[topicId]",
      });
    } else {
      router.push({
        params: {
          chatroomId: destination.chatroomId,
          groupId: destination.groupId,
        },
        pathname: "/groups/[groupId]/chatrooms/[chatroomId]",
      });
    }
  }

  return (
    <>
      <Stack.Screen options={{ headerLargeTitle: true, title: "알림함" }} />
      <FlatList
        // @expo/ui Host children start at zero size on Android; matches the
        // group-list-screen.tsx precedent even though this screen has no
        // @expo/ui Host of its own today (kept consistent in case one is
        // added later, e.g. a filter control).
        removeClippedSubviews={false}
        contentContainerStyle={{
          alignSelf: "center",
          gap: appSpacing.md,
          maxWidth: 720,
          padding: appSpacing.md,
          width: "100%",
        }}
        contentInsetAdjustmentBehavior="automatic"
        data={state.items}
        keyExtractor={(item) => item.id}
        ListEmptyComponent={
          state.status === "ready" ? (
            <EmptyState
              description="새 소식이 도착하면 여기에 표시됩니다."
              symbol={APP_SYMBOLS.notification}
              title="아직 알림이 없습니다."
            />
          ) : null
        }
        ListFooterComponent={
          <View style={{ gap: appSpacing.md }}>
            {state.error ? (
              <InlineMessage kind="error" message={ERROR_COPY[state.error]} />
            ) : null}
            {state.error ? (
              <NativeButton
                label="알림 다시 불러오기"
                onPress={() => void store.actions.refresh()}
                variant="text"
              />
            ) : null}
            {state.nextCursor !== null ? (
              <NativeButton
                busy={state.loadingMore}
                label="알림 더 보기"
                onPress={() => void store.actions.loadMore()}
                variant="text"
              />
            ) : null}
          </View>
        }
        ListHeaderComponent={
          state.status === "loading" ? (
            <InlineMessage kind="notice" message="알림 불러오는 중…" />
          ) : null
        }
        onEndReached={() => void store.actions.loadMore()}
        onEndReachedThreshold={0.4}
        refreshControl={
          <RefreshControl
            onRefresh={() => void store.actions.refresh()}
            refreshing={state.status === "loading"}
            tintColor={colors.primary as string}
          />
        }
        renderItem={({ item }) => (
          <NotificationRow
            busy={resolvingId === item.id}
            inaccessible={inaccessibleId === item.id}
            notification={item}
            onPress={() => void handlePress(item)}
          />
        )}
      />
    </>
  );
}

/**
 * Inlined by design (r3 simplicity review): no standalone `notification-row.tsx`
 * is created, mirroring the groups/topics precedent of inlining a single-use
 * row into its owning list screen. Covered entirely by this screen's tests.
 */
function NotificationRow({
  notification,
  onPress,
  inaccessible,
  busy,
}: Readonly<{
  notification: Notification;
  onPress: () => void;
  inaccessible: boolean;
  busy: boolean;
}>) {
  const { colors } = useAppTheme();
  const copy = getNotificationCopy(notification.type, notification.args);
  const unread = notification.readAt === null;

  return (
    <View style={{ gap: appSpacing.xs }}>
      <Pressable
        accessibilityLabel={
          unread
            ? `${copy.title}, ${copy.body}, 읽지 않음`
            : `${copy.title}, ${copy.body}`
        }
        accessibilityRole="button"
        accessibilityState={{ busy, disabled: busy }}
        disabled={busy}
        onPress={onPress}
        style={({ pressed }) => [
          styles.row,
          {
            backgroundColor: pressed ? colors.fill : colors.surface,
            borderCurve: "continuous",
            borderRadius: appRadii.medium,
          },
        ]}
      >
        <View
          style={[
            styles.unreadDot,
            { backgroundColor: unread ? colors.primary : "transparent" },
          ]}
        />
        <View style={styles.textColumn}>
          {/* Unread rows are distinguished by weight + the accessibility
           * label above, not by dot color alone (WCAG AA). */}
          <AppText
            style={unread ? styles.unreadTitle : undefined}
            variant="headline"
          >
            {copy.title}
          </AppText>
          <AppText color={colors.textMuted} variant="subheadline">
            {copy.body}
          </AppText>
        </View>
        {busy ? (
          <ActivityIndicator
            color={colors.primary as string}
            size="small"
            testID={`notification-row-busy-${notification.id}`}
          />
        ) : null}
      </Pressable>
      {inaccessible ? (
        <InlineMessage
          kind="notice"
          message="더 이상 접근할 수 없는 알림입니다."
        />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    alignItems: "center",
    flexDirection: "row",
    gap: appSpacing.sm,
    padding: appSpacing.sm,
  },
  textColumn: {
    flex: 1,
    gap: appSpacing.xs,
  },
  unreadDot: {
    borderRadius: 5,
    height: 10,
    width: 10,
  },
  unreadTitle: {
    fontWeight: "700",
  },
});
