import { useFocusEffect, useRouter } from "expo-router";
import { useCallback, useEffect } from "react";
import { useAccountScope } from "@/core/providers/app-providers";
import { useConnectedChat } from "@/features/chat/model/connected-chat-provider";
import { useTopics } from "../model/topics-provider";
import { isTopicIdentifier } from "../model/topics-input";

export function useTopicScreen(groupId: string, topicId?: string) {
  const topics = useTopics();
  const chat = useConnectedChat();
  const account = useAccountScope();
  const router = useRouter();
  const { store, ready } = topics;
  const valid =
    isTopicIdentifier(groupId) &&
    (topicId === undefined || isTopicIdentifier(topicId));
  const closeRooms = chat.actions.closeRooms;
  useFocusEffect(
    useCallback(() => {
      if (ready && valid && store)
        void (topicId
          ? store.actions.openTopic(groupId, topicId)
          : store.actions.openGroup(groupId));
      return () => {
        store?.actions.blur();
        closeRooms();
      };
    }, [store, ready, valid, groupId, topicId, closeRooms]),
  );
  useEffect(() => {
    if (chat.state.groupId === groupId && chat.state.accessLost)
      store?.actions.revoke();
  }, [chat.state.groupId, chat.state.accessLost, groupId, store]);
  const current = () =>
    store?.getState().groupId === groupId && !store.getState().accessLost;
  return {
    ...topics,
    chat,
    account,
    router,
    valid,
    current,
    scoped: topics.state.groupId === groupId && !topics.state.accessLost,
    backToTopics: () =>
      router.replace({
        pathname: "/groups/[groupId]/chatrooms",
        params: { groupId },
      }),
  };
}
