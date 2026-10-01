import { useNavigation } from "expo-router";
import { useEffect } from "react";

const TOPIC_ROUTE = "groups/[groupId]/topics/[topicId]";
const CHATROOM_ROUTE = "groups/[groupId]/chatrooms/[chatroomId]";

type StackRoute = Readonly<{ key?: string; name: string; params?: object }>;
type RouteParams = Readonly<{
  chatroomId?: unknown;
  groupId?: unknown;
  topicId?: unknown;
}>;
type TopicChat = Readonly<{
  chatroomId: string;
  groupId: string;
  topicId: string;
}>;

/**
 * The stack's routes with this topic's own chat in place of a different
 * chatroom of the same group directly beneath the topic's detail, or `null`
 * when there is nothing to swap: the topic was opened from its own chat (the
 * header-title path), or something other than a same-group chatroom sits
 * beneath it. The swapped-in route carries no key, so the reset gives it a
 * fresh one; every other route keeps its key and state.
 */
export function withTopicChatBeneath(
  routes: readonly StackRoute[],
  topic: TopicChat,
): StackRoute[] | null {
  let index = -1;
  for (let i = routes.length - 1; i >= 0; i -= 1) {
    const params = routes[i]!.params as RouteParams | undefined;
    if (
      routes[i]!.name === TOPIC_ROUTE &&
      params?.groupId === topic.groupId &&
      params.topicId === topic.topicId
    ) {
      index = i;
      break;
    }
  }
  const beneath = index > 0 ? routes[index - 1] : undefined;
  const params = beneath?.params as RouteParams | undefined;
  if (
    beneath?.name !== CHATROOM_ROUTE ||
    params?.groupId !== topic.groupId ||
    params.chatroomId === topic.chatroomId
  )
    return null;
  return routes.map((route, i) =>
    i === index - 1
      ? {
          name: CHATROOM_ROUTE,
          params: { chatroomId: topic.chatroomId, groupId: topic.groupId },
        }
      : route,
  );
}

/**
 * M17 device feedback (U13): a topic opened from its announcement in the
 * group's main chat reads like one opened from the topic list -- back
 * returns to the topic's own chat, and back again to the topic list. Once
 * the topic (and so its chatroom) is known, the main chat beneath this
 * screen is swapped for the topic's chat. Only a route below the visible
 * screen changes, so nothing animates; a user who goes back before the
 * topic has loaded simply returns to the main chat.
 */
export function useTopicChatBeneath(
  groupId: string,
  topicId: string,
  chatroomId: string | undefined,
): void {
  const navigation = useNavigation();
  useEffect(() => {
    if (!chatroomId) return;
    const state = navigation.getState();
    if (!state) return;
    const routes = withTopicChatBeneath(state.routes, {
      chatroomId,
      groupId,
      topicId,
    });
    if (routes)
      navigation.reset({ ...state, routes } as Parameters<
        typeof navigation.reset
      >[0]);
  }, [chatroomId, groupId, navigation, topicId]);
}
