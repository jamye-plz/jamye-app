import { Stack, useLocalSearchParams } from "expo-router";

import { ChatroomMediaGridScreen } from "@/features/media/ui/chatroom-media-grid-screen";

/**
 * D4 "모두 보기" route: pushed on the root Stack above the topic detail route
 * (which is itself pushed above the chatroom per D6/D7), title "갤러리".
 * `chatroomId` travels as a query param -- it is not sensitive (E10/prompt),
 * so this screen doesn't have to re-fetch the topic just to learn its
 * chatroom.
 */
export default function GalleryRoute() {
  const { chatroomId } = useLocalSearchParams<{
    groupId: string;
    topicId: string;
    chatroomId: string;
  }>();
  return (
    <>
      <Stack.Screen options={{ title: "갤러리" }} />
      {typeof chatroomId === "string" ? (
        <ChatroomMediaGridScreen chatroomId={chatroomId} />
      ) : null}
    </>
  );
}
