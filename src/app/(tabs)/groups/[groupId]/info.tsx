import { useLocalSearchParams } from "expo-router";
import { GroupDetailScreen } from "@/features/groups/ui/group-detail-screen";
import { GroupRouteGuard } from "@/features/groups/ui/group-route-guard";

/** Group info: members, invites and owner management (M14 round 1 B). */
export default function GroupInfoRoute() {
  const { groupId } = useLocalSearchParams<{ groupId?: string | string[] }>();
  return (
    <GroupRouteGuard>
      <GroupDetailScreen groupId={typeof groupId === "string" ? groupId : ""} />
    </GroupRouteGuard>
  );
}
