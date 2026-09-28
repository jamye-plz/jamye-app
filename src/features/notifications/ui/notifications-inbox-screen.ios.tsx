import { Host, ListItem } from "@expo/ui";
import {
  Button,
  ContextMenu,
  List as SwiftUIList,
  SwipeActions,
  Text as SwiftText,
} from "@expo/ui/swift-ui";
import {
  accessibilityLabel,
  bold,
  font,
  foregroundStyle,
  listStyle,
  refreshable,
} from "@expo/ui/swift-ui/modifiers";
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
import { ActivityIndicator, View } from "react-native";

import type { Notification } from "@/core/contracts/server";
import { useAppTheme } from "@/core/theme/theme-provider";
import { formatJamyeTimeLabel } from "@/shared/datetime/relative-labels";
import { AppSymbol } from "@/shared/ui/app-symbol";
import { LoadSentinel } from "@/shared/ui/load-sentinel";
import {
  StandardStateView,
  StandardStateViewErrorRow,
} from "@/shared/ui/standard-state-view";
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

/** N4: fixed copy for the two failure shapes, shared by row taps and the
 * push-tap -> inbox handoff (listener passes one of these keys as a route
 * param). */
const PUSH_FAILURE_MESSAGE = {
  failed: "알림을 열 수 없습니다.",
  inaccessible: "더 이상 접근할 수 없는 알림입니다.",
} as const;

export function NotificationsInboxScreen({
  store = defaultNotificationsStore,
}: Readonly<{ store?: NotificationsStore }> = {}) {
  return (
    <SystemFeedbackHost>
      <NotificationsInboxScreenBody store={store} />
    </SystemFeedbackHost>
  );
}

/**
 * iOS: a plain, screen-width `List` (N1 -- deliberately not the shared
 * `NativeList`, whose inset-grouped SwiftUI style is wrong for a mail-app-like
 * inbox; this is its own minimal `listStyle("plain")` list so every other
 * `NativeList` consumer stays untouched). Rows are a custom `ListItem`
 * composition (not the kit `ActionListItem`, whose `title`/string-only
 * `supportingText`/no-`trailing` contract can't carry an icon + bold title +
 * body + N3 context line + right-aligned time) wrapped in the same
 * `SwipeActions`(leading)+`ContextMenu` shell `ActionListItem` itself uses,
 * so unread rows still get the N2 leading-swipe/long-press "읽음" affordance.
 */
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

  // N4: a push tap that ended on an unreachable/failed destination hands off
  // to this screen via a minimal, non-sensitive route param (listener ->
  // inbox); show the matching notice exactly once per mount.
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
    // Destination resolution can take a while on a cache miss (it may page
    // through the user's chatrooms), so the tapped row shows a busy state
    // and ignores re-taps until the outcome is known.
    if (resolvingId !== null) return;
    setResolvingId(notification.id);
    try {
      await store.actions.markRead(notification.id);
      // N4: "other" never navigates -- mark-read only, no notice.
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
  const errorWithNoRows =
    !firstLoad && state.error !== null && state.items.length === 0;
  const errorMessage = state.error ? ERROR_COPY[state.error] : "";

  return (
    <>
      <Stack.Screen options={{ headerLargeTitle: true, title: "알림함" }} />
      <Host seedColor={colors.primary} style={{ flex: 1 }}>
        {firstLoad ? (
          <StandardStateView kind="loading" testID="notifications-loading" />
        ) : empty ? (
          <StandardStateView
            description="새 소식이 도착하면 여기에 표시됩니다."
            kind="empty"
            systemImage="notification"
            testID="notifications-empty"
            title="아직 알림이 없습니다."
          />
        ) : errorWithNoRows ? (
          <StandardStateView
            actions={[
              {
                label: "다시 시도",
                onPress: () => void store.actions.refresh(),
                primary: true,
              },
            ]}
            description={errorMessage}
            kind="error"
            systemImage="error"
            testID="notifications-error"
            title="알림을 불러오지 못했습니다"
          />
        ) : (
          <SwiftUIList
            modifiers={[
              listStyle("plain"),
              refreshable(() => store.actions.refresh()),
            ]}
            testID="notifications-list"
          >
            {state.error ? (
              <StandardStateViewErrorRow
                message={errorMessage}
                onRetry={() => void store.actions.refresh()}
                testID="notifications-error-row"
              />
            ) : null}
            {state.items.map((item) => (
              <NotificationRow
                busy={resolvingId === item.id}
                key={item.id}
                notification={item}
                now={new Date()}
                onMarkRead={() => void store.actions.markRead(item.id)}
                onPress={() => void handlePress(item)}
              />
            ))}
            {state.nextCursor !== null ? (
              <LoadSentinel
                isLoading={state.loadingMore}
                onVisible={() => void store.actions.loadMore()}
                testID="notifications-load-more"
              />
            ) : null}
          </SwiftUIList>
        )}
      </Host>
    </>
  );
}

function NotificationRow({
  notification,
  onPress,
  onMarkRead,
  busy,
  now,
}: Readonly<{
  notification: Notification;
  onPress: () => void;
  onMarkRead: () => void;
  busy: boolean;
  now: Date;
}>) {
  const { colors } = useAppTheme();
  const copy = getNotificationCopy(notification.type, notification.args);
  const contextLine = getNotificationContextLine(notification.args);
  const unread = notification.readAt === null;
  const kind = getNotificationKind(notification.type);
  const iconName = kind === "other" ? "notification" : kind;
  const time = formatJamyeTimeLabel(notification.createdAt, {
    mode: "notification",
    now,
  });
  const label = [
    copy.title,
    copy.body,
    contextLine,
    time,
    unread ? "읽지 않음" : null,
  ]
    .filter((part): part is string => Boolean(part))
    .join(", ");
  // Mail-style hierarchy: title in the label color, preview and N3 line in
  // the secondary style, the time as a smaller secondary footnote.
  const secondaryStyle = [
    foregroundStyle({ style: "secondary", type: "hierarchical" }),
  ] as const;

  const row = (
    <ListItem
      leading={
        <View style={{ alignItems: "center", flexDirection: "row", gap: 6 }}>
          <View
            style={{
              backgroundColor: unread ? colors.primary : "transparent",
              borderRadius: 4,
              height: 8,
              width: 8,
            }}
          />
          <AppSymbol
            name={iconName}
            tintColor={unread ? colors.primary : colors.textMuted}
          />
        </View>
      }
      modifiers={[accessibilityLabel(label)]}
      onPress={onPress}
      testID={`notification-row-${notification.id}`}
      trailing={
        busy ? (
          <ActivityIndicator
            size="small"
            testID={`notification-row-busy-${notification.id}`}
          />
        ) : (
          <SwiftText
            modifiers={[...secondaryStyle, font({ textStyle: "subheadline" })]}
          >
            {time}
          </SwiftText>
        )
      }
    >
      <SwiftText modifiers={unread ? [bold()] : undefined}>
        {copy.title}
      </SwiftText>
      <SwiftText modifiers={[...secondaryStyle]}>{copy.body}</SwiftText>
      {contextLine ? (
        <SwiftText modifiers={[...secondaryStyle]}>{contextLine}</SwiftText>
      ) : null}
    </ListItem>
  );

  if (!unread) return row;

  return (
    <SwipeActions>
      <ContextMenu>
        <ContextMenu.Trigger>{row}</ContextMenu.Trigger>
        <ContextMenu.Items>
          <Button
            label="읽음으로 표시"
            onPress={onMarkRead}
            systemImage="envelope.open"
          />
        </ContextMenu.Items>
      </ContextMenu>
      <SwipeActions.Actions edge="leading">
        <Button label="읽음" onPress={onMarkRead} systemImage="envelope.open" />
      </SwipeActions.Actions>
    </SwipeActions>
  );
}
