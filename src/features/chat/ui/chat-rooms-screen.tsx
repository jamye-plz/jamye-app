import { useFocusEffect, useRouter } from "expo-router";
import { useCallback, useEffect } from "react";
import { FlatList, Text } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useAppTheme } from "@/core/theme/theme-provider";
import { useAccountScope } from "@/core/providers/app-providers";
import { appSpacing, appTypography } from "@/core/theme/tokens";
import { useConnectedChat } from "../model/connected-chat-provider";
import {
  chatErrorMessage,
  isChatIdentifier,
} from "../model/connected-chat-presentation";
import { ChatButton, ChatNotice } from "./chat-controls";

export function ChatRoomsScreen({ groupId }: Readonly<{ groupId: string }>) {
  const { state, actions, ready } = useConnectedChat();
  const account = useAccountScope();
  const { colors } = useAppTheme();
  const router = useRouter();
  const valid = isChatIdentifier(groupId);
  useFocusEffect(
    useCallback(() => {
      if (valid && ready) void actions.loadRooms(groupId);
      return actions.closeRooms;
    }, [actions, groupId, ready, valid]),
  );
  useEffect(() => {
    if (state.groupId === groupId && state.accessLost) router.replace("/");
  }, [state.groupId, state.accessLost, groupId, router]);
  const rooms = state.groupId === groupId ? state.rooms : null;
  return (
    <SafeAreaView
      style={{
        flex: 1,
        backgroundColor: colors.background,
        padding: appSpacing.md,
      }}
    >
      <ChatButton
        label="그룹으로 돌아가기"
        onPress={() =>
          valid
            ? router.replace({
                pathname: "/groups/[groupId]",
                params: { groupId },
              })
            : router.replace("/")
        }
      />
      <Text
        accessibilityRole="header"
        style={{ color: colors.text, ...appTypography.title }}
      >
        주제
      </Text>
      {!valid ? (
        <ChatNotice message="올바르지 않은 그룹 주소입니다." error />
      ) : !ready ? (
        <>
          <ChatNotice
            message={
              account.state?.status === "error"
                ? "대화 저장소를 열지 못했습니다."
                : "대화 저장소 준비 중…"
            }
            error={account.state?.status === "error"}
          />
          {account.state?.status === "error" && (
            <ChatButton label="저장소 다시 열기" onPress={account.retry} />
          )}
        </>
      ) : (
        <>
          <ChatButton
            label="주제 새로고침"
            disabled={rooms?.status === "loading"}
            onPress={() => void actions.loadRooms(groupId)}
          />
          {rooms?.status === "loading" && (
            <ChatNotice message="주제 불러오는 중…" />
          )}
          {rooms?.error && (
            <>
              <ChatNotice error message={chatErrorMessage(rooms.error)} />
              <ChatButton
                label="주제 다시 불러오기"
                onPress={() => void actions.loadRooms(groupId)}
              />
            </>
          )}
          <FlatList
            data={state.accessLost ? [] : (rooms?.items ?? [])}
            keyExtractor={(row) => row.chatroomId}
            ListEmptyComponent={
              rooms?.status === "ready" ? (
                <ChatNotice message="주제가 없습니다." />
              ) : null
            }
            renderItem={({ item }) => (
              <ChatButton
                label={`${item.kind === "main" ? "기본 주제" : "주제"} · ${item.chatroomId}`}
                onPress={() =>
                  router.push({
                    pathname: "/groups/[groupId]/chatrooms/[chatroomId]",
                    params: { groupId, chatroomId: item.chatroomId },
                  })
                }
              />
            )}
            ListFooterComponent={
              rooms?.hasMore ? (
                <ChatButton
                  label="주제 더 보기"
                  disabled={rooms.loadingMore}
                  onPress={() => void actions.loadMoreRooms()}
                />
              ) : null
            }
          />
        </>
      )}
    </SafeAreaView>
  );
}
