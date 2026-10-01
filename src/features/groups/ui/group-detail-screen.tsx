import { Host, RNHostView, Text } from "@expo/ui";
import { Stack, useRouter } from "expo-router";
import { useWindowDimensions, View } from "react-native";

import { useAppTheme, useAppThemeOrSystem } from "@/core/theme/theme-provider";
import { androidThemeColors, appSpacing } from "@/core/theme/tokens";
import { ActionListItem } from "@/shared/ui/action-list-item";
import { AppSymbol } from "@/shared/ui/app-symbol";
import { AppText } from "@/shared/ui/app-text";
import { Avatar } from "@/shared/ui/avatar";
import { ConfirmAlert } from "@/shared/ui/confirm-alert";
import { HeaderActions } from "@/shared/ui/header-actions";
import { LoadSentinel } from "@/shared/ui/load-sentinel";
import { NativeList } from "@/shared/ui/native-list";
import { StandardStateView } from "@/shared/ui/standard-state-view";

import { groupErrorMessage } from "./group-controls";
import {
  HEADER_AVATAR_SIZE,
  IOS_ROW_INSETS,
  noop,
  ROW_AVATAR_SIZE,
  useGroupDetailScreen,
} from "./group-detail-screen.shared";
import { GroupNameHeading } from "./group-name-heading";
import { GroupRenameDialog } from "./group-rename-dialog";

const IS_ANDROID = process.env.EXPO_OS === "android";

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
 * leading `Avatar`), the E7d "사진·동영상" gallery entry row, and the
 * destructive 나가기/삭제 row (I6). The owner's tools have no rows
 * (M17/U12): tapping the header's group name (a trailing pencil marks it)
 * opens the I3 rename dialog, and I5 invite sharing is the top app bar's
 * trailing share button. This deliberately does **not** use the universal `FieldGroup` for
 * the interactive sections: Android's `FieldGroup.Section` wraps every
 * child in its own non-interactive `ListItem.HeadlineContent`, so a real
 * `ListItem`/`ActionListItem` child (needed here for I4's swipe/long-press
 * member actions and leading avatars) renders doubly-nested. `NativeList` +
 * `ActionListItem` is the same pattern the group list (G1-G4) already uses
 * for the identical problem shape, so this screen stays consistent with it
 * and needs no separate `.android.tsx` file. See the task result report for
 * the trade-off this records against I1's literal "universal FieldGroup"
 * wording. This file now covers Android and any non-iOS fallback only --
 * iOS resolves `group-detail-screen.ios.tsx` (M17/E7g), which shares this
 * screen's state/effects via `useGroupDetailScreen`
 * (`group-detail-screen.shared.ts`).
 */
export function GroupDetailScreen({ groupId }: Readonly<{ groupId: string }>) {
  const {
    actions,
    busy,
    deleteConfirm,
    detail,
    error,
    firstLoad,
    group,
    headerActions,
    leaveConfirm,
    me,
    memberActionsFor,
    owner,
    removeTarget,
    renameOpen,
    setDeleteConfirm,
    setLeaveConfirm,
    setRemoveTarget,
    setRenameOpen,
    setShareFailed,
    setTransferTarget,
    shareFailed,
    shareInvite,
    state,
    transferTarget,
    valid,
  } = useGroupDetailScreen(groupId);
  const { colors } = useAppTheme();
  const router = useRouter();
  const { width: windowWidth } = useWindowDimensions();
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
      <GroupNameHeading
        name={group.name}
        onRename={owner ? () => setRenameOpen(true) : undefined}
      />
      <AppText color={colors.textMuted}>
        {`멤버 ${group.memberCount}/${group.maxMembers} · ${owner ? "소유자" : "멤버"}`}
      </AppText>
    </View>
  ) : null;
  return (
    <>
      <Stack.Screen options={{ title: "그룹 정보" }} />
      <HeaderActions actions={headerActions} />
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
            <ActionListItem
              actions={[]}
              leading={
                <AppSymbol name="gallery" tintColor={colors.textMuted} />
              }
              onPress={() =>
                router.push({
                  params: { chatroomId: group.mainChatroomId, groupId },
                  pathname: "/groups/[groupId]/gallery",
                })
              }
              testID="group-detail-gallery-row"
              title="사진·동영상"
            />
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
