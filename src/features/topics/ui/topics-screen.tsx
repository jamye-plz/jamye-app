import { Stack } from "expo-router";
import { StyleSheet, View } from "react-native";

import { useAppTheme } from "@/core/theme/theme-provider";
import { appSpacing } from "@/core/theme/tokens";
import { useGroupName } from "@/features/groups/model/groups-provider";
import { AppText } from "@/shared/ui/app-text";
import { HeaderActions } from "@/shared/ui/header-actions";
import { HeaderTitleButton } from "@/shared/ui/header-title-button";
import { InlineMessage } from "@/shared/ui/inline-message";
import { NativeButton } from "@/shared/ui/native-button";

import { TopicError } from "./topic-controls";
import { TopicDateDial } from "./topic-date-dial";
import { TopicList } from "./topic-list";
import { useTopicScreen } from "./use-topic-screen";

/**
 * Group home: the group name in the top app bar is itself the way into 그룹
 * 정보; 그룹 대화방 and 새 주제 are the bar actions; then the date dial and
 * the platform topic list (tap = chatroom, swipe = 상세).
 */
export function TopicsScreen({ groupId }: Readonly<{ groupId: string }>) {
  const { colors } = useAppTheme();
  const screen = useTopicScreen(groupId);
  const { state, store, chat, ready, scoped, router } = screen;
  const groupName = useGroupName(groupId);
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
  const title = groupName ?? "그룹";

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
      <HeaderActions
        actions={[
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
            disabled: !scoped || state.status !== "ready",
            key: "new-topic",
            onPress: () => {
              if (screen.current())
                router.push({
                  pathname: "/groups/[groupId]/topics/new",
                  params: { groupId },
                });
            },
            symbol: "add",
          },
        ]}
      />
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
              <TopicDateDial
                dates={state.dates.dates}
                onSelect={(date) => void store?.actions.selectDate(date)}
                selected={state.date}
                today={state.dates.today}
              />
            ) : null}
            {scoped && state.status === "loading" ? (
              <InlineMessage kind="notice" message="주제 불러오는 중…" />
            ) : null}
            <TopicError error={state.error} />
            {scoped && state.status === "error" ? (
              <NativeButton
                label="주제 다시 불러오기"
                onPress={() => void store?.actions.refresh()}
                variant="text"
              />
            ) : null}
          </>
        )}
      </View>
      {screen.valid && ready ? (
        <TopicList
          empty={scoped && state.status === "ready" && state.items.length === 0}
          loadMore={
            scoped && state.nextCursor
              ? {
                  busy: state.loadingMore,
                  disabled: state.status !== "ready",
                  onPress: () => void store?.actions.moreTopics(),
                }
              : null
          }
          onOpenChat={(topic) => openChatroom(topic.chatroomId)}
          onOpenDetail={(topic) => {
            if (screen.current())
              router.push({
                pathname: "/groups/[groupId]/topics/[topicId]",
                params: { groupId, topicId: topic.id },
              });
          }}
          onRefresh={() => store?.actions.refresh() ?? Promise.resolve()}
          refreshing={state.status === "loading"}
          topics={scoped ? state.items : []}
        />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
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
