import { useLocalSearchParams } from "expo-router";
import { ChatRouteGuard } from "@/features/chat/ui/chat-route-guard";
import { TopicsScreen } from "@/features/topics/ui/topics-screen";

/** Group home: the topic list is the first screen of a group (M14 round 1 B). */
export default function GroupHomeRoute() {
  const { groupId } = useLocalSearchParams<{ groupId?: string | string[] }>();
  const id = typeof groupId === "string" ? groupId : "";
  return (
    <ChatRouteGuard>
      <TopicsScreen key={id} groupId={id} />
    </ChatRouteGuard>
  );
}
