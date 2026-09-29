import { AccountRestoreNotice } from "@/features/auth/ui/account-restore-notice";
import { GroupListScreen } from "@/features/groups/ui/group-list-screen";
import { GroupRouteGuard } from "@/features/groups/ui/group-route-guard";
import { SystemFeedbackHost } from "@/shared/ui/system-feedback";

/**
 * G2/E13: the group list is one of the two possible first screens after
 * login, so it gets a `SystemFeedbackHost` (previously absent on iOS, which
 * is why the "계정이 복구되었습니다." notice never rendered there) plus the
 * one-shot `AccountRestoreNotice`. `GroupListScreen` itself stays
 * feature-owned and unmodified.
 */
export default function GroupsRoute() {
  return (
    <GroupRouteGuard>
      <SystemFeedbackHost testID="groups-route-restore-notice">
        <GroupListScreen />
        <AccountRestoreNotice />
      </SystemFeedbackHost>
    </GroupRouteGuard>
  );
}
