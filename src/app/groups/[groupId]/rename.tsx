import { useLocalSearchParams } from "expo-router";
import { GroupRenameScreen } from "@/features/groups/ui/group-rename-screen";
import { GroupRouteGuard } from "@/features/groups/ui/group-route-guard";

/**
 * I3 group rename sheet (M17/U11), presented from the iOS group info
 * screen. Declared as a root-Stack modal (title "그룹 이름 변경") in
 * `src/app/_layout.tsx`, like the other C3 input routes.
 */
export default function GroupRenameRoute() {
  const { groupId } = useLocalSearchParams<{ groupId?: string | string[] }>();
  return (
    <GroupRouteGuard>
      <GroupRenameScreen groupId={typeof groupId === "string" ? groupId : ""} />
    </GroupRouteGuard>
  );
}
