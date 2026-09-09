import { GroupFormScreen } from "@/features/groups/ui/group-form-screen";
import { GroupRouteGuard } from "@/features/groups/ui/group-route-guard";

export default function JoinGroupRoute() {
  return (
    <GroupRouteGuard>
      <GroupFormScreen mode="join" />
    </GroupRouteGuard>
  );
}
