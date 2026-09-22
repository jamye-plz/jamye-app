import { Button, Column, Host, Icon, Text } from "@expo/ui";
import { Stack, useFocusEffect, useRouter } from "expo-router";
import { useCallback } from "react";

import { useAppTheme } from "@/core/theme/theme-provider";
import type { AppColorScheme } from "@/core/theme/tokens";
import { androidThemeColors } from "@/core/theme/tokens";
import { notificationsStore } from "@/features/notifications/model/notifications-store";
import { ActionListItem } from "@/shared/ui/action-list-item";
import { HeaderActions } from "@/shared/ui/header-actions";
import { NativeList } from "@/shared/ui/native-list";

import { useGroupsStore } from "../model/groups-provider";
import { groupErrorMessage } from "./group-controls";
import { useGroupRowActions } from "./group-row-actions";

/** Secondary text and glyphs: the platform label color at reduced opacity. */
const MUTED = { opacity: 0.65 } as const;
const GROUP_ICON = {
  android: require("../../../../assets/icons/material/group.xml"),
  ios: "person.2",
} as const;

/**
 * `@expo/ui` `Text` takes a plain color string, so the error role is the
 * platform's own red as hex: UIKit systemRed per scheme on iOS, the
 * Berry-seed Material error on Android (ADR 0011).
 */
export function resolveGroupListErrorColor(
  os: string | undefined,
  scheme: AppColorScheme,
): string {
  if (os === "android") return androidThemeColors(scheme).error;
  return scheme === "dark" ? "#FF453A" : "#FF3B30";
}

/**
 * Group list drawn entirely by `@expo/ui`: rows, pull-to-refresh, and the
 * empty / error / 더 보기 states all live inside one native list
 * (`NativeList`: SwiftUI `List` on iOS, Compose `LazyColumn` in a full-size
 * `PullToRefreshBox` on Android). Each row is an `ActionListItem` whose
 * secondary actions (초대 코드 발급 / 소유권 이전 for owners, 그룹 나가기
 * otherwise) surface the platform way. Loading has no row of its own: the
 * native refresh indicator is the only signal. The header stays the native
 * Stack header with its `+` menu.
 */
export function GroupListScreen() {
  const { colorScheme, colors } = useAppTheme();
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

  const errorColor = resolveGroupListErrorColor(
    process.env.EXPO_OS,
    colorScheme,
  );

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
        <NativeList onRefresh={() => actions.loadGroups()} testID="group-list">
          {list.items.map((item) => (
            <ActionListItem
              actions={rowActions.actionsFor(item)}
              key={item.id}
              onPress={() =>
                router.push({
                  params: { groupId: item.id },
                  pathname: "/groups/[groupId]",
                })
              }
              supportingText={`${item.memberCount} / ${item.maxMembers}명`}
              testID={`group-row-${item.id}`}
              title={item.name}
            />
          ))}
          {list.status === "ready" && list.items.length === 0 ? (
            <Column
              alignment="center"
              spacing={8}
              style={{ paddingVertical: 32 }}
              testID="group-list-empty"
            >
              <Icon name={GROUP_ICON} size={44} style={MUTED} />
              <Text textStyle={{ fontSize: 17, fontWeight: "600" }}>
                아직 가입한 그룹이 없습니다.
              </Text>
              <Text
                style={MUTED}
                textStyle={{ fontSize: 15, textAlign: "center" }}
              >
                오른쪽 위 + 버튼으로 그룹을 만들거나 초대 코드로 가입하세요.
              </Text>
            </Column>
          ) : null}
          {list.error ? (
            <Text textStyle={{ color: errorColor }}>
              {groupErrorMessage(list.error)}
            </Text>
          ) : null}
          {list.error ? (
            <Button
              label="그룹 다시 불러오기"
              onPress={() => void actions.loadGroups()}
              variant="text"
            />
          ) : null}
          {list.nextCursor !== null ? (
            <Button
              disabled={list.loadingMore}
              label={
                list.loadingMore ? "그룹 더 보기 처리 중…" : "그룹 더 보기"
              }
              onPress={() => void actions.loadMoreGroups()}
              variant="text"
            />
          ) : null}
        </NativeList>
      </Host>
      {rowActions.overlays}
    </>
  );
}
