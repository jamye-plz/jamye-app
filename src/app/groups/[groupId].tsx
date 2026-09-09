import { useLocalSearchParams } from "expo-router";
import { GroupDetailScreen } from "@/features/groups/ui/group-detail-screen";
import { GroupRouteGuard } from "@/features/groups/ui/group-route-guard";

export default function GroupDetailRoute() {
  const { groupId } = useLocalSearchParams<{ groupId?: string | string[] }>();
  return (
    <GroupRouteGuard>
      <GroupDetailScreen groupId={typeof groupId === "string" ? groupId : ""} />
    </GroupRouteGuard>
  );
}
