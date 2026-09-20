import { GroupRouteGuard } from "@/features/groups/ui/group-route-guard";
import { NotificationsInboxScreen } from "@/features/notifications/ui/notifications-inbox-screen";

export default function NotificationsRoute() {
  return (
    <GroupRouteGuard>
      <NotificationsInboxScreen />
    </GroupRouteGuard>
  );
}
