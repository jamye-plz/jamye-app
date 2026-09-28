import {
  Stack,
  useFocusEffect,
  useLocalSearchParams,
  useRouter,
} from "expo-router";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  RefreshControl,
  View,
} from "react-native";

import type { Notification } from "@/core/contracts/server";
import { useAppTheme } from "@/core/theme/theme-provider";
import { appSpacing } from "@/core/theme/tokens";
import { formatJamyeTimeLabel } from "@/shared/datetime/relative-labels";
import { AppSymbol, APP_SYMBOLS } from "@/shared/ui/app-symbol";
import { AppText } from "@/shared/ui/app-text";
import { EmptyState } from "@/shared/ui/empty-state";
import { InlineMessage } from "@/shared/ui/inline-message";
import { NativeButton } from "@/shared/ui/native-button";
import {
  SystemFeedbackHost,
  useSystemFeedback,
} from "@/shared/ui/system-feedback";

import { routeForNotification } from "../model/push-tap-handoff";
import {
  getNotificationContextLine,
  getNotificationCopy,
  getNotificationKind,
} from "../model/notification-copy";
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

const PUSH_FAILURE_MESSAGE = {
  failed: "알림을 열 수 없습니다.",
  inaccessible: "더 이상 접근할 수 없는 알림입니다.",
} as const;

/**
 * Fallback for platforms without a native swipe/context-menu affordance
 * (web): a plain RN `FlatList` with a simple text mark-read action instead
 * of N2's swipe/long-press menu. iOS and Android resolve to their own files
 * (`notifications-inbox-screen.ios.tsx` / `.android.tsx`), which this file
 * exists only so `tsc`/bundlers resolving the bare specifier (no
 * `moduleSuffixes`) have something to find -- see the same pattern in
 * `native-list.tsx` / `action-list-item.tsx` / `system-feedback.tsx`.
 */
export function NotificationsInboxScreen({
  store = defaultNotificationsStore,
}: Readonly<{ store?: NotificationsStore }> = {}) {
  return (
    <SystemFeedbackHost>
      <NotificationsInboxScreenBody store={store} />
    </SystemFeedbackHost>
  );
}

function NotificationsInboxScreenBody({
  store,
}: Readonly<{ store: NotificationsStore }>) {
  const { colors } = useAppTheme();
  const { showNotice } = useSystemFeedback();
  const state = useSyncExternalStore(store.subscribe, store.getState);
  const router = useRouter();
  const params = useLocalSearchParams<{ pushOpenFailure?: string }>();
  const [resolvingId, setResolvingId] = useState<string | null>(null);
  const shownPushFailureRef = useRef(false);

  useFocusEffect(
    useCallback(() => {
      void store.actions.refresh();
    }, [store]),
  );

  useEffect(() => {
    const failure = params.pushOpenFailure;
    if (
      (failure !== "inaccessible" && failure !== "failed") ||
      shownPushFailureRef.current
    )
      return;
    shownPushFailureRef.current = true;
    if (failure === "failed") {
      showNotice({
        actionLabel: "다시 시도",
        message: PUSH_FAILURE_MESSAGE.failed,
        onAction: () => void store.actions.refresh(),
      });
    } else {
      showNotice({ message: PUSH_FAILURE_MESSAGE.inaccessible });
    }
  }, [params.pushOpenFailure, showNotice, store]);

  async function handlePress(notification: Notification): Promise<void> {
    if (resolvingId !== null) return;
    setResolvingId(notification.id);
    try {
      await store.actions.markRead(notification.id);
      if (notification.type === "other") return;
      if (!notification.conversationId) {
        showNotice({ message: PUSH_FAILURE_MESSAGE.inaccessible });
        return;
      }
      const destination = await store.actions.resolveDestination(
        notification.conversationId,
      );
      if (destination.status !== "resolved") {
        showNotice({ message: PUSH_FAILURE_MESSAGE.inaccessible });
        return;
      }
      const route = routeForNotification(destination, notification.type);
      if (route) router.push(route);
    } catch {
      showNotice({
        actionLabel: "다시 시도",
        message: PUSH_FAILURE_MESSAGE.failed,
        onAction: () => void handlePress(notification),
      });
    } finally {
      setResolvingId(null);
    }
  }

  const firstLoad = state.status === "loading" && state.items.length === 0;
  const empty = state.status === "ready" && state.items.length === 0;

  return (
    <>
      <Stack.Screen options={{ headerLargeTitle: true, title: "알림함" }} />
      {firstLoad ? (
        <View testID="notifications-loading">
          <ActivityIndicator />
        </View>
      ) : (
        <FlatList
          contentContainerStyle={{ gap: appSpacing.md, padding: appSpacing.md }}
          data={state.items}
          keyExtractor={(item) => item.id}
          ListEmptyComponent={
            empty ? (
              <EmptyState
                description="새 소식이 도착하면 여기에 표시됩니다."
                symbol={APP_SYMBOLS.notification}
                title="아직 알림이 없습니다."
              />
            ) : null
          }
          ListFooterComponent={
            state.error ? (
              <View style={{ gap: appSpacing.sm }}>
                <InlineMessage kind="error" message={ERROR_COPY[state.error]} />
                <NativeButton
                  label="다시 시도"
                  onPress={() => void store.actions.refresh()}
                  variant="text"
                />
              </View>
            ) : null
          }
          onEndReached={() => void store.actions.loadMore()}
          refreshControl={
            <RefreshControl
              onRefresh={() => void store.actions.refresh()}
              refreshing={false}
            />
          }
          renderItem={({ item }) => {
            const copy = getNotificationCopy(item.type, item.args);
            const contextLine = getNotificationContextLine(item.args);
            const unread = item.readAt === null;
            const kind = getNotificationKind(item.type);
            const iconName = kind === "other" ? "notification" : kind;
            const time = formatJamyeTimeLabel(item.createdAt, {
              mode: "notification",
              now: new Date(),
            });
            const busy = resolvingId === item.id;
            return (
              <View style={{ gap: appSpacing.xs }}>
                <Pressable
                  accessibilityRole="button"
                  disabled={busy}
                  onPress={() => void handlePress(item)}
                  style={{
                    alignItems: "center",
                    flexDirection: "row",
                    gap: appSpacing.sm,
                  }}
                  testID={`notification-row-${item.id}`}
                >
                  <AppSymbol
                    name={iconName}
                    tintColor={unread ? colors.primary : colors.textMuted}
                  />
                  <View style={{ flex: 1, gap: 2 }}>
                    <AppText
                      style={unread ? { fontWeight: "700" } : undefined}
                      variant="headline"
                    >
                      {copy.title}
                    </AppText>
                    <AppText color={colors.textMuted} variant="subheadline">
                      {copy.body}
                    </AppText>
                    {contextLine ? (
                      <AppText color={colors.textMuted} variant="footnote">
                        {contextLine}
                      </AppText>
                    ) : null}
                  </View>
                  {busy ? (
                    <ActivityIndicator
                      size="small"
                      testID={`notification-row-busy-${item.id}`}
                    />
                  ) : (
                    <AppText color={colors.textMuted} variant="footnote">
                      {time}
                    </AppText>
                  )}
                </Pressable>
                {unread ? (
                  <NativeButton
                    label="읽음으로 표시"
                    onPress={() => void store.actions.markRead(item.id)}
                    variant="text"
                  />
                ) : null}
              </View>
            );
          }}
        />
      )}
    </>
  );
}
