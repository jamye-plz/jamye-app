import { Host } from "@expo/ui";
import { Stack, useLocalSearchParams } from "expo-router";

import { useAppTheme } from "@/core/theme/theme-provider";
import { useGroupsStore } from "@/features/groups/model/groups-provider";
import { ChatroomMediaGridScreen } from "@/features/media/ui/chatroom-media-grid-screen";
import { StandardStateView } from "@/shared/ui/standard-state-view";

/**
 * E7d/GROUPS-AC5 (U6): group info's "사진·동영상" row destination -- reuses
 * D4's `ChatroomMediaGridScreen` against the group's *main* chatroom.
 * `chatroomId` normally arrives as a route param (the entry row already
 * knows `Group.mainChatroomId`); when it doesn't -- e.g. a bare deep link --
 * this falls back to a single cache-only lookup against whatever
 * `GroupsProvider` already has open/listed for this group (no extra fetch:
 * the E7d contract explicitly accepts "실패 시 빈 state"), then shows the
 * same-shaped empty state `ChatroomMediaGridScreen`'s own error view uses.
 * Titled "갤러리" like the topic gallery route (M17 round 1 closure); only
 * the entry row keeps the "사진·동영상" label.
 */
export default function GroupGalleryRoute() {
  const { groupId, chatroomId } = useLocalSearchParams<{
    groupId: string;
    chatroomId?: string;
  }>();
  const { colors } = useAppTheme();
  const { state } = useGroupsStore();
  const resolvedGroupId = typeof groupId === "string" ? groupId : null;
  const fallbackChatroomId =
    resolvedGroupId && state.detail.id === resolvedGroupId
      ? (state.detail.group?.mainChatroomId ?? null)
      : (state.list.items.find((item) => item.id === resolvedGroupId)
          ?.mainChatroomId ?? null);
  const resolvedChatroomId =
    typeof chatroomId === "string" ? chatroomId : fallbackChatroomId;

  return (
    <>
      <Stack.Screen options={{ title: "갤러리" }} />
      {resolvedChatroomId ? (
        <ChatroomMediaGridScreen chatroomId={resolvedChatroomId} />
      ) : (
        <Host seedColor={colors.primary} style={{ flex: 1 }}>
          <StandardStateView
            kind="empty"
            systemImage="gallery"
            testID="group-gallery-empty"
            title="사진·동영상을 찾을 수 없습니다"
          />
        </Host>
      )}
    </>
  );
}
