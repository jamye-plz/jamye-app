import { Stack } from "expo-router";
import {
  FlatList,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  View,
} from "react-native";

import { useAppTheme } from "@/core/theme/theme-provider";
import { appSpacing } from "@/core/theme/tokens";
import { AppSymbol } from "@/shared/ui/app-symbol";
import { AppText } from "@/shared/ui/app-text";
import { EmptyState } from "@/shared/ui/empty-state";
import { GroupedRow } from "@/shared/ui/grouped-row";
import { GroupedSection } from "@/shared/ui/grouped-section";
import { HeaderIconButton } from "@/shared/ui/header-icon-button";
import { InlineMessage } from "@/shared/ui/inline-message";
import { NativeButton } from "@/shared/ui/native-button";

import { TopicError } from "./topic-controls";
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
    <>
      <Stack.Screen
        options={{
          headerLargeTitle: true,
          headerRight: () => (
            <HeaderIconButton
              accessibilityLabel="새 주제 만들기"
              disabled={!scoped || state.status !== "ready"}
              onPress={() => {
                if (screen.current())
                  router.push({
                    pathname: "/groups/[groupId]/topics/new",
                    params: { groupId },
                  });
              }}
              symbol="add"
            />
          ),
          title: "주제",
        }}
      />
      <FlatList
        // @expo/ui Host children start at zero size on Android; clipping would
        // detach them before Compose reports their measured height.
        removeClippedSubviews={false}
        accessibilityLabel="주제 목록"
        contentContainerStyle={styles.content}
        contentInsetAdjustmentBehavior="automatic"
        data={scoped ? state.items : []}
        ItemSeparatorComponent={() => (
          <View
            style={[styles.separator, { backgroundColor: colors.divider }]}
          />
        )}
        keyExtractor={(item) => item.id}
        ListEmptyComponent={
          scoped && state.status === "ready" ? (
            <EmptyState
              symbol={{ android: "forum", ios: "text.bubble" }}
              title="선택한 날짜에 주제가 없습니다."
            />
          ) : null
        }
        ListFooterComponent={
          scoped && state.nextCursor ? (
            <NativeButton
              busy={state.loadingMore}
              disabled={state.status !== "ready"}
              label="주제 더 보기"
              onPress={() => void store?.actions.moreTopics()}
              variant="text"
            />
          ) : null
        }
        ListHeaderComponent={
          <View style={styles.gap}>
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
                {main ? (
                  <GroupedSection>
                    <GroupedRow
                      leading={
                        <AppSymbol name="chat" tintColor={colors.primary} />
                      }
                      onPress={() => {
                        if (screen.current())
                          router.push({
                            pathname:
                              "/groups/[groupId]/chatrooms/[chatroomId]",
                            params: { groupId, chatroomId: main.chatroomId },
                          });
                      }}
                      title="기본 주제 대화"
                    />
                  </GroupedSection>
                ) : scoped && chat.state.rooms.status === "error" ? (
                  <NativeButton
                    label="기본 주제 다시 불러오기"
                    onPress={() => void chat.actions.loadRooms(groupId)}
                    variant="text"
                  />
                ) : null}
                {scoped && state.dates ? (
                  <View style={styles.gapXs}>
                    <ScrollView
                      accessibilityLabel="주제 날짜 선택"
                      contentContainerStyle={styles.chipRow}
                      horizontal
                      showsHorizontalScrollIndicator={false}
                    >
                      <DateChip
                        label="전체 날짜"
                        onPress={() => void store?.actions.selectDate("")}
                        selected={state.date === ""}
                      />
                      {[
                        ...new Set([state.dates.today, ...state.dates.dates]),
                      ].map((date) => (
                        <DateChip
                          key={date}
                          label={date}
                          onPress={() => void store?.actions.selectDate(date)}
                          selected={state.date === date}
                        />
                      ))}
                      {state.dates.nextCursor ? (
                        <DateChip
                          busy={state.datesBusy}
                          label="이전 날짜 더 보기"
                          onPress={() => void store?.actions.moreDates()}
                        />
                      ) : null}
                    </ScrollView>
                    <AppText color={colors.textMuted} variant="footnote">
                      서울 날짜 · 오늘 {state.dates.today}
                    </AppText>
                  </View>
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
        }
        refreshControl={
          <RefreshControl
            onRefresh={() => void store?.actions.refresh()}
            refreshing={state.status === "loading"}
            tintColor={colors.primary as string}
          />
        }
        renderItem={({ item }) => (
          <GroupedRow
            accessibilityLabel={`주제 ${item.title}, 작성자 ${item.authorNickname}`}
            onPress={() => {
              if (screen.current())
                router.push({
                  pathname: "/groups/[groupId]/topics/[topicId]",
                  params: { groupId, topicId: item.id },
                });
            }}
            subtitle={`${item.authorNickname} · ${
              item.status === "seed" ? "새 주제" : "이야기 있음"
            }`}
            title={item.title}
            trailing={
              item.tags.length ? (
                <AppText color={colors.textMuted} variant="caption">
                  {item.tags.map((tag) => `#${tag.tag}`).join(" ")}
                </AppText>
              ) : undefined
            }
          />
        )}
      />
    </>
  );
}

function DateChip({
  busy = false,
  label,
  onPress,
  selected = false,
}: Readonly<{
  busy?: boolean;
  label: string;
  onPress: () => void;
  selected?: boolean;
}>) {
  const { colors } = useAppTheme();
  const text = busy ? `${label} 처리 중…` : label;
  return (
    <Pressable
      accessibilityLabel={text}
      accessibilityRole="button"
      accessibilityState={{ busy, disabled: busy, selected }}
      disabled={busy}
      onPress={onPress}
      style={({ pressed }) => [
        styles.chip,
        {
          backgroundColor: selected ? colors.primary : colors.fill,
          opacity: pressed ? 0.8 : 1,
        },
      ]}
    >
      <AppText
        color={selected ? colors.onPrimary : colors.text}
        variant="label"
      >
        {text}
      </AppText>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  chip: {
    alignItems: "center",
    borderCurve: "continuous",
    borderRadius: 999,
    justifyContent: "center",
    minHeight: 36,
    paddingHorizontal: appSpacing.sm,
  },
  chipRow: {
    flexDirection: "row",
    gap: appSpacing.xs,
  },
  content: {
    alignSelf: "center",
    gap: appSpacing.md,
    maxWidth: 720,
    padding: appSpacing.md,
    paddingBottom: Platform.OS === "android" ? appSpacing.xxxl : appSpacing.md,
    width: "100%",
  },
  gap: { gap: appSpacing.sm },
  gapXs: { gap: appSpacing.xs },
  separator: { height: StyleSheet.hairlineWidth },
});
