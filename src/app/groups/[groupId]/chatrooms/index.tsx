import { useLocalSearchParams } from "expo-router";
import { ChatRouteGuard } from "@/features/chat/ui/chat-route-guard";
import { TopicsScreen } from "@/features/topics/ui/topics-screen";
export default function ChatRoomsRoute() {
  const { groupId } = useLocalSearchParams<{ groupId?: string | string[] }>();
  return (
    <ChatRouteGuard>
      <TopicsScreen
        key={typeof groupId === "string" ? groupId : ""}
        groupId={typeof groupId === "string" ? groupId : ""}
      />
    </ChatRouteGuard>
  );
}
