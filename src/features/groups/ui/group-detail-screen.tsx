import { BottomSheet, Host, List, ListItem } from "@expo/ui";
import { Stack, useFocusEffect, useRouter } from "expo-router";
import { useCallback, useEffect, useRef, useState } from "react";
import type { PropsWithChildren } from "react";
import {
  Alert,
  FlatList,
  KeyboardAvoidingView,
  RefreshControl,
  StyleSheet,
  View,
} from "react-native";
import { useSession } from "@/core/providers/session-provider";
import { useAppTheme } from "@/core/theme/theme-provider";
import { appRadii, appSpacing } from "@/core/theme/tokens";
import { AppSymbol } from "@/shared/ui/app-symbol";
import { AppText } from "@/shared/ui/app-text";
import { FormField } from "@/shared/ui/form-field";
import { GroupedRow } from "@/shared/ui/grouped-row";
import { GroupedSection } from "@/shared/ui/grouped-section";
import { HeaderIconButton } from "@/shared/ui/header-icon-button";
import { InlineMessage } from "@/shared/ui/inline-message";
import { NativeButton } from "@/shared/ui/native-button";
import { isGroupIdentifier, isGroupName } from "../model/groups-input";
import { useGroupsStore } from "../model/groups-provider";
import { GroupError } from "./group-controls";
import { GroupOwnerPanel } from "./group-owner-panel";

export function GroupDetailScreen({ groupId }: Readonly<{ groupId: string }>) {
  const { state, actions } = useGroupsStore();
  const { principal } = useSession();
  const { colors } = useAppTheme();
  const router = useRouter();
  const lifetime = useRef<symbol | null>(null);
  const detail = state.detail;
  const [name, setName] = useState("");
  const [inviteSheet, setInviteSheet] = useState(false);
  const [memberSheet, setMemberSheet] = useState<
    (typeof detail.members.items)[number] | null
  >(null);
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
    <>
      <Stack.Screen options={{ title: group?.name ?? "그룹" }} />
      <KeyboardAvoidingView
        behavior={process.env.EXPO_OS === "ios" ? "padding" : "height"}
        style={styles.fill}
      >
        <FlatList
          // @expo/ui Host children start at zero size on Android; clipping would
          // detach them before Compose reports their measured height.
          removeClippedSubviews={false}
          contentContainerStyle={styles.content}
          contentInsetAdjustmentBehavior="automatic"
          data={group ? detail.members.items : []}
          keyExtractor={(member) => member.userId}
          keyboardShouldPersistTaps="handled"
          refreshControl={
            <RefreshControl
              onRefresh={() => void actions.openGroup(groupId)}
              refreshing={detail.status === "loading"}
              testID="group-detail-refresh"
              tintColor={colors.primary as string}
            />
          }
          style={[styles.fill, { backgroundColor: colors.background }]}
          ListHeaderComponent={
            <View style={styles.header}>
              {!valid ? (
                <InlineMessage
                  kind="error"
                  message="올바르지 않은 그룹 주소입니다."
                />
              ) : (
                <>
                  {!group && !error && (
                    <InlineMessage kind="notice" message="그룹 확인 중…" />
                  )}
                  <GroupError error={error} />
                  {error && !group && !detail.accessLost && (
                    <NativeButton
                      variant="text"
                      label="그룹 다시 확인"
                      busy={detail.status === "loading"}
                      onPress={() => void actions.openGroup(groupId)}
                    />
                  )}
                  {group && (
                    <>
                      <GroupedSection
                        footer={`${group.memberCount} / ${group.maxMembers}명 · ${
                          owner ? "그룹 소유자" : "멤버"
                        }`}
                      >
                        <GroupedRow
                          title="주제"
                          leading={
                            <AppSymbol name="chat" tintColor={colors.primary} />
                          }
                          disabled={busy}
                          onPress={() =>
                            router.push({
                              pathname: "/groups/[groupId]/chatrooms",
                              params: { groupId },
                            })
                          }
                        />
                      </GroupedSection>
                      {(state.management.status === "failed" ||
                        state.management.status === "uncertain") && (
                        <GroupError error={state.management.error} />
                      )}
                      {state.management.status === "uncertain" && (
                        <InlineMessage
                          kind="error"
                          message="서버에 반영됐을 수 있습니다. 자동으로 다시 실행하지 않습니다. 새로고침 후 현재 상태를 확인하세요."
                        />
                      )}
                      <GroupedSection title="멤버" />
                      {detail.members.status === "loading" && (
                        <InlineMessage
                          kind="notice"
                          message="멤버 불러오는 중…"
                        />
                      )}
                    </>
                  )}
                </>
              )}
            </View>
          }
          ItemSeparatorComponent={MemberSeparator}
          renderItem={({ item, index }) => (
            <MemberRowSurface
              first={index === 0}
              last={index === detail.members.items.length - 1}
            >
              <GroupedRow
                title={item.nickname}
                subtitle={item.role === "owner" ? "소유자" : "멤버"}
                chevron={false}
                trailing={
                  owner && item.userId !== principal?.userId ? (
                    <HeaderIconButton
                      symbol="more"
                      accessibilityLabel={`${item.nickname} 관리`}
                      onPress={() => setMemberSheet(item)}
                    />
                  ) : undefined
                }
              />
            </MemberRowSurface>
          )}
          ListFooterComponent={
            group ? (
              <View style={styles.footer}>
                <GroupError error={detail.members.error} />
                {detail.members.error && (
                  <NativeButton
                    variant="text"
                    label="멤버 다시 불러오기"
                    onPress={() => void actions.openGroup(groupId)}
                  />
                )}
                {detail.members.nextCursor !== null && (
                  <NativeButton
                    variant="text"
                    label="멤버 더 보기"
                    busy={detail.members.loadingMore}
                    onPress={() => void actions.loadMoreMembers()}
                  />
                )}
                {owner && (
                  <GroupedSection
                    title="관리"
                    footer="소유자는 나가기 전에 다른 멤버에게 소유권을 이전해야 합니다."
                  >
                    <View style={styles.inlineRename}>
                      <FormField
                        label="새 그룹 이름"
                        value={name}
                        onChangeText={setName}
                        editable={!busy}
                      />
                      <NativeButton
                        label="이름 변경"
                        retryAt={state.retryAt.management}
                        busy={busy}
                        disabled={!isGroupName(name)}
                        onPress={() => void actions.renameGroup(name)}
                      />
                    </View>
                    <GroupedRow
                      title="초대 코드 발급"
                      leading={
                        <AppSymbol name="share" tintColor={colors.primary} />
                      }
                      onPress={() => setInviteSheet(true)}
                    />
                  </GroupedSection>
                )}
                <GroupedSection>
                  {owner ? (
                    <GroupedRow
                      title="그룹 삭제"
                      destructive
                      chevron={false}
                      leading={
                        <AppSymbol name="delete" tintColor={colors.error} />
                      }
                      disabled={busy}
                      onPress={() =>
                        confirm(
                          "그룹 삭제",
                          "모든 멤버가 이 그룹에 접근할 수 없게 됩니다. 삭제할까요?",
                          actions.deleteGroup,
                        )
                      }
                    />
                  ) : (
                    <GroupedRow
                      title="그룹 나가기"
                      destructive
                      chevron={false}
                      leading={
                        <AppSymbol name="leave" tintColor={colors.error} />
                      }
                      disabled={busy}
                      onPress={() =>
                        confirm(
                          "그룹 나가기",
                          "이 그룹에 더 이상 접근할 수 없게 됩니다. 나갈까요?",
                          () => actions.removeMember(principal!.userId),
                        )
                      }
                    />
                  )}
                </GroupedSection>
              </View>
            ) : null
          }
        />
        <Host>
          <BottomSheet
            isPresented={!!memberSheet}
            onDismiss={() => setMemberSheet(null)}
          >
            {memberSheet && (
              <List>
                <ListItem
                  onPress={() => {
                    const target = memberSheet;
                    setMemberSheet(null);
                    confirm(
                      "소유권 이전",
                      "소유권을 넘기면 나는 일반 멤버가 됩니다. 이전할까요?",
                      () => actions.transferOwnership(target.userId),
                    );
                  }}
                >
                  <AppText>{`${memberSheet.nickname}에게 소유권 이전`}</AppText>
                </ListItem>
                <ListItem
                  onPress={() => {
                    const target = memberSheet;
                    setMemberSheet(null);
                    confirm(
                      "멤버 내보내기",
                      "선택한 멤버의 그룹 접근 권한을 제거할까요?",
                      () => actions.removeMember(target.userId),
                    );
                  }}
                >
                  <AppText>{`${memberSheet.nickname} 내보내기`}</AppText>
                </ListItem>
              </List>
            )}
          </BottomSheet>
        </Host>
      </KeyboardAvoidingView>
      <GroupOwnerPanel
        isPresented={inviteSheet}
        onDismiss={() => setInviteSheet(false)}
      />
    </>
  );
}

/**
 * Member rows are virtualized, so they cannot sit inside one `GroupedSection`.
 * This wrapper reproduces the section surface per row (rounded ends on iOS,
 * flat Material surface on Android) so the list reads as one grouped block.
 */
function MemberRowSurface({
  children,
  first,
  last,
}: PropsWithChildren<Readonly<{ first: boolean; last: boolean }>>) {
  const { colors } = useAppTheme();
  const isIos = process.env.EXPO_OS === "ios";
  return (
    <View
      style={[
        {
          backgroundColor: isIos
            ? colors.secondaryGroupedBackground
            : colors.surface,
        },
        isIos
          ? {
              borderCurve: "continuous",
              borderTopLeftRadius: first ? appRadii.medium : 0,
              borderTopRightRadius: first ? appRadii.medium : 0,
              borderBottomLeftRadius: last ? appRadii.medium : 0,
              borderBottomRightRadius: last ? appRadii.medium : 0,
              overflow: "hidden",
            }
          : null,
      ]}
    >
      {children}
    </View>
  );
}

function MemberSeparator() {
  const { colors } = useAppTheme();
  const isIos = process.env.EXPO_OS === "ios";
  return (
    <View
      style={{
        backgroundColor: isIos
          ? colors.secondaryGroupedBackground
          : colors.surface,
      }}
    >
      <View
        style={{
          backgroundColor: colors.divider,
          height: StyleSheet.hairlineWidth,
          marginLeft: isIos ? appSpacing.md : 0,
        }}
      />
    </View>
  );
}

const styles = {
  content: {
    padding: appSpacing.md,
    paddingBottom: appSpacing.xxxl,
  },
  header: { gap: appSpacing.md, paddingBottom: appSpacing.md },
  footer: { gap: appSpacing.md, paddingTop: appSpacing.xl },
  fill: { flex: 1 },
  inlineRename: {
    gap: appSpacing.sm,
    paddingHorizontal: appSpacing.md,
    paddingVertical: appSpacing.sm,
  },
  section: { gap: appSpacing.md },
} as const;
