import { Stack } from "expo-router";
import { GroupFormScreen } from "@/features/groups/ui/group-form-screen";
import { GroupRouteGuard } from "@/features/groups/ui/group-route-guard";

export default function JoinGroupRoute() {
  return (
    <GroupRouteGuard>
      <Stack.Screen options={{ presentation: "modal" }} />
      <GroupFormScreen mode="join" />
    </GroupRouteGuard>
  );
}
