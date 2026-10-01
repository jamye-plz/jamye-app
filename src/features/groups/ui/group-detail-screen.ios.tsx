import { Host, ListItem, RNHostView } from "@expo/ui";
import { Form, Section, Text } from "@expo/ui/swift-ui";
import { foregroundStyle, refreshable } from "@expo/ui/swift-ui/modifiers";
import { Stack, useRouter } from "expo-router";
import { useWindowDimensions, View } from "react-native";

import { useAppTheme } from "@/core/theme/theme-provider";
import { appSpacing } from "@/core/theme/tokens";
import { ActionListItem } from "@/shared/ui/action-list-item";
import { AppSymbol } from "@/shared/ui/app-symbol";
import { AppText } from "@/shared/ui/app-text";
import { Avatar } from "@/shared/ui/avatar";
import { ConfirmAlert } from "@/shared/ui/confirm-alert";
import { HeaderActions } from "@/shared/ui/header-actions";
import { LoadSentinel } from "@/shared/ui/load-sentinel";
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

/**
 * Group info (I1-I6, iOS): a native `Form`/`Section` list, the
 * `account-screen.ios.tsx` pattern (M17/E7g). The centered summary header
 * (I2) and the E7d "사진·동영상" gallery entry row each sit in their own
 * title-less `Section`; member rows (I4, `ActionListItem` with a leading
 * `Avatar`) sit under a "멤버" `Section`; the destructive 나가기/삭제 row
 * (I6) gets its own trailing `Section`. The owner's tools have no rows
 * (M17/U12): tapping the header's group name (a trailing pencil marks it)
 * presents the I3 `groups/[groupId]/rename` sheet (M17/U11, the same C3
 * `Form` sheet as 새 주제), and I5 invite sharing is the navigation bar's
 * trailing share button. `NativeList`'s
 * universal `List` cannot host a swift-ui `Section` as a child (Section is
 * swift-ui-only, no universal export), so this screen replaces it with
 * `Form` outright rather than mixing containers. State, effects and
 * handlers are shared with the Android screen via `useGroupDetailScreen`
 * (`group-detail-screen.shared.ts`).
 */
export function GroupDetailScreen({ groupId }: Readonly<{ groupId: string }>) {
  const {
    actions,
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
    presentRename,
    removeTarget,
    setDeleteConfirm,
    setLeaveConfirm,
    setRemoveTarget,
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
        width: windowWidth - IOS_ROW_INSETS,
      }}
    >
      <Avatar name={group.name} size={HEADER_AVATAR_SIZE} />
      <GroupNameHeading
        name={group.name}
        onRename={owner ? presentRename : undefined}
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
          <Form
            modifiers={[refreshable(() => actions.openGroup(groupId))]}
            testID="group-detail-list"
          >
            {/* SwiftUI sizes a List row from its content, so the RN header
                is hosted content-sized there, with the inset-grouped row
                width so it stays centered. */}
            {summaryHeader ? (
              <Section>
                <RNHostView matchContents>{summaryHeader}</RNHostView>
              </Section>
            ) : null}
            <Section>
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
            </Section>
            {state.management.status === "failed" ||
            state.management.status === "uncertain" ? (
              <Section>
                <ListItem testID="group-detail-management-error-row">
                  <Text modifiers={[foregroundStyle(colors.error)]}>
                    {groupErrorMessage(state.management.error)}
                  </Text>
                </ListItem>
                {state.management.status === "uncertain" ? (
                  <ListItem testID="group-detail-management-uncertain-row">
                    <Text modifiers={[foregroundStyle(colors.error)]}>
                      서버에 반영됐을 수 있습니다. 자동으로 다시 실행하지
                      않습니다. 새로고침 후 현재 상태를 확인하세요.
                    </Text>
                  </ListItem>
                ) : null}
              </Section>
            ) : null}
            <Section title="멤버">
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
                <ListItem testID="group-detail-members-loading-row">
                  <Text modifiers={[foregroundStyle(colors.textMuted)]}>
                    멤버 불러오는 중…
                  </Text>
                </ListItem>
              ) : null}
              {detail.members.nextCursor !== null ? (
                <LoadSentinel
                  isLoading={detail.members.loadingMore}
                  onVisible={() => void actions.loadMoreMembers()}
                  testID="group-detail-members-load-more"
                />
              ) : null}
            </Section>
            <Section>
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
            </Section>
          </Form>
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
    </>
  );
}
