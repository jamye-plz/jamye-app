import { useLocalSearchParams } from "expo-router";
import { ChatRouteGuard } from "@/features/chat/ui/chat-route-guard";
import { TopicDetailScreen } from "@/features/topics/ui/topic-detail-screen";

/**
 * D6: topic detail moved out of `(tabs)` into the root Stack, pushed above
 * the topic's chatroom (same URL as before -- `(tabs)` groups do not appear
 * in the URL -- so `new_topic` push/notification-inbox destinations, E5,
 * keep working unchanged). Back returns to the chatroom underneath.
 */
export default function TopicDetailRoute() {
  const params = useLocalSearchParams<{
    groupId?: string | string[];
    topicId?: string | string[];
  }>();
  const groupId = typeof params.groupId === "string" ? params.groupId : "";
  const topicId = typeof params.topicId === "string" ? params.topicId : "";
  return (
    <ChatRouteGuard>
      <TopicDetailScreen
        key={`${groupId}:${topicId}`}
        groupId={groupId}
        topicId={topicId}
      />
    </ChatRouteGuard>
  );
}
