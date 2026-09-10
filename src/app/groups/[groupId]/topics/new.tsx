import { useLocalSearchParams } from "expo-router";
import { ChatRouteGuard } from "@/features/chat/ui/chat-route-guard";
import { TopicCreateScreen } from "@/features/topics/ui/topic-create-screen";
export default function TopicCreateRoute() {
  const { groupId } = useLocalSearchParams<{ groupId?: string | string[] }>();
  const id = typeof groupId === "string" ? groupId : "";
  return (
    <ChatRouteGuard>
      <TopicCreateScreen key={id} groupId={id} />
    </ChatRouteGuard>
  );
}
