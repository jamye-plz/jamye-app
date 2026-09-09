import { useFocusEffect, useRouter } from "expo-router";
import { useCallback, useEffect, useRef } from "react";
import {
  Alert,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  StyleSheet,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useSession } from "@/core/providers/session-provider";
import { useAppTheme } from "@/core/theme/theme-provider";
import { appSpacing } from "@/core/theme/tokens";
import { AppText } from "@/shared/ui/app-text";
import { isGroupIdentifier } from "../model/groups-input";
import { useGroupsStore } from "../model/groups-provider";
import { GroupButton, GroupError } from "./group-controls";
import { GroupOwnerPanel } from "./group-owner-panel";

export function GroupDetailScreen({ groupId }: Readonly<{ groupId: string }>) {
  const { state, actions } = useGroupsStore();
  const { principal } = useSession();
  const { colors } = useAppTheme();
  const router = useRouter();
  const lifetime = useRef<symbol | null>(null);
  const valid = isGroupIdentifier(groupId);
  useFocusEffect(
    useCallback(() => {
      lifetime.current = Symbol();
      if (valid) void actions.openGroup(groupId);
      return () => {
        lifetime.current = null;
        actions.closeGroup();
      };
    }, [actions, groupId, valid]),
  );
  const detail = state.detail;
  const group = valid && detail.id === groupId ? detail.group : null;
  const owner = group?.ownerId === principal?.userId;
  const busy = state.management.status === "pending";
  useEffect(() => {
    if (detail.id === groupId && detail.accessLost && !busy && lifetime.current)
      router.replace("/");
  }, [detail.id, detail.accessLost, groupId, busy, router]);

  function confirm(
    label: string,
    message: string,
    run: () => Promise<boolean>,
  ): void {
    const started = lifetime.current;
    Alert.alert(label, message, [
      { text: "취소", style: "cancel" },
      {
        text: "확인",
        style: "destructive",
        onPress: () => {
          if (!started || lifetime.current !== started) return;
          void run();
        },
      },
    ]);
  }
  const error = detail.id === groupId ? detail.error : null;
  return (
    <SafeAreaView style={[styles.fill, { backgroundColor: colors.background }]}>
      <KeyboardAvoidingView
        style={styles.fill}
        behavior={Platform.OS === "ios" ? "padding" : "height"}
      >
        <FlatList
          data={group ? detail.members.items : []}
          keyExtractor={(member) => member.userId}
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
          ListHeaderComponent={
            <View style={styles.section}>
              <GroupButton
                label="그룹 목록으로"
                onPress={() => router.replace("/")}
              />
              {!valid ? (
                <AppText color={colors.error}>
                  올바르지 않은 그룹 주소입니다.
                </AppText>
              ) : (
                <>
                  {!group && !error && (
                    <AppText
                      color={colors.textMuted}
                      accessibilityRole="progressbar"
                    >
                      그룹 확인 중…
                    </AppText>
                  )}
                  <GroupError error={error} />
                  {error && !detail.accessLost && (
                    <GroupButton
                      label="그룹 다시 확인"
                      busy={detail.status === "loading"}
                      onPress={() => void actions.openGroup(groupId)}
                    />
                  )}
                </>
              )}
              {group && (
                <>
                  <AppText
                    color={colors.text}
                    variant="title"
                    accessibilityRole="header"
                  >
                    {group.name}
                  </AppText>
                  <AppText color={colors.textMuted}>
                    {group.memberCount} / {group.maxMembers}명 ·{" "}
                    {owner ? "그룹 소유자" : "멤버"}
                  </AppText>
                  <GroupButton
                    label="그룹 새로고침"
                    disabled={busy}
                    busy={detail.status === "loading"}
                    onPress={() => void actions.openGroup(groupId)}
                  />
                  {(state.management.status === "failed" ||
                    state.management.status === "uncertain") && (
                    <GroupError error={state.management.error} />
                  )}
                  {state.management.status === "uncertain" && (
                    <AppText color={colors.error}>
                      서버에 반영됐을 수 있습니다. 자동으로 다시 실행하지
                      않습니다. 새로고침 후 현재 상태를 확인하세요.
                    </AppText>
                  )}
                  {owner ? (
                    <>
                      <GroupOwnerPanel key={group.id} />
                      <AppText color={colors.textMuted}>
                        소유자는 나가기 전에 다른 멤버에게 소유권을 이전해야
                        합니다.
                      </AppText>
                      <GroupButton
                        label="그룹 삭제"
                        busy={busy}
                        retryAt={state.retryAt.management}
                        onPress={() =>
                          confirm(
                            "그룹 삭제",
                            "모든 멤버가 이 그룹에 접근할 수 없게 됩니다. 삭제할까요?",
                            actions.deleteGroup,
                          )
                        }
                      />
                    </>
                  ) : (
                    <GroupButton
                      label="그룹 나가기"
                      busy={busy}
                      retryAt={state.retryAt.management}
                      onPress={() =>
                        confirm(
                          "그룹 나가기",
                          "이 그룹에 더 이상 접근할 수 없게 됩니다. 나갈까요?",
                          () => actions.removeMember(principal!.userId),
                        )
                      }
                    />
                  )}
                  <AppText color={colors.text} accessibilityRole="header">
                    멤버
                  </AppText>
                  {detail.members.status === "loading" && (
                    <AppText
                      color={colors.textMuted}
                      accessibilityRole="progressbar"
                    >
                      멤버 불러오는 중…
                    </AppText>
                  )}
                </>
              )}
            </View>
          }
          renderItem={({ item }) => (
            <View style={styles.section}>
              <AppText color={colors.text}>
                {item.nickname} · {item.role === "owner" ? "소유자" : "멤버"}
              </AppText>
              {owner && item.userId !== principal?.userId && (
                <>
                  <GroupButton
                    label={`${item.nickname}에게 소유권 이전`}
                    busy={busy}
                    retryAt={state.retryAt.management}
                    onPress={() =>
                      confirm(
                        "소유권 이전",
                        "소유권을 넘기면 나는 일반 멤버가 됩니다. 이전할까요?",
                        () => actions.transferOwnership(item.userId),
                      )
                    }
                  />
                  <GroupButton
                    label={`${item.nickname} 내보내기`}
                    busy={busy}
                    retryAt={state.retryAt.management}
                    onPress={() =>
                      confirm(
                        "멤버 내보내기",
                        "선택한 멤버의 그룹 접근 권한을 제거할까요?",
                        () => actions.removeMember(item.userId),
                      )
                    }
                  />
                </>
              )}
            </View>
          )}
          ListFooterComponent={
            group ? (
              <View style={styles.section}>
                <GroupError error={detail.members.error} />
                {detail.members.error && (
                  <GroupButton
                    label="멤버 다시 불러오기"
                    onPress={() => void actions.openGroup(groupId)}
                  />
                )}
                {detail.members.nextCursor !== null && (
                  <GroupButton
                    label="멤버 더 보기"
                    busy={detail.members.loadingMore}
                    onPress={() => void actions.loadMoreMembers()}
                  />
                )}
              </View>
            ) : null
          }
        />
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
const styles = StyleSheet.create({
  fill: { flex: 1 },
  content: {
    padding: appSpacing.md,
    gap: appSpacing.xl,
    paddingBottom: appSpacing.xxxl,
  },
  section: { gap: appSpacing.md },
});
