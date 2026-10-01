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
  /** Ms epoch this device recorded the tombstone, or null while live.
   * Monotonic once set -- never cleared by a later merge (E2). */
  deletedAtMs: number | null;
  /** E2/CHAT-AC3: the backing outbox command's current `error_code`, joined
   * in by `listMessagesWindow` only -- undefined on rows other repository
   * reads return (enqueue/retry/merge), where it is not meaningful. `null`
   * when the row has no failure on record (never sent an outbox command,
   * or it is queued/in_flight/acked). */
  errorCode?: ConnectedSendErrorCode | null;
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
  | "unknown"
  /** E2/C2/U2: a 422 media_not_available send failure -- the staged
   * upload's 1h server-side bind TTL elapsed before the message could be
   * sent. Terminal, retry hidden (plan api_contracts.E2_media_expired_failure). */
  | "media_expired";

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

/** S1-ordered `message.deleted` apply (AC2): the event's own `message_id` is
 * looked up by server id -- a message never received locally is a no-op,
 * never a placeholder row (E2). */
export type ConnectedOrderedMessageDeletedInput =
  ConnectedOrderedEventIdentity &
    Readonly<{
      deletedAtMs: number;
      serverMessageId: string;
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
  applyOrderedMessageDeleted: (
    input: ConnectedOrderedMessageDeletedInput,
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
    /** AC5: clears the failed message row, its outbox command (removed via
     * the existing `ON DELETE CASCADE` FK), and its pending-media/upload
     * draft snapshot (stored on the same row) in one transaction. A no-op,
     * not an error, when the row is missing or no longer `failed` -- it may
     * have raced to `pending`/`sent` via a concurrent retry. No server call. */
    discardFailedMessage: (
      input: Readonly<{ chatroomId: string; clientMsgId: string }>,
    ) => Promise<void>;
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
    /** AC3's local optimistic apply (right after C6's 204, before the
     * `message.deleted` echo lands) and any other direct tombstone caller
     * share this. Idempotent (`deleted_at_ms IS NULL` guard at the SQL
     * layer) and a no-op when the message was never received locally, so a
     * later `applyOrderedMessageDeleted` replay of the very same deletion is
     * always safe (AC3: "이후 도착하는 message.deleted와 중복 적용돼도 안전"). */
    markMessageDeleted: (
      input: Readonly<{ deletedAtMs: number; serverMessageId: string }>,
    ) => Promise<void>;
    /** E1/C1/U4: `topic.deleted`'s `announcement_message_id`. Hides the
     * announcement entirely (no "삭제된 메시지입니다." placeholder) by turning
     * it into a deleted system row, whether or not the server's preceding
     * `message.deleted` for the same message was applied first. Idempotent
     * and a no-op for a message never received locally, mirroring
     * `markMessageDeleted`. */
    markAnnouncementDeleted: (
      input: Readonly<{ deletedAtMs: number; serverMessageId: string }>,
    ) => Promise<void>;
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
    /** M15 device round r2 follow-up (P2, root cause B): converges this
     * group's local `connected_chatrooms` rows onto the server's confirmed
     * live set once a full C1 sweep completes (a topic deleted server-side
     * never reappears in a C1 page, chatrooms/query.rs, but the local row
     * otherwise only ever gains upserts and never loses a row on its own).
     * `ON DELETE CASCADE` from `connected_chatrooms` removes each pruned
     * room's messages, outbox commands, applied-event records and
     * reconciliation markers with it. An empty `keepChatroomIds` prunes every
     * local row for `groupId`. */
    pruneChatroomsNotIn: (
      input: Readonly<{ groupId: string; keepChatroomIds: readonly string[] }>,
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
