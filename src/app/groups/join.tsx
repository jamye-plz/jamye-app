import { Stack } from "expo-router";
import { AccountRestoreNotice } from "@/features/auth/ui/account-restore-notice";
import { GroupFormScreen } from "@/features/groups/ui/group-form-screen";
import { GroupRouteGuard } from "@/features/groups/ui/group-route-guard";
import { SystemFeedbackHost } from "@/shared/ui/system-feedback";

/**
 * G2/E13: opening an invite link before signing in lands here right after
 * login, so this is the other possible first post-login screen -- same
 * `SystemFeedbackHost` + one-shot `AccountRestoreNotice` pairing as the
 * group list route. `GroupFormScreen` itself stays feature-owned.
 */
export default function JoinGroupRoute() {
  return (
    <GroupRouteGuard>
      <Stack.Screen options={{ presentation: "modal" }} />
      <SystemFeedbackHost testID="groups-join-restore-notice">
        <GroupFormScreen mode="join" />
        <AccountRestoreNotice />
      </SystemFeedbackHost>
    </GroupRouteGuard>
  );
}
