import { useLocalSearchParams } from "expo-router";
import { ChatRouteGuard } from "@/features/chat/ui/chat-route-guard";
import { TopicDetailScreen } from "@/features/topics/ui/topic-detail-screen";
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
