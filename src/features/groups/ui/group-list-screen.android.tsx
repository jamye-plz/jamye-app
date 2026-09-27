import { Host } from "@expo/ui";
import { Stack, useFocusEffect, useRouter } from "expo-router";
import { useCallback, useEffect, useRef } from "react";

import { useAppTheme } from "@/core/theme/theme-provider";
import { notificationsStore } from "@/features/notifications/model/notifications-store";
import { ActionListItem } from "@/shared/ui/action-list-item";
import { AndroidExtendedFab } from "@/shared/ui/android-extended-fab.android";
import { Avatar } from "@/shared/ui/avatar";
import { LoadSentinel } from "@/shared/ui/load-sentinel";
import { NativeList } from "@/shared/ui/native-list";
import {
  AndroidSnackbarHost,
  SNACKBAR_DEFAULT_RETRY_LABEL,
} from "@/shared/ui/snackbar-host.android";
import type { SnackbarHostRef } from "@/shared/ui/snackbar-host.android";
import { StandardStateView } from "@/shared/ui/standard-state-view";

import type { GroupsErrorOutcome } from "../model/groups-error";
import { useGroupsStore } from "../model/groups-provider";
import { groupErrorMessage } from "./group-controls";
import { useGroupRowActions } from "./group-row-actions";

const AVATAR_SIZE = 40;

/**
 * Group list (G1-G4), Android: the same native list + standard states as
 * the default/iOS file, but the entry points are the Extended FAB
 * `그룹 추가` (G3 -- Android drops the header `+` for the FAB) instead of a
 * nav-bar menu. C1's "list has rows" error path is the Snackbar host here
 * (iOS's counterpart is `StandardStateViewErrorRow`, an inline top-of-list
 * row) -- it fires once per distinct error while rows are already showing,
 * and its `다시 시도` action re-runs `loadGroups`.
 */
export function GroupListScreen() {
  const { colors } = useAppTheme();
  const {
    state: { list },
    actions,
  } = useGroupsStore();
  const router = useRouter();
  const rowActions = useGroupRowActions();
  const snackbarRef = useRef<SnackbarHostRef>(null);
  const lastShownError = useRef<GroupsErrorOutcome | null>(null);

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

  useEffect(() => {
    if (!list.error) {
      lastShownError.current = null;
      return;
    }
    if (list.items.length === 0 || list.error === lastShownError.current)
      return;
    lastShownError.current = list.error;
    void snackbarRef.current
      ?.showSnackbar({
        actionLabel: SNACKBAR_DEFAULT_RETRY_LABEL,
        message: groupErrorMessage(list.error),
      })
      .then((result) => {
        if (result === "actionPerformed") void actions.loadGroups();
      });
  }, [list.error, list.items.length, actions]);

  return (
    <>
      <Stack.Screen options={{ title: "그룹" }} />
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
      <AndroidSnackbarHost ref={snackbarRef} testID="group-list-snackbar" />
      <AndroidExtendedFab
        accessibilityLabel="그룹 추가"
        icon="groupAdd"
        items={[
          {
            icon: "groupAdd",
            key: "create",
            label: "새 그룹 만들기",
            onPress: () => router.push("/groups/create"),
          },
          {
            icon: "invite",
            key: "join",
            label: "초대 코드로 가입",
            onPress: () => router.push("/groups/join"),
          },
        ]}
        label="그룹 추가"
        testID="group-list-fab"
      />
      {rowActions.overlays}
    </>
  );
}
