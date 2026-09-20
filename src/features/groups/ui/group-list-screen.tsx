import { BottomSheet, Host, List, ListItem } from "@expo/ui";
import { Stack, useFocusEffect, useRouter } from "expo-router";
import { useCallback, useState, useSyncExternalStore } from "react";
import { FlatList, RefreshControl, StyleSheet, View } from "react-native";

import { useAppTheme } from "@/core/theme/theme-provider";
import { appSpacing } from "@/core/theme/tokens";
import { notificationsStore } from "@/features/notifications/model/notifications-store";
import { AppText } from "@/shared/ui/app-text";
import { EmptyState } from "@/shared/ui/empty-state";
import { GroupedRow } from "@/shared/ui/grouped-row";
import { HeaderIconButton } from "@/shared/ui/header-icon-button";
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
  const { colors } = useAppTheme();
  const router = useRouter();
  const [sheetOpen, setSheetOpen] = useState(false);
  const { unreadCount } = useSyncExternalStore(
    notificationsStore.subscribe,
    notificationsStore.getState,
  );

  useFocusEffect(
    useCallback(() => {
      void actions.loadGroups();
      void notificationsStore.actions.refresh();
    }, [actions]),
  );

  return (
    <>
      <Stack.Screen
        options={{
          headerLargeTitle: true,
          headerRight: () => (
            <View style={{ flexDirection: "row", gap: 4 }}>
              <HeaderIconButton
                accessibilityLabel="그룹 추가"
                onPress={() => setSheetOpen(true)}
                symbol="add"
              />
              <View>
                <HeaderIconButton
                  accessibilityLabel={
                    unreadCount > 0
                      ? `알림함, 읽지 않은 알림 ${unreadCount}개`
                      : "알림함"
                  }
                  onPress={() => router.push({ pathname: "/notifications" })}
                  symbol="notification"
                />
                {unreadCount > 0 ? (
                  <View
                    accessibilityElementsHidden
                    importantForAccessibility="no"
                    style={[styles.badge, { backgroundColor: colors.error }]}
                  >
                    <AppText color="white" style={styles.badgeText}>
                      {unreadCount > 99 ? "99+" : String(unreadCount)}
                    </AppText>
                  </View>
                ) : null}
              </View>
              <HeaderIconButton
                accessibilityLabel="계정"
                onPress={() => router.push("/account")}
                symbol="account"
              />
            </View>
          ),
          title: "그룹",
        }}
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
            tintColor={colors.primary as string}
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
      <Host>
        <BottomSheet
          isPresented={sheetOpen}
          onDismiss={() => setSheetOpen(false)}
        >
          <List>
            <ListItem
              onPress={() => {
                setSheetOpen(false);
                router.push("/groups/create");
              }}
            >
              <AppText>새 그룹 만들기</AppText>
            </ListItem>
            <ListItem
              onPress={() => {
                setSheetOpen(false);
                router.push("/groups/join");
              }}
            >
              <AppText>초대 코드로 가입</AppText>
            </ListItem>
          </List>
        </BottomSheet>
      </Host>
    </>
  );
}

const styles = StyleSheet.create({
  badge: {
    alignItems: "center",
    borderRadius: 9,
    minWidth: 18,
    paddingHorizontal: 3,
    position: "absolute",
    right: -2,
    top: -2,
  },
  badgeText: {
    fontSize: 11,
    fontWeight: "700",
    lineHeight: 14,
  },
});
