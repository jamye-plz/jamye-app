import { useEffect, useRef } from "react";

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
 *
 * Only the focused chat screen requests anything. `rooms` and the topics
 * store's `detail` are single shared slices, so a chat screen left mounted
 * underneath (another group's chat still in the stack) re-requested its own
 * group whenever the focused one loaded, and the two loads cancelled each
 * other until one group's list stuck -- the focused chat then showed `대화`
 * (device round). A screen that regains focus finds the slice stale and
 * requests again.
 */
export function useChatroomTitle(
  groupId: string,
  chatroomId: string,
  focused: boolean,
): ChatroomTitleResolution {
  const chat = useConnectedChat();
  const topics = useTopics();
  const groupName = useGroupName(groupId);

  const roomsFresh =
    chat.state.groupId === groupId && chat.state.rooms.status !== "idle";
  useEffect(() => {
    if (!focused || !chat.ready || roomsFresh || !groupId) return;
    void chat.actions.loadRooms(groupId);
  }, [chat.ready, chat.actions, focused, groupId, roomsFresh]);

  const room =
    chat.state.groupId === groupId
      ? chat.state.rooms.items.find((item) => item.chatroomId === chatroomId)
      : undefined;
  // Another member's topic created after these rooms were loaded is missing
  // from an otherwise loaded list. Reload once per chatroom, so its title
  // resolves and connected-chat-screen can recognize the topic's later
  // deletion (its sticky topic id needs the room).
  const roomKnown = room !== undefined;
  const roomsLoaded = roomsFresh && chat.state.rooms.status === "ready";
  const missingRoomReloadRef = useRef<string | null>(null);
  useEffect(() => {
    if (!focused || !chat.ready || !groupId || !roomsLoaded || roomKnown)
      return;
    if (missingRoomReloadRef.current === chatroomId) return;
    missingRoomReloadRef.current = chatroomId;
    void chat.actions.loadRooms(groupId);
  }, [
    chat.ready,
    chat.actions,
    chatroomId,
    focused,
    groupId,
    roomKnown,
    roomsLoaded,
  ]);
  const topicId = room?.kind === "topic" ? room.topicId : null;

  const detail = topics.state.detail;
  const topicDetailFresh = detail.id === topicId && detail.status !== "idle";
  useEffect(() => {
    if (!focused || !topics.ready || !topicId || topicDetailFresh) return;
    void topics.store?.actions.openTopic(groupId, topicId);
  }, [focused, topics.ready, topics.store, groupId, topicId, topicDetailFresh]);

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
