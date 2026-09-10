import type { AccountPrincipal } from "@/core/database/account/types";
import type {
  ConnectedChatMessage,
  ConnectedChatroom,
  ConnectedChatRepository,
  ConnectedMessageAndCommand,
  ConnectedMessageCursor,
} from "@/core/database/account/connected-chat-types";
import type {
  CanonicalChatMessage,
  Chatroom,
  ChatMessage as WireChatMessage,
} from "@/core/contracts/server";
import type { ChatApi } from "@/features/chat/data/chat-api";
import type { ConnectedChatSyncFactory } from "@/features/chat/model/connected-chat-store";

export function fakeConnectedSync() {
  const runtime = {
    start: jest.fn(),
    wake: jest.fn(),
    setConversations: jest.fn(),
    pause: jest.fn(),
    resume: jest.fn(),
    dispose: jest.fn(),
  };
  const bindings: Parameters<ConnectedChatSyncFactory>[0][] = [];
  const create: ConnectedChatSyncFactory = (binding) => {
    bindings.push(binding);
    return runtime;
  };
  return { runtime, bindings, create };
}

export const PRINCIPAL: AccountPrincipal = Object.freeze({
  epoch: 1,
  origin: "https://api.jamye.example",
  userId: "11111111-1111-4111-8111-111111111111",
});

export const GROUP_ID = "22222222-2222-4222-8222-222222222222";
export const CHATROOM_ID = "33333333-3333-4333-8333-333333333333";
export const OTHER_CHATROOM_ID = "44444444-4444-4444-8444-444444444444";
export const SERVER_MESSAGE_ID = "55555555-5555-4555-8555-555555555555";
export const OTHER_SERVER_MESSAGE_ID = "66666666-6666-4666-8666-666666666666";

export function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  // A RED implementation may not consume the injected promise at all.
  void promise.catch(() => undefined);
  return { promise, resolve, reject };
}

/** Deterministic, inspectable stand-in for the store's injected UUID/id-minting port. */
export function fakeMessageIdentity(prefix = "gen") {
  let sequence = 0;
  return {
    next: jest.fn(() => {
      sequence += 1;
      return {
        clientMsgId: `${prefix}-client-${sequence}`,
        commandId: `${prefix}-command-${sequence}`,
        localId: `${prefix}-local-${sequence}`,
      };
    }),
  };
}

export function fakeClock(startMs = 1_700_000_000_000) {
  let now = startMs;
  return {
    advance: (ms: number) => {
      now += ms;
    },
    nowMs: jest.fn(() => now),
  };
}

export function fakeChatApi(): jest.Mocked<ChatApi> {
  return {
    listGroupChatrooms: jest
      .fn()
      .mockResolvedValue({ items: [], nextCursor: null }),
    listChatroomMessages: jest
      .fn()
      .mockResolvedValue({ items: [], nextCursor: null }),
    markChatroomRead: jest.fn(),
    sendChatMessage: jest.fn(),
  };
}

export function fakeConnectedChatRepository(): jest.Mocked<ConnectedChatRepository> {
  return {
    applyOrderedMessageCreated: jest.fn(),
    applyOrderedUnsupportedEvent: jest.fn(),
    applyRealtimeMessageCreated: jest
      .fn()
      .mockResolvedValue({ status: "applied" }),
    claimDueOutboxCommands: jest.fn().mockResolvedValue([]),
    enqueuePendingMessage: jest.fn(),
    failClaimedOutboxCommand: jest.fn().mockResolvedValue(true),
    getEventCheckpoint: jest.fn().mockResolvedValue(null),
    getOutboxCommand: jest.fn(),
    listChatrooms: jest.fn(),
    listDirtyReconciliationScopes: jest.fn().mockResolvedValue([]),
    listMessagesWindow: jest.fn(),
    markSendFailed: jest.fn().mockResolvedValue(undefined),
    mergeCanonicalMessage: jest.fn(),
    mergeHistoryMessages: jest.fn(),
    reconcileChatHistory: jest.fn().mockResolvedValue(undefined),
    releaseOutboxClaims: jest.fn().mockResolvedValue(0),
    rescheduleClaimedOutboxCommand: jest.fn().mockResolvedValue(true),
    retryFailedMessage: jest.fn(),
    upsertChatrooms: jest.fn(),
  };
}

export function wireChatroom(
  overrides: Readonly<Partial<Chatroom>> = {},
): Chatroom {
  return {
    createdAt: "2024-01-01T00:00:00Z",
    groupId: GROUP_ID,
    id: CHATROOM_ID,
    topicId: null,
    type: "main",
    ...overrides,
  };
}

export function repositoryChatroom(
  overrides: Readonly<Partial<ConnectedChatroom>> = {},
): ConnectedChatroom {
  return {
    chatroomId: CHATROOM_ID,
    createdAtRaw: "2024-01-01T00:00:00.000000000Z",
    groupId: GROUP_ID,
    kind: "main",
    topicId: null,
    ...overrides,
  };
}

export function wireHistoryMessage(
  overrides: Readonly<Partial<WireChatMessage>> = {},
): WireChatMessage {
  return {
    body: "안녕하세요",
    chatroomId: CHATROOM_ID,
    clientMessageId: null,
    createdAt: "2024-01-02T00:00:00Z",
    id: SERVER_MESSAGE_ID,
    media: [],
    senderAvatarUrl: null,
    senderId: PRINCIPAL.userId,
    senderNickname: "닉네임",
    type: "user",
    ...overrides,
  };
}

export function repositoryHistoryRow(
  overrides: Readonly<Partial<ConnectedChatMessage>> = {},
): ConnectedChatMessage {
  return {
    body: "안녕하세요",
    chatroomId: CHATROOM_ID,
    clientMsgId: null,
    createdAtRaw: "2024-01-02T00:00:00.000000000Z",
    kind: "user",
    localCreatedAtMs: 1_700_000_000_000,
    localId: "gen-local-1",
    media: [],
    senderAvatarUrl: null,
    senderId: PRINCIPAL.userId,
    senderNickname: "닉네임",
    serverMessageId: SERVER_MESSAGE_ID,
    status: "sent",
    ...overrides,
  };
}

export function messageCursor(
  overrides: Readonly<Partial<ConnectedMessageCursor>> = {},
): ConnectedMessageCursor {
  return {
    localId: "gen-local-1",
    sortNanos: 0,
    sortSeconds: 1_700_000_000,
    sortTieBreaker: "0",
    ...overrides,
  };
}

export function pendingEnqueueResult(
  overrides: Readonly<{
    clientMsgId?: string;
    commandId?: string;
    localId?: string;
    body?: string;
    chatroomId?: string;
  }> = {},
): ConnectedMessageAndCommand {
  const localId = overrides.localId ?? "gen-local-1";
  const clientMsgId = overrides.clientMsgId ?? "gen-client-1";
  const commandId = overrides.commandId ?? "gen-command-1";
  const body = overrides.body ?? "메시지";
  const chatroomId = overrides.chatroomId ?? CHATROOM_ID;
  return {
    command: {
      body,
      chatroomId,
      clientMsgId,
      commandId,
      errorCode: null,
      localId,
      state: "queued",
    },
    message: {
      body,
      chatroomId,
      clientMsgId,
      createdAtRaw: null,
      kind: "user",
      localCreatedAtMs: 1_700_000_000_000,
      localId,
      media: [],
      senderAvatarUrl: null,
      senderId: PRINCIPAL.userId,
      senderNickname: null,
      serverMessageId: null,
      status: "pending",
    },
  };
}

export function canonicalWireMessage(
  overrides: Readonly<Partial<CanonicalChatMessage>> = {},
): CanonicalChatMessage {
  return {
    body: "메시지",
    chatroomId: CHATROOM_ID,
    clientMessageId: "gen-client-1",
    createdAt: "2024-01-02T00:05:00Z",
    id: SERVER_MESSAGE_ID,
    media: [],
    senderId: PRINCIPAL.userId,
    type: "user",
    ...overrides,
  };
}

export function repositoryCanonicalRow(
  overrides: Readonly<Partial<ConnectedChatMessage>> = {},
): ConnectedChatMessage {
  return {
    body: "메시지",
    chatroomId: CHATROOM_ID,
    clientMsgId: "gen-client-1",
    createdAtRaw: "2024-01-02T00:05:00.000000000Z",
    kind: "user",
    localCreatedAtMs: 1_700_000_000_000,
    localId: "gen-local-1",
    media: [],
    senderAvatarUrl: null,
    senderId: PRINCIPAL.userId,
    senderNickname: null,
    serverMessageId: SERVER_MESSAGE_ID,
    status: "sent",
    ...overrides,
  };
}

export function emptyMessageWindow() {
  return { hasMore: false, items: [], nextBefore: null };
}
