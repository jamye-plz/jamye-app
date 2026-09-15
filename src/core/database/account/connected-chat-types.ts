export type ConnectedChatMedia = Readonly<{
  byteSize: number;
  duration: number | null;
  filename: string | null;
  height: number | null;
  id: string;
  mediaUploadId: string;
  position: number;
  posterMediaId: string | null;
  type: string;
  width: number | null;
}>;

export type ConnectedPendingAttachment = Readonly<{
  byteSize: number;
  duration: number | null;
  filename: string | null;
  height: number | null;
  mediaUploadId: string;
  posterMediaId: string | null;
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
  pendingMedia?: readonly ConnectedPendingAttachment[];
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
  senderAvatarUrl: string | null;
  senderId: string | null;
  senderNickname: string | null;
  serverMessageId: string;
}>;

export type ConnectedHistoryMessageUpsert = CanonicalMessageFields;

export type ConnectedCanonicalMessageUpsert = CanonicalMessageFields;

export type ConnectedChatOutboxCommand = Readonly<{
  body: string;
  chatroomId: string;
  clientMsgId: string;
  commandId: string;
  errorCode: ConnectedSendErrorCode | null;
  localId: string;
  mediaUploadIds?: readonly string[];
  state: "queued" | "in_flight" | "acked" | "failed";
}>;

export type ConnectedClaimedOutboxCommand = ConnectedChatOutboxCommand &
  Readonly<{
    attemptCount: number;
    leaseExpiresAtMs: number;
    leaseToken: string;
    nextAttemptAtMs: number;
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
  media?: readonly ConnectedPendingAttachment[];
}>;

export type ConnectedMessageAndCommand = Readonly<{
  command: ConnectedChatOutboxCommand;
  message: ConnectedChatMessage;
}>;

export type ConnectedReconciliationScope =
  "chat_history" | "group_topics" | "notifications";

export type ConnectedDirtyReconciliationScope = Readonly<{
  markerEventId: string;
  scope: ConnectedReconciliationScope;
}>;

export type ConnectedRealtimeMessageCreatedInput = Readonly<{
  eventId: string;
  message: ConnectedCanonicalMessageUpsert;
}>;

export type ConnectedRealtimeEventApplyResult = Readonly<{
  status: "applied" | "duplicate";
}>;

type ConnectedOrderedEventIdentity = Readonly<{
  chatroomId: string;
  cursor: string;
  eventId: string;
  expectedCursor: string | null;
}>;

export type ConnectedOrderedMessageCreatedInput =
  ConnectedOrderedEventIdentity &
    Readonly<{
      message: ConnectedCanonicalMessageUpsert;
    }>;

export type ConnectedOrderedUnsupportedEventInput =
  ConnectedOrderedEventIdentity &
    Readonly<{
      reconcileScope: ConnectedReconciliationScope;
    }>;

export type ConnectedOrderedEventApplyResult =
  | Readonly<{
      checkpoint: string;
      status: "applied" | "duplicate" | "no_progress";
    }>
  | Readonly<{
      actualCheckpoint: string | null;
      status: "checkpoint_mismatch";
    }>;

export type ConnectedChatSyncRepository = Readonly<{
  applyOrderedMessageCreated: (
    input: ConnectedOrderedMessageCreatedInput,
  ) => Promise<ConnectedOrderedEventApplyResult>;
  applyOrderedUnsupportedEvent: (
    input: ConnectedOrderedUnsupportedEventInput,
  ) => Promise<ConnectedOrderedEventApplyResult>;
  applyRealtimeMessageCreated: (
    input: ConnectedRealtimeMessageCreatedInput,
  ) => Promise<ConnectedRealtimeEventApplyResult>;
  claimDueOutboxCommands: (
    input: Readonly<{
      leaseExpiresAtMs: number;
      leaseToken: string;
      limit: number;
      nowMs: number;
    }>,
  ) => Promise<readonly ConnectedClaimedOutboxCommand[]>;
  failClaimedOutboxCommand: (
    input: Readonly<{
      commandId: string;
      errorCode: ConnectedSendErrorCode;
      leaseToken: string;
    }>,
  ) => Promise<boolean>;
  getEventCheckpoint: (chatroomId: string) => Promise<string | null>;
  listDirtyReconciliationScopes: (
    chatroomId: string,
  ) => Promise<readonly ConnectedDirtyReconciliationScope[]>;
  reconcileChatHistory: (
    input: Readonly<{
      chatroomId: string;
      expectedMarkerEventId: string;
      messages: readonly ConnectedHistoryMessageUpsert[];
    }>,
  ) => Promise<void>;
  releaseOutboxClaims: (
    input: Readonly<{
      leaseToken: string;
      nextAttemptAtMs: number;
    }>,
  ) => Promise<number>;
  rescheduleClaimedOutboxCommand: (
    input: Readonly<{
      commandId: string;
      errorCode: ConnectedSendErrorCode;
      leaseToken: string;
      nextAttemptAtMs: number;
    }>,
  ) => Promise<boolean>;
}>;

export type ConnectedChatRepository = ConnectedChatSyncRepository &
  Readonly<{
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
