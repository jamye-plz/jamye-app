import { useFocusEffect, useRouter } from "expo-router";
import { useCallback } from "react";
import type { ReactNode } from "react";
import { FlatList, Pressable, StyleSheet, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useAppTheme } from "@/core/theme/theme-provider";
import { appControl, appRadii, appSpacing } from "@/core/theme/tokens";
import { AppText } from "@/shared/ui/app-text";
import { useGroupsStore } from "../model/groups-provider";
import { GroupButton, GroupError } from "./group-controls";

export function GroupListScreen({ header }: Readonly<{ header?: ReactNode }>) {
  const {
    state: { list },
    actions,
  } = useGroupsStore();
  const { colors } = useAppTheme();
  const router = useRouter();
  useFocusEffect(
    useCallback(() => {
      void actions.loadGroups();
    }, [actions]),
  );
  return (
    <SafeAreaView style={[styles.fill, { backgroundColor: colors.background }]}>
      <FlatList
        data={list.items}
        keyExtractor={(group) => group.id}
        contentContainerStyle={styles.content}
        refreshing={list.status === "loading"}
        onRefresh={() => void actions.loadGroups()}
        ListHeaderComponent={
          <View style={styles.header}>
            {header}
            <AppText
              accessibilityRole="header"
              color={colors.text}
              variant="title"
            >
              내 그룹
            </AppText>
            <GroupButton
              label="그룹 만들기"
              onPress={() => router.push("/groups/create")}
            />
            <GroupButton
              label="초대 코드로 가입"
              onPress={() => router.push("/groups/join")}
            />
            {list.status === "loading" && (
              <AppText color={colors.textMuted} accessibilityRole="progressbar">
                그룹 불러오는 중…
              </AppText>
            )}
          </View>
        }
        ListEmptyComponent={
          list.status === "ready" ? (
            <AppText color={colors.textMuted}>
              아직 가입한 그룹이 없습니다.
            </AppText>
          ) : null
        }
        renderItem={({ item }) => (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`${item.name}, ${item.memberCount}명`}
            onPress={() =>
              router.push({
                pathname: "/groups/[groupId]",
                params: { groupId: item.id },
              })
            }
            style={[
              styles.row,
              { backgroundColor: colors.surface, borderColor: colors.border },
            ]}
          >
            <AppText color={colors.text}>{item.name}</AppText>
            <AppText color={colors.textMuted}>
              {item.memberCount} / {item.maxMembers}명
            </AppText>
          </Pressable>
        )}
        ListFooterComponent={
          <View style={styles.header}>
            <GroupError error={list.error} />
            {list.error && (
              <GroupButton
                label="그룹 다시 불러오기"
                onPress={() => void actions.loadGroups()}
              />
            )}
            {list.nextCursor !== null && (
              <GroupButton
                label="그룹 더 보기"
                busy={list.loadingMore}
                disabled={list.status === "loading"}
                onPress={() => void actions.loadMoreGroups()}
              />
            )}
          </View>
        }
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  content: {
    padding: appSpacing.md,
    gap: appSpacing.md,
    paddingBottom: appSpacing.xxxl,
  },
  header: { gap: appSpacing.md },
  row: {
    minHeight: appControl.standardHeight,
    padding: appSpacing.md,
    borderRadius: appRadii.medium,
    borderWidth: 1,
    gap: appSpacing.xs,
  },
});
