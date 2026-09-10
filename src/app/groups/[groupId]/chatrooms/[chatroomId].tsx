import { useLocalSearchParams } from "expo-router";
import { ChatRouteGuard } from "@/features/chat/ui/chat-route-guard";
import { ConnectedChatScreen } from "@/features/chat/ui/connected-chat-screen";
export default function ChatroomRoute() {
  const { groupId, chatroomId } = useLocalSearchParams<{
    groupId?: string | string[];
    chatroomId?: string | string[];
  }>();
  return (
    <ChatRouteGuard>
      <ConnectedChatScreen
        groupId={typeof groupId === "string" ? groupId : ""}
        chatroomId={typeof chatroomId === "string" ? chatroomId : ""}
      />
    </ChatRouteGuard>
  );
}
