import {
  mapCanonicalChatMessage,
  mapChatMessage,
  mapChatReadMarker,
  mapChatroom,
} from "@/core/contracts/server";
import type { ChatApi } from "@/features/chat/data/chat-api";

export const groupId = "11111111-1111-4111-8111-111111111111";
export const chatroomId = "22222222-2222-4222-8222-222222222222";
export const userId = "33333333-3333-4333-8333-333333333333";
export const clientMessageId = "44444444-4444-4444-8444-444444444444";
export const messageId = "55555555-5555-4555-8555-555555555555";

export const chatroomWire = {
  created_at: "2024-01-01T00:00:00Z",
  group_id: groupId,
  id: chatroomId,
  topic_id: null,
  type: "main" as const,
};

export const chatMessageWire = {
  body: "안녕하세요",
  chatroom_id: chatroomId,
  client_msg_id: clientMessageId,
  created_at: "2024-01-01T00:00:00.123456Z",
  id: messageId,
  media: [],
  sender_avatar_url: null,
  sender_id: userId,
  sender_nickname: "닉네임",
  type: "user" as const,
};

export const canonicalMessageWire = {
  body: "안녕하세요",
  chatroom_id: chatroomId,
  client_msg_id: clientMessageId,
  created_at: "2024-01-01T00:00:00.123456Z",
  id: messageId,
  media: [],
  sender_id: userId,
  type: "user" as const,
};

export const readMarkerWire = {
  chatroom_id: chatroomId,
  last_read_cursor: "42",
  updated_at: "2024-01-01T00:00:00Z",
};

export const chatroom = mapChatroom(chatroomWire);
export const chatMessage = mapChatMessage(chatMessageWire);
export const canonicalMessage = mapCanonicalChatMessage(canonicalMessageWire);
export const readMarker = mapChatReadMarker(readMarkerWire);

export function fakeChatApi(): jest.Mocked<ChatApi> {
  return {
    listGroupChatrooms: jest
      .fn()
      .mockResolvedValue({ items: [chatroom], nextCursor: null }),
    listChatroomMessages: jest
      .fn()
      .mockResolvedValue({ items: [chatMessage], nextCursor: null }),
    markChatroomRead: jest.fn().mockResolvedValue(readMarker),
    sendChatMessage: jest
      .fn()
      .mockResolvedValue({ message: canonicalMessage, status: 201 }),
  };
}
