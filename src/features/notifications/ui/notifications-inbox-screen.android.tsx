import { Host } from "@expo/ui";
import {
  Badge,
  BadgedBox,
  CircularProgressIndicator,
  Column,
  DropdownMenu,
  DropdownMenuItem,
  Icon,
  IconButton,
  ListItem,
  Text as ComposeText,
} from "@expo/ui/jetpack-compose";
import {
  combinedClickable,
  size,
  testID as testIDModifier,
} from "@expo/ui/jetpack-compose/modifiers";
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
import type { ImageSourcePropType } from "react-native";

import type { Notification } from "@/core/contracts/server";
import { useAppTheme, useAppThemeOrSystem } from "@/core/theme/theme-provider";
import { androidThemeColors } from "@/core/theme/tokens";
import { formatJamyeTimeLabel } from "@/shared/datetime/relative-labels";
import { LoadSentinel } from "@/shared/ui/load-sentinel";
import { NativeList } from "@/shared/ui/native-list";
import { SNACKBAR_DEFAULT_RETRY_LABEL } from "@/shared/ui/snackbar-host.android";
import { StandardStateView } from "@/shared/ui/standard-state-view";
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

// Reuses the exact drawable task-app-kit already added for the N2 leading
// swipe action's SF Symbol counterpart (`markRead`) -- no new asset needed.
const MARK_READ_ICON =
  require("../../../../assets/icons/material/mark_email_read.xml") as ImageSourcePropType;
const MENU_ICON_SIZE = 20;
const KIND_ICONS = {
  newMessage:
    require("../../../../assets/icons/material/chat.xml") as ImageSourcePropType,
  newTopic:
    require("../../../../assets/icons/material/article.xml") as ImageSourcePropType,
  notification:
    require("../../../../assets/icons/material/notifications.xml") as ImageSourcePropType,
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
 * Android: the shared `NativeList` (a plain `LazyColumn` -- already flat,
 * nothing to override) with a custom row (not the kit `ActionListItem`,
 * whose `title`/string-only `supportingText`/no-`trailing` contract can't
 * carry an icon + title + body + N3 context line + right-aligned time). The
 * row is a Compose `ListItem` whose slots hold only Compose content (Icon,
 * Badge, Text, DropdownMenu): React Native views hosted in `LazyColumn` row
 * slots kept the UI thread in a measure loop on device (DESIGN.md §4).
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
  const lastShownError = useRef<NotificationsErrorOutcome | null>(null);

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
  const errorWithNoRows =
    !firstLoad && state.error !== null && state.items.length === 0;
  const errorMessage = state.error ? ERROR_COPY[state.error] : "";

  // C1/F4/GROUPS-AC7: a single `SystemFeedbackHost` (shared with the
  // push-failure notice above) is Android's "list has rows" error surface --
  // a second, separately-queued `AndroidSnackbarHost` used to overlap it.
  // Fires once per distinct error while rows are showing.
  useEffect(() => {
    if (!state.error) {
      lastShownError.current = null;
      return;
    }
    if (state.items.length === 0 || state.error === lastShownError.current)
      return;
    lastShownError.current = state.error;
    showNotice({
      actionLabel: SNACKBAR_DEFAULT_RETRY_LABEL,
      message: ERROR_COPY[state.error],
      onAction: () => void store.actions.refresh(),
    });
  }, [state.error, state.items.length, showNotice, store]);

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
          <NativeList
            onRefresh={() => store.actions.refresh()}
            testID="notifications-list"
          >
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
          </NativeList>
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
  const { colorScheme } = useAppThemeOrSystem();
  const hex = androidThemeColors(colorScheme);
  const [expanded, setExpanded] = useState(false);
  const copy = getNotificationCopy(notification.type, notification.args);
  const contextLine = getNotificationContextLine(notification.args);
  const unread = notification.readAt === null;
  const kind = getNotificationKind(notification.type);
  const iconName = kind === "other" ? "notification" : kind;
  const time = formatJamyeTimeLabel(notification.createdAt, {
    mode: "notification",
    now,
  });
  const open = () => setExpanded(true);
  const kindIcon = (
    <Icon
      contentDescription={unread ? "읽지 않음" : undefined}
      source={KIND_ICONS[iconName]}
      tint={unread ? hex.primary : hex.textMuted}
    />
  );

  return (
    <ListItem
      modifiers={[
        combinedClickable({
          onClick: onPress,
          onLongClick: unread ? open : undefined,
        }),
        testIDModifier(`notification-row-${notification.id}`),
      ]}
    >
      <ListItem.LeadingContent>
        {/* N1: M3 marks an unread row with a small Badge on the leading
            kind icon (TalkBack reads "읽지 않음" from the icon). A read row
            has no BadgedBox at all: without a badge slot it draws a default
            error-colored Badge. */}
        {unread ? (
          <BadgedBox>
            <BadgedBox.Badge>
              <Badge containerColor={hex.primary} />
            </BadgedBox.Badge>
            {kindIcon}
          </BadgedBox>
        ) : (
          kindIcon
        )}
      </ListItem.LeadingContent>
      <ListItem.HeadlineContent>
        <ComposeText
          color={hex.text}
          style={{ fontWeight: unread ? "bold" : "normal" }}
        >
          {copy.title}
        </ComposeText>
      </ListItem.HeadlineContent>
      <ListItem.SupportingContent>
        <Column>
          <ComposeText color={hex.textMuted}>{copy.body}</ComposeText>
          {contextLine ? (
            <ComposeText
              color={hex.textMuted}
              style={{ typography: "bodySmall" }}
            >
              {contextLine}
            </ComposeText>
          ) : null}
        </Column>
      </ListItem.SupportingContent>
      <ListItem.TrailingContent>
        <Column horizontalAlignment="end">
          <ComposeText
            color={hex.textMuted}
            style={{ typography: "labelSmall" }}
          >
            {time}
          </ComposeText>
          {busy ? (
            <CircularProgressIndicator
              modifiers={[
                size(16, 16),
                testIDModifier(`notification-row-busy-${notification.id}`),
              ]}
            />
          ) : null}
          {unread ? (
            <DropdownMenu
              expanded={expanded}
              onDismissRequest={() => setExpanded(false)}
            >
              <DropdownMenu.Trigger>
                <IconButton onClick={open}>
                  <Icon
                    contentDescription="읽음으로 표시 메뉴"
                    size={MENU_ICON_SIZE}
                    source={MARK_READ_ICON}
                    tint={hex.textMuted}
                  />
                </IconButton>
              </DropdownMenu.Trigger>
              <DropdownMenu.Items>
                <DropdownMenuItem
                  onClick={() => {
                    setExpanded(false);
                    onMarkRead();
                  }}
                >
                  <DropdownMenuItem.LeadingIcon>
                    <Icon
                      size={MENU_ICON_SIZE}
                      source={MARK_READ_ICON}
                      tint={hex.text}
                    />
                  </DropdownMenuItem.LeadingIcon>
                  <DropdownMenuItem.Text>
                    <ComposeText color={hex.text}>읽음으로 표시</ComposeText>
                  </DropdownMenuItem.Text>
                </DropdownMenuItem>
              </DropdownMenu.Items>
            </DropdownMenu>
          ) : null}
        </Column>
      </ListItem.TrailingContent>
    </ListItem>
  );
}
