import { Host } from "@expo/ui";
import { Stack } from "expo-router";
import { useEffect, useRef } from "react";
import { StyleSheet, View } from "react-native";

import { useSession } from "@/core/providers/session-provider";
import { useAppTheme } from "@/core/theme/theme-provider";
import { appSpacing } from "@/core/theme/tokens";
import { useGroupName } from "@/features/groups/model/groups-provider";
import { AndroidExtendedFab } from "@/shared/ui/android-extended-fab.android";
import { AppText } from "@/shared/ui/app-text";
import { HeaderActions } from "@/shared/ui/header-actions";
import type { HeaderAction } from "@/shared/ui/header-actions";
import { HeaderTitleButton } from "@/shared/ui/header-title-button";
import { NativeButton } from "@/shared/ui/native-button";
import { AndroidSnackbarHost } from "@/shared/ui/snackbar-host.android";
import type { SnackbarHostRef } from "@/shared/ui/snackbar-host.android";
import { StandardStateView } from "@/shared/ui/standard-state-view";

import { TOPICS_ERROR_MESSAGES } from "./topic-controls";
import { TopicDateChips } from "./topic-date-chips";
import { TopicList } from "./topic-list";
import { useTopicScreen } from "./use-topic-screen";

const IS_ANDROID = process.env.EXPO_OS === "android";

/**
 * Group home: the group name in the top app bar is itself the way into 그룹
 * 정보; 그룹 대화방 stays a header action on both platforms, 새 주제 is a
 * header `+` on iOS and the kit's Extended FAB on Android (T5). The date
 * chips (T1) and the topic list (T2, T4, C1) fill the body.
 */
export function TopicsScreen({ groupId }: Readonly<{ groupId: string }>) {
  const { colors } = useAppTheme();
  const screen = useTopicScreen(groupId);
  const { state, store, chat, ready, scoped, router } = screen;
  const groupName = useGroupName(groupId);
  // M15/AC3/E11: gates each row's delete action to its author.
  const { principal } = useSession();
  const currentUserId = principal?.userId ?? null;
  const main =
    chat.state.groupId === groupId && !chat.state.accessLost
      ? chat.state.rooms.items.find((room) => room.kind === "main")
      : undefined;
  const openChatroom = (chatroomId: string) => {
    if (screen.current())
      router.push({
        pathname: "/groups/[groupId]/chatrooms/[chatroomId]",
        params: { groupId, chatroomId },
      });
  };
  const openInfo = () =>
    router.push({
      pathname: "/groups/[groupId]/info",
      params: { groupId },
    });
  const openNewTopic = () => {
    if (screen.current())
      router.push({
        pathname: "/groups/[groupId]/topics/new",
        params: { groupId },
      });
  };
  const title = groupName ?? "그룹";
  const hasRows = scoped && state.items.length > 0;
  const canCreate = scoped && state.status === "ready";

  const snackbarRef = useRef<SnackbarHostRef>(null);
  const lastSnackbarErrorRef = useRef<string | null>(null);
  useEffect(() => {
    if (!IS_ANDROID) return;
    if (!hasRows || state.status !== "error" || !state.error) {
      lastSnackbarErrorRef.current = null;
      return;
    }
    if (lastSnackbarErrorRef.current === state.error) return;
    lastSnackbarErrorRef.current = state.error;
    void snackbarRef.current
      ?.showSnackbar({
        actionLabel: "다시 시도",
        message: TOPICS_ERROR_MESSAGES[state.error],
      })
      .then((result) => {
        if (result === "actionPerformed") void store?.actions.refresh();
      });
  }, [hasRows, state.status, state.error, store]);

  const lastAutoLoadCursorRef = useRef<string | null>(null);
  const handleLoadMore = () => {
    const cursor = state.nextCursor;
    if (!store || !cursor || cursor === lastAutoLoadCursorRef.current) return;
    lastAutoLoadCursorRef.current = cursor;
    void store.actions.moreTopics();
  };

  const headerActions: HeaderAction[] = IS_ANDROID
    ? [
        {
          accessibilityLabel: "그룹 대화방",
          disabled: !main,
          key: "chat",
          onPress: () => {
            if (main) openChatroom(main.chatroomId);
          },
          symbol: "chat",
        },
      ]
    : [
        {
          accessibilityLabel: "그룹 대화방",
          disabled: !main,
          key: "chat",
          onPress: () => {
            if (main) openChatroom(main.chatroomId);
          },
          symbol: "chat",
        },
        {
          accessibilityLabel: "새 주제 만들기",
          disabled: !canCreate,
          key: "new-topic",
          onPress: openNewTopic,
          symbol: "add",
        },
      ];

  // State views are SwiftUI/Compose nodes, so they sit in their own Host;
  // the topic list hosts itself.
  let stateView = null;
  let body = null;
  if (screen.valid && ready) {
    if (!scoped || (state.status === "loading" && !hasRows)) {
      stateView = <StandardStateView kind="loading" testID="topics-loading" />;
    } else if (state.status === "error" && !hasRows) {
      stateView = (
        <StandardStateView
          actions={[
            {
              label: "다시 시도",
              onPress: () => void store?.actions.refresh(),
              primary: true,
            },
          ]}
          description={
            state.error ? TOPICS_ERROR_MESSAGES[state.error] : undefined
          }
          kind="error"
          systemImage="error"
          testID="topics-error"
          title="주제를 불러오지 못했습니다."
        />
      );
    } else if (state.status === "ready" && !hasRows) {
      stateView = (
        <StandardStateView
          actions={[
            { label: "새 주제 만들기", onPress: openNewTopic, primary: true },
          ]}
          kind="empty"
          systemImage="emptyTopics"
          testID="topics-empty"
          title="선택한 날짜에 주제가 없습니다."
        />
      );
    } else {
      body = (
        <TopicList
          currentUserId={currentUserId}
          loadMore={
            state.nextCursor
              ? { isLoading: state.loadingMore, onVisible: handleLoadMore }
              : null
          }
          onDeleteConfirmed={(topic) =>
            void store?.actions.deleteTopic(topic.id)
          }
          onOpenChat={(topic) => openChatroom(topic.chatroomId)}
          onRefresh={() => store?.actions.refresh() ?? Promise.resolve()}
          topError={
            !IS_ANDROID && state.status === "error" && state.error
              ? {
                  message: TOPICS_ERROR_MESSAGES[state.error],
                  onRetry: () => void store?.actions.refresh(),
                }
              : null
          }
          topics={state.items}
        />
      );
    }
  }
  if (stateView)
    body = (
      <Host
        seedColor={colors.primary}
        style={styles.screen}
        testID="topics-state-host"
      >
        {stateView}
      </Host>
    );

  return (
    <View style={styles.screen}>
      <Stack.Screen
        options={{
          headerTitle: screen.valid
            ? () => (
                <HeaderTitleButton
                  accessibilityHint="그룹 정보를 엽니다"
                  onPress={openInfo}
                  title={title}
                />
              )
            : undefined,
          title,
        }}
      />
      <HeaderActions actions={headerActions} />
      <View style={styles.header}>
        {!screen.valid ? (
          <AppText>올바르지 않은 주제 주소입니다.</AppText>
        ) : !ready ? (
          <>
            <AppText color={colors.textMuted}>
              {screen.account.state?.status === "error"
                ? "주제 저장소를 열지 못했습니다."
                : "주제 저장소 준비 중…"}
            </AppText>
            {screen.account.state?.status === "error" ? (
              <NativeButton
                label="저장소 다시 열기"
                onPress={screen.account.retry}
                variant="text"
              />
            ) : null}
          </>
        ) : (
          <>
            {!main && scoped && chat.state.rooms.status === "error" ? (
              <NativeButton
                label="그룹 대화방 다시 불러오기"
                onPress={() => void chat.actions.loadRooms(groupId)}
                variant="text"
              />
            ) : null}
            {scoped && state.dates ? (
              // Edge-to-edge strip: the chips scroll under the screen edges
              // and inset their own content by the same 16pt/dp.
              <View style={styles.dateStrip}>
                <TopicDateChips
                  dates={state.dates.dates}
                  onSelect={(date) => void store?.actions.selectDate(date)}
                  selected={state.date}
                  testID="topics-date-chips"
                  today={state.dates.today}
                />
              </View>
            ) : null}
          </>
        )}
      </View>
      {body}
      {IS_ANDROID && screen.valid && scoped ? (
        <AndroidExtendedFab
          accessibilityLabel="새 주제 만들기"
          icon="add"
          items={[
            { key: "new-topic", label: "새 주제", onPress: openNewTopic },
          ]}
          label="새 주제"
          testID="topics-new-fab"
        />
      ) : null}
      {IS_ANDROID ? (
        <AndroidSnackbarHost ref={snackbarRef} testID="topics-snackbar" />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  dateStrip: { marginHorizontal: -appSpacing.md },
  header: {
    alignSelf: "center",
    gap: appSpacing.sm,
    maxWidth: 720,
    paddingHorizontal: appSpacing.md,
    paddingTop: appSpacing.sm,
    width: "100%",
  },
  screen: { flex: 1 },
});
