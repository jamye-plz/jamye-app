import { BottomSheet, Host, List, ListItem, Text } from "@expo/ui";
import { useCallback, useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import { Alert } from "react-native";

import type { Group, Member } from "@/core/contracts/server";
import { useSession } from "@/core/providers/session-provider";
import { useAppTheme } from "@/core/theme/theme-provider";
import type { RowAction } from "@/shared/ui/action-list-item.types";

import { useGroupsStore } from "../model/groups-provider";
import { groupErrorMessage } from "./group-controls";
import { GroupOwnerPanel } from "./group-owner-panel";

const MUTED = { opacity: 0.65 } as const;

/**
 * Row actions for the group list: owners get 초대 코드 발급 and 소유권 이전
 * (pick a member), everyone else gets 그룹 나가기. The store's management
 * actions run against the opened group, so each action opens that group
 * first; the overlays (invite sheet, member picker) read the opened state and
 * close the group again when they are dismissed or the action settles.
 */
export function useGroupRowActions(): Readonly<{
  actionsFor: (group: Group) => RowAction[];
  overlays: ReactNode;
}> {
  const { state, actions } = useGroupsStore();
  const { principal } = useSession();
  const { colors } = useAppTheme();
  const [inviteFor, setInviteFor] = useState<string | null>(null);
  const [transferFor, setTransferFor] = useState<Group | null>(null);
  const alive = useRef(true);
  const rowMutation = useRef(false);
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

  const finish = useCallback(() => {
    setInviteFor(null);
    setTransferFor(null);
    actions.clearInvite();
    actions.closeGroup();
  }, [actions]);

  const me = principal?.userId ?? null;
  const busy = state.management.status === "pending";
  const opened = (id: string) => state.detail.id === id;

  const leave = (group: Group) => {
    if (!me) return;
    Alert.alert(
      "그룹 나가기",
      "이 그룹에 더 이상 접근할 수 없게 됩니다. 나갈까요?",
      [
        { style: "cancel", text: "취소" },
        {
          onPress: () => {
            void (async () => {
              await actions.openGroup(group.id);
              if (!alive.current) return;
              rowMutation.current = true;
              const ok = await actions.removeMember(me);
              if (alive.current && ok) actions.closeGroup();
            })();
          },
          style: "destructive",
          text: "확인",
        },
      ],
    );
  };

  const transfer = (member: Member) => {
    setTransferFor(null);
    Alert.alert(
      "소유권 이전",
      `${member.nickname}에게 소유권을 넘기면 나는 일반 멤버가 됩니다. 이전할까요?`,
      [
        { onPress: () => actions.closeGroup(), style: "cancel", text: "취소" },
        {
          onPress: () => {
            void (async () => {
              rowMutation.current = true;
              const ok = await actions.transferOwnership(member.userId);
              if (alive.current && ok) actions.closeGroup();
            })();
          },
          style: "destructive",
          text: "확인",
        },
      ],
    );
  };

  const actionsFor = (group: Group): RowAction[] =>
    group.ownerId === me
      ? [
          {
            disabled: busy,
            key: "invite",
            onPress: () => {
              void actions.openGroup(group.id);
              setInviteFor(group.id);
            },
            symbol: "invite",
            title: "초대 코드 발급",
          },
          {
            disabled: busy,
            key: "transfer",
            onPress: () => {
              void actions.openGroup(group.id);
              setTransferFor(group);
            },
            symbol: "transfer",
            title: "소유권 이전",
          },
        ]
      : [
          {
            destructive: true,
            disabled: busy,
            key: "leave",
            onPress: () => leave(group),
            symbol: "leave",
            title: "그룹 나가기",
          },
        ];

  const members =
    transferFor && opened(transferFor.id) ? state.detail.members : null;
  const candidates = members
    ? members.items.filter((member) => member.userId !== me)
    : [];
  const overlays = (
    <>
      <GroupOwnerPanel
        isPresented={inviteFor !== null && opened(inviteFor)}
        onDismiss={finish}
      />
      <Host seedColor={colors.primary}>
        <BottomSheet isPresented={transferFor !== null} onDismiss={finish}>
          <List testID="group-transfer-picker">
            <Text textStyle={{ fontSize: 17, fontWeight: "600" }}>
              소유권을 넘길 멤버
            </Text>
            {candidates.map((member) => (
              <ListItem
                key={member.userId}
                onPress={() => transfer(member)}
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
      </Host>
    </>
  );
  return { actionsFor, overlays };
}
