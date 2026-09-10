export type ConnectedChatMedia = Readonly<{
  byteSize: number;
  duration: number | null;
  filename: string | null;
  height: number | null;
  id: string;
  mediaUploadId: string;
  position: number;
  type: string;
  width: number | null;
}>;

export type ConnectedChatroom = Readonly<{
  chatroomId: string;
  createdAtRaw: string;
  groupId: string;
  kind: "main" | "topic";
  topicId: string | null;
}>;

export type ConnectedChatroomUpsert = ConnectedChatroom;

export type ConnectedChatroomCursor = Readonly<{
  chatroomId: string;
  sortNanos: number;
  sortSeconds: number;
}>;

export type ConnectedChatMessage = Readonly<{
  body: string | null;
  chatroomId: string;
  clientMsgId: string | null;
  createdAtRaw: string | null;
  kind: "user" | "system";
  localCreatedAtMs: number;
  localId: string;
  media: readonly ConnectedChatMedia[];
  senderAvatarUrl: string | null;
  senderId: string | null;
  senderNickname: string | null;
  serverMessageId: string | null;
  status: "pending" | "sent" | "failed";
}>;

export type ConnectedMessageCursor = Readonly<{
  localId: string;
  sortNanos: number;
  sortSeconds: number;
  sortTieBreaker: string;
}>;

type CanonicalMessageFields = Readonly<{
  body: string | null;
  chatroomId: string;
  clientMsgId: string | null;
  createdAtRaw: string;
  kind: "user" | "system";
  localId: string;
  media: readonly ConnectedChatMedia[];
  senderId: string | null;
  serverMessageId: string;
}>;

export type ConnectedHistoryMessageUpsert = CanonicalMessageFields &
  Readonly<{
    senderAvatarUrl: string | null;
    senderNickname: string | null;
  }>;

export type ConnectedCanonicalMessageUpsert = CanonicalMessageFields;

export type ConnectedChatOutboxCommand = Readonly<{
  body: string;
  chatroomId: string;
  clientMsgId: string;
  commandId: string;
  errorCode: ConnectedSendErrorCode | null;
  localId: string;
  state: "queued" | "in_flight" | "acked" | "failed";
}>;

export type ConnectedSendErrorCode =
  | "network"
  | "unauthorized"
  | "forbidden"
  | "conflict"
  | "validation"
  | "server_unavailable"
  | "unknown";

export type ConnectedPendingMessageInput = Readonly<{
  body: string;
  chatroomId: string;
  clientMsgId: string;
  commandId: string;
  localCreatedAtMs: number;
  localId: string;
}>;

export type ConnectedMessageAndCommand = Readonly<{
  command: ConnectedChatOutboxCommand;
  message: ConnectedChatMessage;
}>;

export type ConnectedChatRepository = Readonly<{
  enqueuePendingMessage: (
    input: ConnectedPendingMessageInput,
  ) => Promise<ConnectedMessageAndCommand>;
  getOutboxCommand: (
    clientMsgId: string,
  ) => Promise<ConnectedChatOutboxCommand | null>;
  listChatrooms: (
    input: Readonly<{
      after: ConnectedChatroomCursor | null;
      groupId: string;
      limit: number;
    }>,
  ) => Promise<
    Readonly<{
      /** True only when another cached SQLite row was observed. */
      hasMore: boolean;
      items: readonly ConnectedChatroom[];
      /** Last returned SQLite keyset boundary, or null only for an empty page. */
      nextAfter: ConnectedChatroomCursor | null;
    }>
  >;
  listMessagesWindow: (
    input: Readonly<{
      before: ConnectedMessageCursor | null;
      chatroomId: string;
      limit: number;
    }>,
  ) => Promise<
    Readonly<{
      /** True only when another cached SQLite row was observed. */
      hasMore: boolean;
      items: readonly ConnectedChatMessage[];
      /** Oldest returned SQLite keyset boundary, or null only for an empty page. */
      nextBefore: ConnectedMessageCursor | null;
    }>
  >;
  markSendFailed: (
    input: Readonly<{
      clientMsgId: string;
      errorCode: ConnectedSendErrorCode;
    }>,
  ) => Promise<void>;
  mergeCanonicalMessage: (
    input: ConnectedCanonicalMessageUpsert,
  ) => Promise<ConnectedChatMessage>;
  mergeHistoryMessages: (
    inputs: readonly ConnectedHistoryMessageUpsert[],
  ) => Promise<void>;
  retryFailedMessage: (
    input: Readonly<{
      body: string;
      chatroomId: string;
      clientMsgId: string;
    }>,
  ) => Promise<ConnectedMessageAndCommand>;
  upsertChatrooms: (
    inputs: readonly ConnectedChatroomUpsert[],
  ) => Promise<void>;
}>;
