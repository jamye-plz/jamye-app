import { GroupFormScreen } from "@/features/groups/ui/group-form-screen";
import { GroupRouteGuard } from "@/features/groups/ui/group-route-guard";

export default function CreateGroupRoute() {
  return (
    <GroupRouteGuard>
      <GroupFormScreen mode="create" />
    </GroupRouteGuard>
  );
}
