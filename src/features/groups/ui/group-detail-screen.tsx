import { Host, RNHostView, Text } from "@expo/ui";
import { Stack, useFocusEffect, useIsFocused, useRouter } from "expo-router";
import { useCallback, useEffect, useRef, useState } from "react";
import { Share, useWindowDimensions, View } from "react-native";
import { parsePublicApiOrigin } from "@/core/config/public-env";
import type { Member } from "@/core/contracts/server";
import { useSession } from "@/core/providers/session-provider";
import { useAppTheme, useAppThemeOrSystem } from "@/core/theme/theme-provider";
import { androidThemeColors, appSpacing } from "@/core/theme/tokens";
import { ActionListItem } from "@/shared/ui/action-list-item";
import type { RowAction } from "@/shared/ui/action-list-item.types";
import { AppSymbol } from "@/shared/ui/app-symbol";
import { AppText } from "@/shared/ui/app-text";
import { Avatar } from "@/shared/ui/avatar";
import { ConfirmAlert } from "@/shared/ui/confirm-alert";
import { LoadSentinel } from "@/shared/ui/load-sentinel";
import { NativeList } from "@/shared/ui/native-list";
import { StandardStateView } from "@/shared/ui/standard-state-view";
import { isGroupIdentifier } from "../model/groups-input";
import { useGroupsStore } from "../model/groups-provider";
import { groupErrorMessage } from "./group-controls";
import { GroupRenameDialog } from "./group-rename-dialog";
import {
  buildInviteShareMessage,
  sevenDaysFromNowIso,
} from "./group-row-actions";

const HEADER_AVATAR_SIZE = 72;
const ROW_AVATAR_SIZE = 40;
const IS_ANDROID = process.env.EXPO_OS === "android";
// Inset-grouped List: 16pt screen margin + 16pt row inset on each side.
const IOS_ROW_INSETS = 64;
function noop(): void {}

/**
 * A text row inside the native list. On Android it is a Compose `Text`, not
 * an RN `AppText`: a React Native child that appears and disappears inside
 * the Compose `LazyColumn` can outlive its removal there (a stale "loading"
 * row) and later crash the interop ("child already has a parent"). It also
 * carries the M3 16dp inset the `LazyColumn` does not add. iOS list rows are
 * inset by the List itself and keep the RN text.
 */
function ListText({
  children,
  kind = "body",
  tone = "muted",
}: Readonly<{
  children: string;
  kind?: "body" | "subheader";
  tone?: "error" | "muted";
}>) {
  const { colorScheme, colors } = useAppThemeOrSystem();
  if (!IS_ANDROID)
    return (
      <AppText
        color={tone === "error" ? colors.error : colors.textMuted}
        variant={kind === "subheader" ? "footnote" : undefined}
      >
        {children}
      </AppText>
    );
  const hex = androidThemeColors(colorScheme);
  return (
    <Text
      style={
        kind === "subheader"
          ? { paddingBottom: 8, paddingHorizontal: 16, paddingTop: 16 }
          : { paddingHorizontal: 16, paddingVertical: 12 }
      }
      textStyle={{
        color: tone === "error" ? hex.error : hex.textMuted,
        fontSize: kind === "subheader" ? 14 : 16,
      }}
    >
      {children}
    </Text>
  );
}

/**
 * Group info (I1-I6): a single native `List` (`NativeList`) holding the
 * centered summary header (I2), member rows (I4, `ActionListItem` with a
 * leading `Avatar`), the owner-only 관리 rows (I3 rename / I5 invite share),
 * and the destructive 나가기/삭제 row (I6). This deliberately does **not**
 * use the universal `FieldGroup` for the interactive sections: Android's
 * `FieldGroup.Section` wraps every child in its own non-interactive
 * `ListItem.HeadlineContent`, so a real `ListItem`/`ActionListItem` child
 * (needed here for I4's swipe/long-press member actions and leading
 * avatars) renders doubly-nested. `NativeList` + `ActionListItem` is the
 * same pattern the group list (G1-G4) already uses for the identical
 * problem shape, so this screen stays consistent with it and needs no
 * separate `.android.tsx` file. See the task result report for the
 * trade-off this records against I1's literal "universal FieldGroup"
 * wording.
 */
export function GroupDetailScreen({ groupId }: Readonly<{ groupId: string }>) {
  const { state, actions, getState } = useGroupsStore();
  const { principal } = useSession();
  const { colors } = useAppTheme();
  const router = useRouter();
  const lifetime = useRef<symbol | null>(null);
  // Leaving the screen clears the store's detail (closeGroup) while the pop
  // animation still shows it; keep drawing the last focused detail so the
  // native list is not rebuilt mid-transition.
  const focused = useIsFocused();
  const [shownDetail, setShownDetail] = useState(state.detail);
  if (focused && shownDetail !== state.detail) setShownDetail(state.detail);
  const detail = focused ? state.detail : shownDetail;
  const [renameOpen, setRenameOpen] = useState(false);
  const [shareBusy, setShareBusy] = useState(false);
  const [shareFailed, setShareFailed] = useState(false);
  const [transferTarget, setTransferTarget] = useState<Member | null>(null);
  const [removeTarget, setRemoveTarget] = useState<Member | null>(null);
  const [leaveConfirm, setLeaveConfirm] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState(false);
  const valid = isGroupIdentifier(groupId);
  const { width: windowWidth } = useWindowDimensions();
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
  const me = principal?.userId ?? null;
  const owner = group?.ownerId === me;
  const busy = state.management.status === "pending";
  useEffect(() => {
    if (detail.id === groupId && detail.accessLost && !busy && lifetime.current)
      router.replace("/");
  }, [detail.id, detail.accessLost, groupId, busy, router]);

  async function shareInvite(): Promise<void> {
    if (!group) return;
    setShareBusy(true);
    setShareFailed(false);
    const ok = await actions.createInvite(
      { expiresAt: sevenDaysFromNowIso(), maxUses: null },
      true,
    );
    setShareBusy(false);
    const invite = ok ? getState().invite : null;
    if (!invite) {
      setShareFailed(true);
      return;
    }
    try {
      await Share.share({
        message: buildInviteShareMessage(
          group.name,
          parsePublicApiOrigin(process.env.EXPO_PUBLIC_API_ORIGIN),
          invite.code,
        ),
      });
    } catch {
      // The user cancelling/dismissing the system share sheet is not an
      // error (G5) -- the invite already exists and stays usable.
    }
  }

  function memberActionsFor(member: Member): RowAction[] {
    if (!owner || member.userId === me) return [];
    return [
      {
        key: "transfer",
        onPress: () => setTransferTarget(member),
        symbol: "transfer",
        title: "소유권 이전",
      },
      {
        destructive: true,
        key: "remove",
        onPress: () => setRemoveTarget(member),
        symbol: "removeMember",
        title: "내보내기",
      },
    ];
  }

  const error = detail.id === groupId ? detail.error : null;
  const firstLoad = valid && !group && !error;
  const summaryHeader = group ? (
    <View
      style={{
        alignItems: "center",
        gap: appSpacing.sm,
        paddingVertical: appSpacing.lg,
        ...(IS_ANDROID ? null : { width: windowWidth - IOS_ROW_INSETS }),
      }}
    >
      <Avatar name={group.name} size={HEADER_AVATAR_SIZE} />
      <AppText variant="title">{group.name}</AppText>
      <AppText color={colors.textMuted}>
        {`멤버 ${group.memberCount}/${group.maxMembers} · ${owner ? "소유자" : "멤버"}`}
      </AppText>
    </View>
  ) : null;
  return (
    <>
      <Stack.Screen options={{ title: "그룹 정보" }} />
      <Host seedColor={colors.primary} style={{ flex: 1 }}>
        {!valid ? (
          <StandardStateView
            kind="error"
            systemImage="error"
            testID="group-detail-invalid"
            title="올바르지 않은 그룹 주소입니다"
          />
        ) : firstLoad ? (
          <StandardStateView kind="loading" testID="group-detail-loading" />
        ) : !group ? (
          <StandardStateView
            actions={
              !detail.accessLost
                ? [
                    {
                      label: "다시 시도",
                      onPress: () => void actions.openGroup(groupId),
                      primary: true,
                    },
                  ]
                : undefined
            }
            description={error ? groupErrorMessage(error) : undefined}
            kind="error"
            systemImage="error"
            testID="group-detail-error"
            title="그룹을 불러오지 못했습니다"
          />
        ) : (
          <NativeList
            onRefresh={() => actions.openGroup(groupId)}
            testID="group-detail-list"
          >
            {/* SwiftUI sizes a List row from its content, so the RN header
                is hosted content-sized there, with the inset-grouped row
                width (iPhone only) so it stays centered. */}
            {IS_ANDROID || !summaryHeader ? (
              summaryHeader
            ) : (
              <RNHostView matchContents>{summaryHeader}</RNHostView>
            )}
            {state.management.status === "failed" ||
            state.management.status === "uncertain" ? (
              <ListText tone="error">
                {groupErrorMessage(state.management.error)}
              </ListText>
            ) : null}
            {state.management.status === "uncertain" ? (
              <ListText tone="error">
                서버에 반영됐을 수 있습니다. 자동으로 다시 실행하지 않습니다.
                새로고침 후 현재 상태를 확인하세요.
              </ListText>
            ) : null}
            <ListText kind="subheader">멤버</ListText>
            {detail.members.items.map((member) => (
              <ActionListItem
                disclosure={false}
                actions={memberActionsFor(member)}
                key={member.userId}
                leading={
                  <Avatar
                    name={member.nickname}
                    size={ROW_AVATAR_SIZE}
                    uri={member.avatarUrl}
                  />
                }
                onPress={noop}
                supportingText={member.role === "owner" ? "소유자" : "멤버"}
                testID={`group-member-${member.userId}`}
                title={
                  member.userId === me
                    ? `${member.nickname} (나)`
                    : member.nickname
                }
              />
            ))}
            {detail.members.status === "loading" ? (
              <ListText>멤버 불러오는 중…</ListText>
            ) : null}
            {detail.members.nextCursor !== null ? (
              <LoadSentinel
                isLoading={detail.members.loadingMore}
                onVisible={() => void actions.loadMoreMembers()}
                testID="group-detail-members-load-more"
              />
            ) : null}
            {owner ? (
              <>
                <ListText kind="subheader">관리</ListText>
                <ActionListItem
                  disclosure={false}
                  actions={[]}
                  leading={
                    <AppSymbol name="edit" tintColor={colors.textMuted} />
                  }
                  onPress={() => setRenameOpen(true)}
                  supportingText={group.name}
                  testID="group-detail-rename-row"
                  title="그룹 이름"
                />
                <ActionListItem
                  disclosure={false}
                  actions={[]}
                  leading={
                    <AppSymbol name="share" tintColor={colors.textMuted} />
                  }
                  onPress={() => void shareInvite()}
                  testID="group-detail-share-row"
                  title="초대 링크 공유"
                />
                {shareBusy ? <ListText>초대 링크 만드는 중…</ListText> : null}
              </>
            ) : null}
            <ActionListItem
              disclosure={false}
              actions={[]}
              leading={
                <AppSymbol
                  name={owner ? "delete" : "leave"}
                  tintColor={colors.error}
                />
              }
              onPress={() =>
                owner ? setDeleteConfirm(true) : setLeaveConfirm(true)
              }
              testID="group-detail-leave-delete-row"
              title={owner ? "그룹 삭제" : "그룹 나가기"}
            />
          </NativeList>
        )}
      </Host>
      <Host seedColor={colors.primary}>
        <ConfirmAlert
          confirmLabel="이전"
          destructive
          isPresented={transferTarget !== null}
          message={
            transferTarget
              ? `${transferTarget.nickname}에게 소유권을 넘기면 나는 일반 멤버가 됩니다. 이전할까요?`
              : undefined
          }
          onConfirm={() => {
            const target = transferTarget;
            setTransferTarget(null);
            if (target) void actions.transferOwnership(target.userId);
          }}
          onDismiss={() => setTransferTarget(null)}
          testID="group-detail-transfer-confirm"
          title="소유권 이전"
        />
        <ConfirmAlert
          confirmLabel="내보내기"
          destructive
          isPresented={removeTarget !== null}
          message={
            removeTarget
              ? `${removeTarget.nickname}의 그룹 접근 권한을 제거할까요?`
              : undefined
          }
          onConfirm={() => {
            const target = removeTarget;
            setRemoveTarget(null);
            if (target) void actions.removeMember(target.userId);
          }}
          onDismiss={() => setRemoveTarget(null)}
          testID="group-detail-remove-confirm"
          title="멤버 내보내기"
        />
        <ConfirmAlert
          confirmLabel="나가기"
          destructive
          isPresented={leaveConfirm}
          message="이 그룹에 더 이상 접근할 수 없게 됩니다. 나갈까요?"
          onConfirm={() => {
            setLeaveConfirm(false);
            if (me) void actions.removeMember(me);
          }}
          onDismiss={() => setLeaveConfirm(false)}
          testID="group-detail-leave-confirm"
          title="그룹 나가기"
        />
        <ConfirmAlert
          confirmLabel="삭제"
          destructive
          isPresented={deleteConfirm}
          message="모든 멤버가 이 그룹에 접근할 수 없게 됩니다. 삭제할까요?"
          onConfirm={() => {
            setDeleteConfirm(false);
            void actions.deleteGroup();
          }}
          onDismiss={() => setDeleteConfirm(false)}
          testID="group-detail-delete-confirm"
          title="그룹 삭제"
        />
        <ConfirmAlert
          confirmLabel="다시 시도"
          isPresented={shareFailed}
          message="네트워크 상태를 확인한 뒤 다시 시도하세요."
          onConfirm={() => {
            setShareFailed(false);
            void shareInvite();
          }}
          onDismiss={() => setShareFailed(false)}
          testID="group-detail-share-failed"
          title="초대 링크를 만들지 못했습니다"
        />
      </Host>
      {group ? (
        <GroupRenameDialog
          busy={busy}
          currentName={group.name}
          isPresented={renameOpen}
          onCancel={() => setRenameOpen(false)}
          onSubmit={(name) => {
            void actions.renameGroup(name).then((ok) => {
              if (ok) setRenameOpen(false);
            });
          }}
          testID="group-detail-rename-dialog"
        />
      ) : null}
    </>
  );
}
