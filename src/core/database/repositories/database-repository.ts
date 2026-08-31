import type { SqliteRepositoryDatabase } from "../types";

export type Conversation = Readonly<{
  id: string;
  kind: "fixture";
  title: string;
  updatedAtMs: number;
}>;

export type Message = Readonly<{
  body: string;
  clientMsgId: string | null;
  conversationId: string;
  createdAtMs: number;
  eventId: string | null;
  localId: string;
  senderId: string;
  serverSequence: number | null;
  status: "pending" | "sent" | "failed";
}>;

export type SyncCursor = Readonly<{
  conversationId: string;
  cursor: string;
  serverSequence: number;
  updatedAtMs: number;
}>;

export type DatabaseChange = Readonly<{
  conversationId: string;
  kind: "message-and-outbox-committed" | "canonical-event-applied";
}>;

export type PendingMessageInput = Readonly<{
  body: string;
  clientMsgId: string;
  conversationId: string;
  createdAtMs: number;
  localId: string;
  senderId: string;
}>;

export type CanonicalMessageUpsert = Readonly<{
  cursor: string;
  eventId: string;
  message: Readonly<{
    body: string;
    clientMsgId: string | null;
    createdAtMs: number;
    localId: string;
    senderId: string;
  }>;
  conversationId: string;
  payloadJson?: string;
  recordedAtMs: number;
  serverSequence: number;
}>;

export type ApplyCanonicalResult = Readonly<{
  outcome: "applied" | "duplicate";
}>;

export type UnknownEventInput = Readonly<{
  conversationId: string;
  eventId: string;
  payloadJson: string;
  recordedAtMs: number;
  serverSequence: number;
  type: string;
}>;

export type RecordUnknownEventResult = Readonly<{
  outcome: "recorded" | "duplicate";
}>;

export type DatabaseRepository = Readonly<{
  applyCanonicalMessageUpsert: (
    event: CanonicalMessageUpsert,
  ) => Promise<ApplyCanonicalResult>;
  enqueuePendingMessage: (input: PendingMessageInput) => Promise<Message>;
  getCursor: (conversationId: string) => Promise<SyncCursor | null>;
  recordUnknownEvent: (
    event: UnknownEventInput,
  ) => Promise<RecordUnknownEventResult>;
  subscribe: (listener: (change: DatabaseChange) => void) => () => void;
  upsertConversation: (conversation: Conversation) => Promise<void>;
}>;

type CursorRow = Readonly<{
  conversation_id: string;
  cursor: string;
  server_sequence: number;
  updated_at_ms: number;
}>;

const UPSERT_CONVERSATION = `
  INSERT INTO conversations (id, kind, title, updated_at_ms)
  VALUES (?, ?, ?, ?)
  ON CONFLICT(id) DO UPDATE SET
    kind = excluded.kind,
    title = excluded.title,
    updated_at_ms = excluded.updated_at_ms
`;

const INSERT_PENDING_MESSAGE = `
  INSERT INTO messages (
    local_id, conversation_id, client_msg_id, event_id, sender_id, body,
    status, created_at_ms, server_sequence
  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
`;

const INSERT_OUTBOX_COMMAND = `
  INSERT INTO outbox_commands (
    command_id, conversation_id, client_msg_id, command_type, body, state,
    created_at_ms
  ) VALUES (?, ?, ?, ?, ?, ?, ?)
`;

const INSERT_APPLIED_EVENT = `
  INSERT INTO applied_events (
    event_id, conversation_id, type, server_sequence, outcome, payload_json,
    recorded_at_ms
  ) VALUES (?, ?, ?, ?, ?, ?, ?)
  ON CONFLICT(event_id) DO NOTHING
`;

const UPSERT_CANONICAL_MESSAGE = `
  INSERT INTO messages (
    local_id, conversation_id, client_msg_id, event_id, sender_id, body,
    status, created_at_ms, server_sequence
  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  ON CONFLICT(local_id) DO UPDATE SET
    conversation_id = excluded.conversation_id,
    client_msg_id = excluded.client_msg_id,
    event_id = excluded.event_id,
    sender_id = excluded.sender_id,
    body = excluded.body,
    status = excluded.status,
    created_at_ms = excluded.created_at_ms,
    server_sequence = excluded.server_sequence
  ON CONFLICT(client_msg_id) DO UPDATE SET
    local_id = messages.local_id,
    conversation_id = excluded.conversation_id,
    client_msg_id = excluded.client_msg_id,
    event_id = excluded.event_id,
    sender_id = excluded.sender_id,
    body = excluded.body,
    status = excluded.status,
    created_at_ms = excluded.created_at_ms,
    server_sequence = excluded.server_sequence
`;

const UPSERT_CURSOR = `
  INSERT INTO sync_cursors (
    conversation_id, cursor, server_sequence, updated_at_ms
  ) VALUES (?, ?, ?, ?)
  ON CONFLICT(conversation_id) DO UPDATE SET
    cursor = excluded.cursor,
    server_sequence = excluded.server_sequence,
    updated_at_ms = excluded.updated_at_ms
  WHERE excluded.server_sequence > sync_cursors.server_sequence
`;

const SELECT_CURSOR = `
  SELECT conversation_id, cursor, server_sequence, updated_at_ms
  FROM sync_cursors
  WHERE conversation_id = ?
`;

function pendingMessageToEntity(input: PendingMessageInput): Message {
  return {
    body: input.body,
    clientMsgId: input.clientMsgId,
    conversationId: input.conversationId,
    createdAtMs: input.createdAtMs,
    eventId: null,
    localId: input.localId,
    senderId: input.senderId,
    serverSequence: null,
    status: "pending",
  };
}

function serializeCanonicalPayload(event: CanonicalMessageUpsert): string {
  if (event.payloadJson && event.payloadJson.length > 0) {
    return event.payloadJson;
  }

  return JSON.stringify({
    cursor: event.cursor,
    event_id: event.eventId,
    message: {
      body: event.message.body,
      client_msg_id: event.message.clientMsgId,
      created_at_ms: event.message.createdAtMs,
      local_id: event.message.localId,
      sender_id: event.message.senderId,
    },
    server_sequence: event.serverSequence,
  });
}

function mapCursor(row: CursorRow): SyncCursor {
  return {
    conversationId: row.conversation_id,
    cursor: row.cursor,
    serverSequence: row.server_sequence,
    updatedAtMs: row.updated_at_ms,
  };
}

export function createDatabaseRepository(
  database: SqliteRepositoryDatabase,
): DatabaseRepository {
  const listeners = new Set<(change: DatabaseChange) => void>();

  function notify(change: DatabaseChange): void {
    listeners.forEach((listener) => {
      try {
        listener(change);
      } catch {
        // Observers are best-effort after the repository operation has committed.
      }
    });
  }

  return {
    async upsertConversation(conversation): Promise<void> {
      await database.runAsync(
        UPSERT_CONVERSATION,
        conversation.id,
        conversation.kind,
        conversation.title,
        conversation.updatedAtMs,
      );
    },

    async enqueuePendingMessage(input): Promise<Message> {
      const message = pendingMessageToEntity(input);
      await database.withExclusiveTransactionAsync(async (transaction) => {
        await transaction.runAsync(
          INSERT_PENDING_MESSAGE,
          message.localId,
          message.conversationId,
          message.clientMsgId,
          message.eventId,
          message.senderId,
          message.body,
          message.status,
          message.createdAtMs,
          message.serverSequence,
        );
        await transaction.runAsync(
          INSERT_OUTBOX_COMMAND,
          `outbox:${input.clientMsgId}`,
          input.conversationId,
          input.clientMsgId,
          "message.create",
          input.body,
          "queued",
          input.createdAtMs,
        );
      });
      notify({
        conversationId: input.conversationId,
        kind: "message-and-outbox-committed",
      });
      return message;
    },

    async applyCanonicalMessageUpsert(event): Promise<ApplyCanonicalResult> {
      const result: { outcome: ApplyCanonicalResult["outcome"] } = {
        outcome: "duplicate",
      };
      await database.withExclusiveTransactionAsync(async (transaction) => {
        const appliedEvent = await transaction.runAsync(
          INSERT_APPLIED_EVENT,
          event.eventId,
          event.conversationId,
          "message.upsert",
          event.serverSequence,
          "applied",
          serializeCanonicalPayload(event),
          event.recordedAtMs,
        );
        if (appliedEvent.changes === 0) return;

        await transaction.runAsync(
          UPSERT_CANONICAL_MESSAGE,
          event.message.localId,
          event.conversationId,
          event.message.clientMsgId,
          event.eventId,
          event.message.senderId,
          event.message.body,
          "sent",
          event.message.createdAtMs,
          event.serverSequence,
        );
        await transaction.runAsync(
          UPSERT_CURSOR,
          event.conversationId,
          event.cursor,
          event.serverSequence,
          event.recordedAtMs,
        );
        result.outcome = "applied";
      });

      if (result.outcome === "applied") {
        notify({
          conversationId: event.conversationId,
          kind: "canonical-event-applied",
        });
      }
      return result;
    },

    async recordUnknownEvent(event): Promise<RecordUnknownEventResult> {
      let outcome: RecordUnknownEventResult["outcome"] = "duplicate";
      await database.withExclusiveTransactionAsync(async (transaction) => {
        const appliedEvent = await transaction.runAsync(
          INSERT_APPLIED_EVENT,
          event.eventId,
          event.conversationId,
          event.type,
          event.serverSequence,
          "unknown_recorded",
          event.payloadJson,
          event.recordedAtMs,
        );
        if (appliedEvent.changes > 0) outcome = "recorded";
      });
      return { outcome };
    },

    async getCursor(conversationId): Promise<SyncCursor | null> {
      const row = await database.getFirstAsync<CursorRow>(
        SELECT_CURSOR,
        conversationId,
      );
      return row ? mapCursor(row) : null;
    },

    subscribe(listener): () => void {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}
