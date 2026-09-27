import { useLocalSearchParams } from "expo-router";
import { GroupDetailScreen } from "@/features/groups/ui/group-detail-screen";
import { GroupRouteGuard } from "@/features/groups/ui/group-route-guard";

/**
 * E11: group info opened from a chatroom's header title. Pushing the
 * existing `(tabs)/groups/[groupId]/info` route from a root-Stack screen
 * crosses into the tab navigator, which expo-router resolves by replacing
 * the root Stack down to `(tabs)` -- the same "pop the screen underneath"
 * behaviour D6 already worked around for the topic-detail route. This
 * sibling root-Stack route reuses the same `GroupDetailScreen` (no invite
 * code or other sensitive value in the path) so a push from the chatroom
 * stays on the root Stack and back returns to the chatroom. The group-home
 * title button keeps opening the `(tabs)` info route unchanged.
 */
export default function ChatroomGroupInfoRoute() {
  const { groupId } = useLocalSearchParams<{ groupId?: string | string[] }>();
  return (
    <GroupRouteGuard>
      <GroupDetailScreen groupId={typeof groupId === "string" ? groupId : ""} />
    </GroupRouteGuard>
  );
}
