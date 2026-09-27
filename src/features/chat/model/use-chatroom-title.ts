import { useEffect } from "react";

import { useGroupName } from "@/features/groups/model/groups-provider";
import { useTopics } from "@/features/topics/model/topics-provider";

import { useConnectedChat } from "./connected-chat-provider";

export type ChatroomTitleResolution = Readonly<{
  kind: "main" | "topic" | "unresolved";
  /** Neutral placeholder while `kind === "unresolved"` (D7/E4). */
  title: string;
  /** Set only for `kind === "topic"`, once resolved. */
  targetTopicId: string | null;
}>;

/**
 * D7/E4/E11 chatroom title resolution: which chatroom this is (main vs
 * topic) comes from the group's chatroom list (C1's `Chatroom.type`/
 * `topic_id`), matched against the route's `chatroomId` -- never from
 * whatever `useConnectedChat()`'s shared `rooms` slice happens to hold,
 * since the group home clears that slice on blur exactly when navigating
 * into a chatroom (`use-topic-screen.ts`'s `closeRooms()`). This hook always
 * (re)requests the group's chatrooms itself instead of assuming a caller
 * already loaded them, and once a `topic` room is identified, opens that
 * topic in the shared topics store (`주제 조회`) to read its title -- the
 * same store `TopicDetailScreen` reads from, so this pre-warms rather than
 * duplicates that fetch. Before both resolve, the title stays neutral and
 * the caller must not wire up a tap target.
 */
export function useChatroomTitle(
  groupId: string,
  chatroomId: string,
): ChatroomTitleResolution {
  const chat = useConnectedChat();
  const topics = useTopics();
  const groupName = useGroupName(groupId);

  const roomsFresh =
    chat.state.groupId === groupId && chat.state.rooms.status !== "idle";
  useEffect(() => {
    if (!chat.ready || roomsFresh || !groupId) return;
    void chat.actions.loadRooms(groupId);
  }, [chat.ready, chat.actions, groupId, roomsFresh]);

  const room =
    chat.state.groupId === groupId
      ? chat.state.rooms.items.find((item) => item.chatroomId === chatroomId)
      : undefined;
  const topicId = room?.kind === "topic" ? room.topicId : null;

  const detail = topics.state.detail;
  const topicDetailFresh = detail.id === topicId && detail.status !== "idle";
  useEffect(() => {
    if (!topics.ready || !topicId || topicDetailFresh) return;
    void topics.store?.actions.openTopic(groupId, topicId);
  }, [topics.ready, topics.store, groupId, topicId, topicDetailFresh]);

  if (!room) return { kind: "unresolved", targetTopicId: null, title: "대화" };
  if (room.kind === "main")
    return { kind: "main", targetTopicId: null, title: groupName ?? "그룹" };
  const topicTitle =
    detail.id === topicId && detail.status === "ready"
      ? detail.topic?.title
      : undefined;
  return topicTitle
    ? { kind: "topic", targetTopicId: topicId, title: topicTitle }
    : { kind: "unresolved", targetTopicId: null, title: "대화" };
}
