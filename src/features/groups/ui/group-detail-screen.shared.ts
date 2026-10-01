import { useFocusEffect, useIsFocused, useRouter } from "expo-router";
import { useCallback, useEffect, useRef, useState } from "react";
import { Share } from "react-native";

import { parsePublicApiOrigin } from "@/core/config/public-env";
import type { Member } from "@/core/contracts/server";
import { useSession } from "@/core/providers/session-provider";
import type { RowAction } from "@/shared/ui/action-list-item.types";
import type { HeaderAction } from "@/shared/ui/header-actions.types";

import { isGroupIdentifier } from "../model/groups-input";
import { useGroupsStore } from "../model/groups-provider";
import {
  buildInviteShareMessage,
  sevenDaysFromNowIso,
} from "./group-row-actions";

// R1: identical on both platform files (`group-detail-screen.ios.tsx`,
// `group-detail-screen.tsx`), so they live here once instead of twice.
export const HEADER_AVATAR_SIZE = 72;
export const ROW_AVATAR_SIZE = 40;
// Inset-grouped List: 16pt screen margin + 16pt row inset on each side.
export const IOS_ROW_INSETS = 64;
export function noop(): void {}

/**
 * I1-I6 state, effects and handlers shared by the Android/default
 * (`group-detail-screen.tsx`) and iOS (`.ios.tsx`, M17/E7g) group info
 * screens. Layout-only values that only feed JSX built in each platform
 * file (`useWindowDimensions`, the iOS inset-grouped row width constant)
 * stay local to those files, not here.
 */
export function useGroupDetailScreen(groupId: string) {
  const { state, actions, getState } = useGroupsStore();
  const { principal } = useSession();
  const router = useRouter();
  const lifetime = useRef<symbol | null>(null);
  // Leaving the screen clears the store's detail (closeGroup) while the pop
  // animation still shows it; keep drawing the last focused detail so the
  // native list is not rebuilt mid-transition.
  const focused = useIsFocused();
  const [shownDetail, setShownDetail] = useState(state.detail);
  if (focused && shownDetail !== state.detail) setShownDetail(state.detail);
  const detail = focused ? state.detail : shownDetail;
  // Android's in-screen I3 rename dialog. iOS presents the rename sheet
  // route instead (`presentRename` below).
  const [renameOpen, setRenameOpen] = useState(false);
  // I3 on iOS (M17/U11): the rename sheet is the `groups/[groupId]/rename`
  // root-Stack modal, so presenting it blurs this screen. The sheet renames
  // the detail this screen has open (the management actions act on the
  // store's open detail), so that one blur hands the detail over instead of
  // closing it; refocusing re-opens (refreshes) it as usual.
  const renameHandoff = useRef(false);
  const [shareBusy, setShareBusy] = useState(false);
  const [shareFailed, setShareFailed] = useState(false);
  const [transferTarget, setTransferTarget] = useState<Member | null>(null);
  const [removeTarget, setRemoveTarget] = useState<Member | null>(null);
  const [leaveConfirm, setLeaveConfirm] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState(false);
  const valid = isGroupIdentifier(groupId);
  useFocusEffect(
    useCallback(() => {
      lifetime.current = Symbol();
      if (valid) void actions.openGroup(groupId);
      return () => {
        lifetime.current = null;
        if (renameHandoff.current) renameHandoff.current = false;
        else actions.closeGroup();
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

  function presentRename(): void {
    renameHandoff.current = true;
    router.push({ params: { groupId }, pathname: "/groups/[groupId]/rename" });
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

  // I5 (M17/U12): the invite share is the header's trailing button, for the
  // owner only (only the owner may create invites). Always an array, never
  // an unmounted `HeaderActions`: Android's `headerRight` would otherwise
  // outlive a lost owner role.
  const headerActions: HeaderAction[] = owner
    ? [
        {
          accessibilityLabel: "초대 링크 공유",
          disabled: shareBusy,
          key: "share",
          onPress: () => void shareInvite(),
          symbol: "share",
        },
      ]
    : [];

  const error = detail.id === groupId ? detail.error : null;
  const firstLoad = valid && !group && !error;

  return {
    actions,
    busy,
    deleteConfirm,
    detail,
    error,
    firstLoad,
    getState,
    group,
    headerActions,
    leaveConfirm,
    me,
    memberActionsFor,
    owner,
    presentRename,
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
  };
}
