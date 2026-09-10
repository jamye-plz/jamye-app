import { FlatList, Pressable, ScrollView, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useAppTheme } from "@/core/theme/theme-provider";
import {
  TopicText as AppText,
  TopicButton,
  TopicError,
  topicStyles,
} from "./topic-controls";
import { useTopicScreen } from "./use-topic-screen";

export function TopicsScreen({ groupId }: Readonly<{ groupId: string }>) {
  const { colors } = useAppTheme();
  const screen = useTopicScreen(groupId);
  const { state, store, chat, ready, scoped, router } = screen;
  const main =
    chat.state.groupId === groupId && !chat.state.accessLost
      ? chat.state.rooms.items.find((room) => room.kind === "main")
      : undefined;
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }}>
      <FlatList
        contentContainerStyle={topicStyles.content}
        data={scoped ? state.items : []}
        keyExtractor={(item) => item.id}
        accessibilityLabel="주제 목록"
        ListHeaderComponent={
          <View style={topicStyles.gap}>
            <TopicButton
              secondary
              label="그룹으로 돌아가기"
              onPress={() =>
                screen.valid
                  ? router.replace({
                      pathname: "/groups/[groupId]",
                      params: { groupId },
                    })
                  : router.replace("/")
              }
            />
            <AppText variant="title" accessibilityRole="header">
              주제
            </AppText>
            {!screen.valid ? (
              <AppText>올바르지 않은 주제 주소입니다.</AppText>
            ) : !ready ? (
              <>
                <AppText>
                  {screen.account.state?.status === "error"
                    ? "주제 저장소를 열지 못했습니다."
                    : "주제 저장소 준비 중…"}
                </AppText>
                {screen.account.state?.status === "error" ? (
                  <TopicButton
                    label="저장소 다시 열기"
                    onPress={screen.account.retry}
                  />
                ) : null}
              </>
            ) : (
              <>
                {main ? (
                  <TopicButton
                    secondary
                    label="기본 주제 대화"
                    onPress={() => {
                      if (screen.current())
                        router.push({
                          pathname: "/groups/[groupId]/chatrooms/[chatroomId]",
                          params: { groupId, chatroomId: main.chatroomId },
                        });
                    }}
                  />
                ) : null}
                {scoped && !main && chat.state.rooms.status === "error" ? (
                  <TopicButton
                    secondary
                    label="기본 주제 다시 불러오기"
                    onPress={() => void chat.actions.loadRooms(groupId)}
                  />
                ) : null}
                <TopicButton
                  label="새 주제 만들기"
                  disabled={!scoped || state.status !== "ready"}
                  onPress={() => {
                    if (screen.current())
                      router.push({
                        pathname: "/groups/[groupId]/topics/new",
                        params: { groupId },
                      });
                  }}
                />
                <TopicButton
                  secondary
                  label="주제 새로고침"
                  busy={state.status === "loading"}
                  disabled={!scoped}
                  onPress={() => void store?.actions.refresh()}
                />
                {scoped && state.dates ? (
                  <>
                    <AppText>서울 날짜 · 오늘 {state.dates.today}</AppText>
                    <ScrollView
                      horizontal
                      contentContainerStyle={topicStyles.row}
                      accessibilityLabel="주제 날짜 선택"
                    >
                      <TopicButton
                        secondary
                        selected={state.date === ""}
                        label="전체 날짜"
                        onPress={() => void store?.actions.selectDate("")}
                      />
                      {[
                        ...new Set([state.dates.today, ...state.dates.dates]),
                      ].map((date) => (
                        <TopicButton
                          key={date}
                          secondary
                          selected={state.date === date}
                          label={date}
                          onPress={() => void store?.actions.selectDate(date)}
                        />
                      ))}
                    </ScrollView>
                    {state.dates.nextCursor ? (
                      <TopicButton
                        secondary
                        busy={state.datesBusy}
                        label="이전 날짜 더 보기"
                        onPress={() => void store?.actions.moreDates()}
                      />
                    ) : null}
                  </>
                ) : null}
                {scoped && state.status === "loading" ? (
                  <AppText accessibilityLiveRegion="polite">
                    주제 불러오는 중…
                  </AppText>
                ) : null}
                <TopicError error={state.error} />
                {scoped && state.status === "error" ? (
                  <TopicButton
                    label="주제 다시 불러오기"
                    onPress={() => void store?.actions.refresh()}
                  />
                ) : null}
              </>
            )}
          </View>
        }
        ListEmptyComponent={
          scoped && state.status === "ready" ? (
            <AppText>선택한 날짜에 주제가 없습니다.</AppText>
          ) : null
        }
        renderItem={({ item }) => (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`주제 ${item.title}, 작성자 ${item.authorNickname}`}
            onPress={() => {
              if (screen.current())
                router.push({
                  pathname: "/groups/[groupId]/topics/[topicId]",
                  params: { groupId, topicId: item.id },
                });
            }}
            style={[
              topicStyles.card,
              { borderColor: colors.border, backgroundColor: colors.surface },
            ]}
          >
            <AppText variant="title">{item.title}</AppText>
            <AppText>
              {item.authorNickname} ·{" "}
              {item.status === "seed" ? "새 주제" : "이야기 있음"}
            </AppText>
            {item.tags.length ? (
              <AppText color={colors.textMuted}>
                {item.tags.map((tag) => `#${tag.tag}`).join(" ")}
              </AppText>
            ) : null}
          </Pressable>
        )}
        ListFooterComponent={
          scoped && state.nextCursor ? (
            <TopicButton
              secondary
              label="주제 더 보기"
              busy={state.loadingMore}
              disabled={state.status !== "ready"}
              onPress={() => void store?.actions.moreTopics()}
            />
          ) : null
        }
      />
    </SafeAreaView>
  );
}
