import { AccountScreen } from "@/features/home/ui/account-screen";
import { GroupRouteGuard } from "@/features/groups/ui/group-route-guard";

export default function AccountRoute() {
  return (
    <GroupRouteGuard>
      <AccountScreen />
    </GroupRouteGuard>
  );
}
