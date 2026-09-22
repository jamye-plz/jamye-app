import { Stack, useFocusEffect, useRouter } from "expo-router";
import { useCallback } from "react";
import { FlatList, RefreshControl, View } from "react-native";

import { appSpacing } from "@/core/theme/tokens";
import { notificationsStore } from "@/features/notifications/model/notifications-store";
import { EmptyState } from "@/shared/ui/empty-state";
import { GroupedRow } from "@/shared/ui/grouped-row";
import { HeaderActions } from "@/shared/ui/header-actions";
import { InlineMessage } from "@/shared/ui/inline-message";
import { NativeButton } from "@/shared/ui/native-button";

import { useGroupsStore } from "../model/groups-provider";
import { GroupError } from "./group-controls";

/**
 * Android's edge-to-edge navigation bar needs extra bottom room under the
 * list; iOS already accounts for the home indicator via safe-area insets.
 * Pure so both branches stay unit-testable under jest-expo's fixed platform.
 */
export function resolveGroupListContentPadding(os: string | undefined): number {
  return os === "android" ? appSpacing.xxxl : appSpacing.md;
}

export function GroupListScreen() {
  const {
    state: { list },
    actions,
  } = useGroupsStore();
  const router = useRouter();

  useFocusEffect(
    useCallback(() => {
      void actions.loadGroups();
      void notificationsStore.actions.refresh();
    }, [actions]),
  );

  return (
    <>
      <Stack.Screen options={{ headerLargeTitle: true, title: "그룹" }} />
      <HeaderActions
        actions={[
          {
            accessibilityLabel: "그룹 추가",
            items: [
              {
                key: "create",
                onPress: () => router.push("/groups/create"),
                symbol: "group",
                title: "새 그룹 만들기",
              },
              {
                key: "join",
                onPress: () => router.push("/groups/join"),
                symbol: "invite",
                title: "초대 코드로 가입",
              },
            ],
            key: "add",
            kind: "menu",
            symbol: "add",
          },
        ]}
      />
      <FlatList
        // @expo/ui Host children start at zero size on Android; clipping would
        // detach them before Compose reports their measured height. iOS already
        // defaults to false, so this only changes Android behaviour.
        removeClippedSubviews={false}
        contentContainerStyle={{
          alignSelf: "center",
          gap: appSpacing.md,
          maxWidth: 720,
          padding: appSpacing.md,
          paddingBottom: resolveGroupListContentPadding(process.env.EXPO_OS),
          width: "100%",
        }}
        contentInsetAdjustmentBehavior="automatic"
        data={list.items}
        keyExtractor={(group) => group.id}
        ListEmptyComponent={
          list.status === "ready" ? (
            <EmptyState
              description="오른쪽 위 + 버튼으로 그룹을 만들거나 초대 코드로 가입하세요."
              symbol={{ android: "group", ios: "person.2" }}
              title="아직 가입한 그룹이 없습니다."
            />
          ) : null
        }
        ListFooterComponent={
          <View style={{ gap: appSpacing.md }}>
            <GroupError error={list.error} />
            {list.error ? (
              <NativeButton
                label="그룹 다시 불러오기"
                onPress={() => void actions.loadGroups()}
                variant="text"
              />
            ) : null}
            {list.nextCursor !== null ? (
              <NativeButton
                busy={list.loadingMore}
                label="그룹 더 보기"
                onPress={() => void actions.loadMoreGroups()}
                variant="text"
              />
            ) : null}
          </View>
        }
        ListHeaderComponent={
          list.status === "loading" ? (
            <InlineMessage kind="notice" message="그룹 불러오는 중…" />
          ) : null
        }
        refreshControl={
          <RefreshControl
            onRefresh={() => void actions.loadGroups()}
            refreshing={list.status === "loading"}
          />
        }
        renderItem={({ item }) => (
          <GroupedRow
            accessibilityLabel={`${item.name}, ${item.memberCount}명`}
            onPress={() =>
              router.push({
                params: { groupId: item.id },
                pathname: "/groups/[groupId]",
              })
            }
            subtitle={`${item.memberCount} / ${item.maxMembers}명`}
            title={item.name}
          />
        )}
      />
    </>
  );
}
