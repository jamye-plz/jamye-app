import { useLocalSearchParams } from "expo-router";
import { ChatRouteGuard } from "@/features/chat/ui/chat-route-guard";
import { ChatRoomsScreen } from "@/features/chat/ui/chat-rooms-screen";
export default function ChatRoomsRoute() {
  const { groupId } = useLocalSearchParams<{ groupId?: string | string[] }>();
  return (
    <ChatRouteGuard>
      <ChatRoomsScreen groupId={typeof groupId === "string" ? groupId : ""} />
    </ChatRouteGuard>
  );
}
