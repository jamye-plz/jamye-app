import { Host } from "@expo/ui";
import { Stack, useFocusEffect, useRouter } from "expo-router";
import { useCallback } from "react";

import { useAppTheme } from "@/core/theme/theme-provider";
import { notificationsStore } from "@/features/notifications/model/notifications-store";
import { ActionListItem } from "@/shared/ui/action-list-item";
import { Avatar } from "@/shared/ui/avatar";
import { HeaderActions } from "@/shared/ui/header-actions";
import { LoadSentinel } from "@/shared/ui/load-sentinel";
import { NativeList } from "@/shared/ui/native-list";
import {
  StandardStateView,
  StandardStateViewErrorRow,
} from "@/shared/ui/standard-state-view";

import { useGroupsStore } from "../model/groups-provider";
import { groupErrorMessage } from "./group-controls";
import { useGroupRowActions } from "./group-row-actions";

const AVATAR_SIZE = 40;

/**
 * Group list (G1-G4): rows drawn by `@expo/ui`'s native `List`
 * (`NativeList`), a monogram `Avatar` leading each row (G1), and the
 * standard C1 loading/empty/error states. Entry points stay the iOS nav-bar
 * `+` pull-down (`새 그룹 만들기` / `초대 코드로 가입`, G3). Android resolves
 * to `group-list-screen.android.tsx`, which drops the header button for the
 * Extended FAB instead (ADR 0010: no FAB on iOS).
 */
export function GroupListScreen() {
  const { colors } = useAppTheme();
  const {
    state: { list },
    actions,
  } = useGroupsStore();
  const router = useRouter();
  const rowActions = useGroupRowActions();

  useFocusEffect(
    useCallback(() => {
      void actions.loadGroups();
      void notificationsStore.actions.refresh();
    }, [actions]),
  );

  const firstLoad = list.status === "loading" && list.items.length === 0;
  const empty = list.status === "ready" && list.items.length === 0;
  const errorWithNoRows =
    !firstLoad && list.error !== null && list.items.length === 0;
  const errorMessage = list.error ? groupErrorMessage(list.error) : "";

  return (
    <>
      <Stack.Screen options={{ title: "그룹" }} />
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
      <Host seedColor={colors.primary} style={{ flex: 1 }}>
        {firstLoad ? (
          <StandardStateView kind="loading" testID="group-list-loading" />
        ) : empty ? (
          <StandardStateView
            actions={[
              {
                label: "새 그룹 만들기",
                onPress: () => router.push("/groups/create"),
                primary: true,
              },
              {
                label: "초대 코드로 가입",
                onPress: () => router.push("/groups/join"),
              },
            ]}
            description="새 그룹을 만들거나 초대 코드로 가입하세요."
            kind="empty"
            systemImage="emptyGroups"
            testID="group-list-empty"
            title="아직 가입한 그룹이 없습니다"
          />
        ) : errorWithNoRows ? (
          <StandardStateView
            actions={[
              {
                label: "다시 시도",
                onPress: () => void actions.loadGroups(),
                primary: true,
              },
            ]}
            description={errorMessage}
            kind="error"
            systemImage="error"
            testID="group-list-error"
            title="그룹을 불러오지 못했습니다"
          />
        ) : (
          <NativeList
            onRefresh={() => actions.loadGroups()}
            testID="group-list"
          >
            {list.error ? (
              <StandardStateViewErrorRow
                message={errorMessage}
                onRetry={() => void actions.loadGroups()}
                testID="group-list-error-row"
              />
            ) : null}
            {list.items.map((item) => (
              <ActionListItem
                actions={rowActions.actionsFor(item)}
                key={item.id}
                leading={<Avatar name={item.name} size={AVATAR_SIZE} />}
                onPress={() =>
                  router.push({
                    params: { groupId: item.id },
                    pathname: "/groups/[groupId]",
                  })
                }
                supportingText={`${item.memberCount} / ${item.maxMembers}명${
                  item.ownerId === rowActions.myUserId ? " · 소유자" : ""
                }`}
                testID={`group-row-${item.id}`}
                title={item.name}
              />
            ))}
            {list.nextCursor !== null ? (
              <LoadSentinel
                isLoading={list.loadingMore}
                onVisible={() => void actions.loadMoreGroups()}
                testID="group-list-load-more"
              />
            ) : null}
          </NativeList>
        )}
      </Host>
      {rowActions.overlays}
    </>
  );
}
