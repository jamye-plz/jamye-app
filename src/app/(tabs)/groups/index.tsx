import { GroupListScreen } from "@/features/groups/ui/group-list-screen";
import { GroupRouteGuard } from "@/features/groups/ui/group-route-guard";

export default function GroupsRoute() {
  return (
    <GroupRouteGuard>
      <GroupListScreen />
    </GroupRouteGuard>
  );
}
