import { BottomSheet, Host, List, ListItem, Text } from "@expo/ui";
import { useCallback, useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import { Alert, Share } from "react-native";

import { parsePublicApiOrigin } from "@/core/config/public-env";
import type { Group, Member } from "@/core/contracts/server";
import { useSession } from "@/core/providers/session-provider";
import { useAppTheme } from "@/core/theme/theme-provider";
import { Avatar } from "@/shared/ui/avatar";
import { ConfirmAlert } from "@/shared/ui/confirm-alert";
import type { RowAction } from "@/shared/ui/action-list-item.types";

import { useGroupsStore } from "../model/groups-provider";
import { groupErrorMessage } from "./group-controls";

const MUTED = { opacity: 0.65 } as const;
const INVITE_LIFETIME_MS = 7 * 24 * 60 * 60 * 1000;

/** ISO 8601 timestamp 7 days from now (G5: unlimited-use, 7-day invites). */
export function sevenDaysFromNowIso(now = Date.now()): string {
  return new Date(now + INVITE_LIFETIME_MS).toISOString();
}

/** `그룹 이름에 참여하세요` share message body (G5): both the https link and
 * the raw code, so a recipient without link support can still join by
 * typing the code in. Never includes anything beyond the group name/code. */
export function buildInviteShareMessage(
  groupName: string,
  apiOrigin: string,
  code: string,
): string {
  return `${groupName} 그룹에 참여하세요.\n${apiOrigin}/invite/${code}\n초대 코드: ${code}\n7일 동안 유효`;
}

/**
 * Row actions for the group list and group info screens: owners get
 * 초대 링크 공유 (G5) and 소유권 이전 (G6, pick a member), everyone else gets
 * 그룹 나가기 (G7). All three confirmations are the centered `ConfirmAlert`
 * (C2); the invite flow never shows its own sheet -- it creates a 7-day
 * unlimited-use invite and opens the system share sheet directly. The
 * store's management actions run against whichever group is currently
 * "open" in `state.detail`, so each flow opens that group first and closes
 * it again once it settles.
 */
export function useGroupRowActions(): Readonly<{
  actionsFor: (group: Group) => RowAction[];
  myUserId: string | null;
  overlays: ReactNode;
}> {
  const { state, actions, getState } = useGroupsStore();
  const { principal } = useSession();
  const { colors } = useAppTheme();
  const [shareBusyId, setShareBusyId] = useState<string | null>(null);
  const [shareFailedFor, setShareFailedFor] = useState<Group | null>(null);
  const [transferPickerFor, setTransferPickerFor] = useState<Group | null>(
    null,
  );
  const [transferConfirmFor, setTransferConfirmFor] = useState<Member | null>(
    null,
  );
  const [leaveConfirmFor, setLeaveConfirmFor] = useState<Group | null>(null);
  const alive = useRef(true);
  const rowMutation = useRef(false);
  const pickedCandidate = useRef(false);
  useEffect(
    () => () => {
      alive.current = false;
    },
    [],
  );
  useEffect(() => {
    if (!rowMutation.current) return;
    if (
      state.management.status === "failed" ||
      state.management.status === "uncertain"
    ) {
      rowMutation.current = false;
      Alert.alert("그룹 작업 실패", groupErrorMessage(state.management.error));
    } else if (state.management.status === "succeeded") {
      rowMutation.current = false;
    }
  }, [state.management]);

  const me = principal?.userId ?? null;
  const opened = useCallback(
    (id: string) => getState().detail.id === id,
    [getState],
  );

  const shareInvite = useCallback(
    async (group: Group) => {
      setShareBusyId(group.id);
      await actions.openGroup(group.id);
      if (!alive.current) return;
      const ok = await actions.createInvite(
        { expiresAt: sevenDaysFromNowIso(), maxUses: null },
        true,
      );
      if (!alive.current) return;
      const invite = ok ? getState().invite : null;
      actions.closeGroup();
      setShareBusyId(null);
      if (!invite) {
        setShareFailedFor(group);
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
    },
    [actions, getState],
  );

  const leaveGroup = useCallback(
    async (group: Group) => {
      if (!me) return;
      await actions.openGroup(group.id);
      if (!alive.current) return;
      rowMutation.current = true;
      const ok = await actions.removeMember(me);
      if (alive.current && ok) actions.closeGroup();
    },
    [actions, me],
  );

  const actionsFor = useCallback(
    (group: Group): RowAction[] =>
      group.ownerId === me
        ? [
            {
              disabled: shareBusyId === group.id,
              key: "share",
              onPress: () => void shareInvite(group),
              symbol: "share",
              title: "초대 링크 공유",
            },
            {
              key: "transfer",
              onPress: () => {
                void actions.openGroup(group.id);
                setTransferPickerFor(group);
              },
              symbol: "transfer",
              title: "소유권 이전",
            },
          ]
        : [
            {
              destructive: true,
              key: "leave",
              onPress: () => setLeaveConfirmFor(group),
              symbol: "leave",
              title: "그룹 나가기",
            },
          ],
    [actions, me, shareBusyId, shareInvite],
  );

  const members =
    transferPickerFor && opened(transferPickerFor.id)
      ? state.detail.members
      : null;
  const candidates = members
    ? members.items.filter((member) => member.userId !== me)
    : [];

  const overlays = (
    <Host seedColor={colors.primary}>
      <BottomSheet
        isPresented={transferPickerFor !== null}
        onDismiss={() => {
          setTransferPickerFor(null);
          if (pickedCandidate.current) {
            pickedCandidate.current = false;
            return;
          }
          actions.closeGroup();
        }}
      >
        <List testID="group-transfer-picker">
          <Text textStyle={{ fontSize: 17, fontWeight: "600" }}>
            소유권을 넘길 멤버
          </Text>
          {candidates.map((member) => (
            <ListItem
              key={member.userId}
              leading={
                <Avatar
                  name={member.nickname}
                  size={32}
                  uri={member.avatarUrl}
                />
              }
              onPress={() => {
                pickedCandidate.current = true;
                setTransferPickerFor(null);
                setTransferConfirmFor(member);
              }}
              supportingText="멤버"
              testID={`group-transfer-${member.userId}`}
            >
              <Text>{member.nickname}</Text>
            </ListItem>
          ))}
          {members === null || members.status === "loading" ? (
            <Text style={MUTED}>멤버 불러오는 중…</Text>
          ) : candidates.length === 0 ? (
            <Text style={MUTED}>소유권을 넘길 멤버가 없습니다.</Text>
          ) : null}
        </List>
      </BottomSheet>
      <ConfirmAlert
        confirmLabel="이전"
        destructive
        isPresented={transferConfirmFor !== null}
        message={
          transferConfirmFor
            ? `${transferConfirmFor.nickname}에게 소유권을 넘기면 나는 일반 멤버가 됩니다. 이전할까요?`
            : undefined
        }
        onConfirm={() => {
          const member = transferConfirmFor;
          setTransferConfirmFor(null);
          if (!member) return;
          rowMutation.current = true;
          void actions.transferOwnership(member.userId).then((ok) => {
            if (alive.current && ok) actions.closeGroup();
          });
        }}
        onDismiss={() => {
          setTransferConfirmFor(null);
          actions.closeGroup();
        }}
        testID="group-transfer-confirm"
        title="소유권 이전"
      />
      <ConfirmAlert
        confirmLabel="나가기"
        destructive
        isPresented={leaveConfirmFor !== null}
        message="이 그룹에 더 이상 접근할 수 없게 됩니다. 나갈까요?"
        onConfirm={() => {
          const group = leaveConfirmFor;
          setLeaveConfirmFor(null);
          if (group) void leaveGroup(group);
        }}
        onDismiss={() => setLeaveConfirmFor(null)}
        testID="group-leave-confirm"
        title="그룹 나가기"
      />
      <ConfirmAlert
        confirmLabel="다시 시도"
        isPresented={shareFailedFor !== null}
        message="네트워크 상태를 확인한 뒤 다시 시도하세요."
        onConfirm={() => {
          const group = shareFailedFor;
          setShareFailedFor(null);
          if (group) void shareInvite(group);
        }}
        onDismiss={() => setShareFailedFor(null)}
        testID="group-share-failed"
        title="초대 링크를 만들지 못했습니다"
      />
    </Host>
  );
  return { actionsFor, myUserId: me, overlays };
}
