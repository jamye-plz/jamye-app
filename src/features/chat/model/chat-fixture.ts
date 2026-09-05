import type { FixtureConversationSeed } from "@/core/database/repositories/database-repository";

export const FIXTURE_CONVERSATION_ID = "fixture-conversation";

export const LOCAL_FIXTURE_NOTICE =
  "로컬 개발용 fixture 데이터입니다. production server에 연결되어 있지 않습니다.";

export const FIXTURE_CONVERSATION_SEED: FixtureConversationSeed = {
  conversation: {
    id: FIXTURE_CONVERSATION_ID,
    kind: "fixture",
    title: "로컬 대화",
    updatedAtMs: 100,
  },
  messages: [
    {
      body: "fixture sent message",
      clientMsgId: null,
      conversationId: FIXTURE_CONVERSATION_ID,
      createdAtMs: 100,
      eventId: "fixture-event-1",
      localId: "fixture-message-sent",
      senderId: "fixture-sender",
      serverSequence: 1,
      status: "sent",
    },
    {
      body: "fixture failed message",
      clientMsgId: "fixture-client-failed-1",
      conversationId: FIXTURE_CONVERSATION_ID,
      createdAtMs: 110,
      eventId: null,
      localId: "fixture-message-failed",
      senderId: "fixture-sender",
      serverSequence: null,
      status: "failed",
    },
  ],
  outboxCommands: [
    {
      body: "fixture failed message",
      clientMsgId: "fixture-client-failed-1",
      commandId: "outbox:fixture-client-failed-1",
      commandType: "message.create",
      conversationId: FIXTURE_CONVERSATION_ID,
      createdAtMs: 110,
      state: "failed",
    },
  ],
};
