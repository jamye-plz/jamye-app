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

type MessageCursor = Readonly<{
  createdAtMs: number;
  localId: string;
}>;

type MessagePage = Readonly<{
  hasMore: boolean;
  items: Message[];
  nextBefore: MessageCursor | null;
}>;

export type FixtureConversationSeed = Readonly<{
  conversation: Conversation;
  messages: readonly Message[];
  outboxCommands: readonly Readonly<{
    body: string;
    clientMsgId: string;
    commandId: string;
    commandType: "message.create";
    conversationId: string;
    createdAtMs: number;
    state: "failed";
  }>[];
}>;

export type SyncCursor = Readonly<{
  conversationId: string;
  cursor: string;
  serverSequence: number;
  updatedAtMs: number;
}>;

export type DatabaseChange = Readonly<{
  conversationId: string;
  kind:
    | "message-and-outbox-committed"
    | "canonical-event-applied"
    | "message-retry-committed";
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
  ensureFixtureConversation: (
    fixture: FixtureConversationSeed,
  ) => Promise<void>;
  getCursor: (conversationId: string) => Promise<SyncCursor | null>;
  listMessagesPage: (
    input: Readonly<{
      before: MessageCursor | null;
      conversationId: string;
      limit: number;
    }>,
  ) => Promise<MessagePage>;
  recordUnknownEvent: (
    event: UnknownEventInput,
  ) => Promise<RecordUnknownEventResult>;
  retryFailedMessage: (
    input: Readonly<{
      clientMsgId: string;
      conversationId: string;
    }>,
  ) => Promise<Message>;
  subscribe: (listener: (change: DatabaseChange) => void) => () => void;
  upsertConversation: (conversation: Conversation) => Promise<void>;
}>;

type CursorRow = Readonly<{
  conversation_id: string;
  cursor: string;
  server_sequence: number;
  updated_at_ms: number;
}>;

type ConversationRow = Readonly<{
  id: string;
  kind: "fixture";
  title: string;
  updated_at_ms: number;
}>;

type MessageRow = Readonly<{
  body: string;
  client_msg_id: string | null;
  conversation_id: string;
  created_at_ms: number;
  event_id: string | null;
  local_id: string;
  sender_id: string;
  server_sequence: number | null;
  status: "pending" | "sent" | "failed";
}>;

type OutboxCommandRow = Readonly<{
  body: string;
  client_msg_id: string;
  command_id: string;
  command_type: "message.create";
  conversation_id: string;
  created_at_ms: number;
  state: "queued" | "in_flight" | "acked" | "failed";
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

const INSERT_FIXTURE_MESSAGE = `
  INSERT INTO messages (
    local_id, conversation_id, client_msg_id, event_id, sender_id, body,
    status, created_at_ms, server_sequence
  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
`;

const INSERT_FIXTURE_OUTBOX_COMMAND = `
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

const SELECT_MESSAGES_PAGE = `
  SELECT local_id, conversation_id, client_msg_id, event_id, sender_id, body,
    status, created_at_ms, server_sequence
  FROM messages
  WHERE conversation_id = ?
    AND (
      ? IS NULL
      OR (created_at_ms, local_id) < (?, ?)
    )
  ORDER BY created_at_ms DESC, local_id DESC
  LIMIT ?
`;

const SELECT_FIXTURE_CONVERSATION = `
  SELECT id, kind, title, updated_at_ms
  FROM conversations
  WHERE id = ?
`;

const SELECT_FIXTURE_MESSAGES = `
  SELECT local_id, conversation_id, client_msg_id, event_id, sender_id, body,
    status, created_at_ms, server_sequence
  FROM messages
  WHERE conversation_id = ?
`;

const SELECT_FIXTURE_OUTBOX_COMMANDS = `
  SELECT command_id, conversation_id, client_msg_id, command_type, body, state,
    created_at_ms
  FROM outbox_commands
  WHERE conversation_id = ?
`;

const SELECT_FAILED_MESSAGE = `
  SELECT local_id, conversation_id, client_msg_id, event_id, sender_id, body,
    status, created_at_ms, server_sequence
  FROM messages
  WHERE conversation_id = ? AND client_msg_id = ? AND status = 'failed'
`;

const SELECT_FAILED_OUTBOX_COMMAND = `
  SELECT command_id, conversation_id, client_msg_id, command_type, body, state,
    created_at_ms
  FROM outbox_commands
  WHERE conversation_id = ? AND client_msg_id = ? AND state = 'failed'
`;

const UPDATE_FAILED_MESSAGE_TO_PENDING = `
  UPDATE messages
  SET status = 'pending'
  WHERE local_id = ? AND conversation_id = ? AND client_msg_id = ?
    AND status = 'failed'
`;

const UPDATE_FAILED_OUTBOX_TO_QUEUED = `
  UPDATE outbox_commands
  SET state = 'queued'
  WHERE command_id = ? AND conversation_id = ? AND client_msg_id = ?
    AND state = 'failed'
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

function mapMessage(row: MessageRow): Message {
  return {
    body: row.body,
    clientMsgId: row.client_msg_id,
    conversationId: row.conversation_id,
    createdAtMs: row.created_at_ms,
    eventId: row.event_id,
    localId: row.local_id,
    senderId: row.sender_id,
    serverSequence: row.server_sequence,
    status: row.status,
  };
}

function sameConversation(
  row: ConversationRow,
  conversation: Conversation,
): boolean {
  return (
    row.id === conversation.id &&
    row.kind === conversation.kind &&
    row.title === conversation.title &&
    row.updated_at_ms === conversation.updatedAtMs
  );
}

function sameMessageWithoutStatus(row: MessageRow, message: Message): boolean {
  return (
    row.local_id === message.localId &&
    row.conversation_id === message.conversationId &&
    row.client_msg_id === message.clientMsgId &&
    row.event_id === message.eventId &&
    row.sender_id === message.senderId &&
    row.body === message.body &&
    row.created_at_ms === message.createdAtMs &&
    row.server_sequence === message.serverSequence
  );
}

function sameMessage(row: MessageRow, message: Message): boolean {
  return (
    sameMessageWithoutStatus(row, message) && row.status === message.status
  );
}

function sameOutboxCommandWithoutState(
  row: OutboxCommandRow,
  command: FixtureConversationSeed["outboxCommands"][number],
): boolean {
  return (
    row.command_id === command.commandId &&
    row.conversation_id === command.conversationId &&
    row.client_msg_id === command.clientMsgId &&
    row.command_type === command.commandType &&
    row.body === command.body &&
    row.created_at_ms === command.createdAtMs
  );
}

function sameOutboxCommand(
  row: OutboxCommandRow,
  command: FixtureConversationSeed["outboxCommands"][number],
): boolean {
  return (
    sameOutboxCommandWithoutState(row, command) && row.state === command.state
  );
}

function isRetriedFixturePair(
  existingMessage: MessageRow,
  fixtureMessage: Message,
  existingCommand: OutboxCommandRow,
  fixtureCommand: FixtureConversationSeed["outboxCommands"][number],
): boolean {
  return (
    fixtureMessage.status === "failed" &&
    existingMessage.status === "pending" &&
    fixtureMessage.clientMsgId !== null &&
    fixtureMessage.clientMsgId === fixtureCommand.clientMsgId &&
    fixtureMessage.conversationId === fixtureCommand.conversationId &&
    fixtureMessage.body === fixtureCommand.body &&
    fixtureMessage.createdAtMs === fixtureCommand.createdAtMs &&
    existingCommand.state === "queued" &&
    sameMessageWithoutStatus(existingMessage, fixtureMessage) &&
    sameOutboxCommandWithoutState(existingCommand, fixtureCommand)
  );
}

function pageCursor(message: Message): MessageCursor {
  return { createdAtMs: message.createdAtMs, localId: message.localId };
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

    async ensureFixtureConversation(fixture): Promise<void> {
      await database.withExclusiveTransactionAsync(async (transaction) => {
        const conversations = await transaction.getAllAsync<ConversationRow>(
          SELECT_FIXTURE_CONVERSATION,
          fixture.conversation.id,
        );
        const messages = await transaction.getAllAsync<MessageRow>(
          SELECT_FIXTURE_MESSAGES,
          fixture.conversation.id,
        );
        const outboxCommands = await transaction.getAllAsync<OutboxCommandRow>(
          SELECT_FIXTURE_OUTBOX_COMMANDS,
          fixture.conversation.id,
        );

        const existingConversation = conversations[0];
        if (conversations.length > 1) {
          throw new Error(
            "Fixture conversation lookup returned more than one row.",
          );
        }
        if (existingConversation) {
          if (!sameConversation(existingConversation, fixture.conversation)) {
            throw new Error(
              "Fixture conversation conflicts with persisted data.",
            );
          }
        } else {
          await transaction.runAsync(
            UPSERT_CONVERSATION,
            fixture.conversation.id,
            fixture.conversation.kind,
            fixture.conversation.title,
            fixture.conversation.updatedAtMs,
          );
        }

        const messagesByLocalId = new Map(
          messages.map((message) => [message.local_id, message]),
        );
        const messagesByClientMsgId = new Map(
          messages
            .filter(
              (message): message is MessageRow & { client_msg_id: string } =>
                message.client_msg_id !== null,
            )
            .map((message) => [message.client_msg_id, message]),
        );
        const outboxByCommandId = new Map(
          outboxCommands.map((command) => [command.command_id, command]),
        );
        const outboxByClientMsgId = new Map(
          outboxCommands.map((command) => [command.client_msg_id, command]),
        );
        const fixtureMessagesByClientMsgId = new Map(
          fixture.messages
            .filter(
              (message): message is Message & { clientMsgId: string } =>
                message.clientMsgId !== null,
            )
            .map((message) => [message.clientMsgId, message]),
        );
        const fixtureOutboxByClientMsgId = new Map(
          fixture.outboxCommands.map((command) => [
            command.clientMsgId,
            command,
          ]),
        );

        for (const message of fixture.messages) {
          const existingByLocalId = messagesByLocalId.get(message.localId);
          const existingByClientMsgId = message.clientMsgId
            ? messagesByClientMsgId.get(message.clientMsgId)
            : undefined;
          const existingMessage = existingByLocalId ?? existingByClientMsgId;
          if (existingMessage) {
            const fixtureCommand = message.clientMsgId
              ? fixtureOutboxByClientMsgId.get(message.clientMsgId)
              : undefined;
            const existingCommand = fixtureCommand
              ? (outboxByCommandId.get(fixtureCommand.commandId) ??
                outboxByClientMsgId.get(fixtureCommand.clientMsgId))
              : undefined;
            if (
              !sameMessage(existingMessage, message) &&
              !(
                fixtureCommand &&
                existingCommand &&
                isRetriedFixturePair(
                  existingMessage,
                  message,
                  existingCommand,
                  fixtureCommand,
                )
              )
            ) {
              throw new Error("Fixture message conflicts with persisted data.");
            }
            continue;
          }

          await transaction.runAsync(
            INSERT_FIXTURE_MESSAGE,
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
        }

        for (const command of fixture.outboxCommands) {
          const existingCommand =
            outboxByCommandId.get(command.commandId) ??
            outboxByClientMsgId.get(command.clientMsgId);
          if (existingCommand) {
            const fixtureMessage = fixtureMessagesByClientMsgId.get(
              command.clientMsgId,
            );
            const existingMessage = fixtureMessage
              ? (messagesByLocalId.get(fixtureMessage.localId) ??
                messagesByClientMsgId.get(fixtureMessage.clientMsgId))
              : undefined;
            if (
              !sameOutboxCommand(existingCommand, command) &&
              !(
                fixtureMessage &&
                existingMessage &&
                isRetriedFixturePair(
                  existingMessage,
                  fixtureMessage,
                  existingCommand,
                  command,
                )
              )
            ) {
              throw new Error(
                "Fixture outbox command conflicts with persisted data.",
              );
            }
            continue;
          }

          await transaction.runAsync(
            INSERT_FIXTURE_OUTBOX_COMMAND,
            command.commandId,
            command.conversationId,
            command.clientMsgId,
            command.commandType,
            command.body,
            command.state,
            command.createdAtMs,
          );
        }
      });
    },

    async listMessagesPage(input): Promise<MessagePage> {
      if (!Number.isInteger(input.limit) || input.limit < 1) {
        throw new Error("Message page limit must be a positive integer.");
      }

      const before = input.before;
      const rows = await database.getAllAsync<MessageRow>(
        SELECT_MESSAGES_PAGE,
        input.conversationId,
        before?.createdAtMs ?? null,
        before?.createdAtMs ?? null,
        before?.localId ?? null,
        input.limit + 1,
      );
      const hasMore = rows.length > input.limit;
      const descendingItems = rows.slice(0, input.limit).map(mapMessage);
      const oldestReturned = descendingItems.at(-1);

      return {
        hasMore,
        items: [...descendingItems].reverse(),
        nextBefore:
          hasMore && oldestReturned ? pageCursor(oldestReturned) : null,
      };
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

    async retryFailedMessage(input): Promise<Message> {
      let retriedMessage: Message | undefined;
      await database.withExclusiveTransactionAsync(async (transaction) => {
        const messageRow = await transaction.getFirstAsync<MessageRow>(
          SELECT_FAILED_MESSAGE,
          input.conversationId,
          input.clientMsgId,
        );
        if (!messageRow) {
          throw new Error("Failed message was not found for retry.");
        }
        const message = mapMessage(messageRow);
        if (
          message.conversationId !== input.conversationId ||
          message.clientMsgId !== input.clientMsgId ||
          message.status !== "failed"
        ) {
          throw new Error("Failed message did not match the retry request.");
        }

        const outboxCommand = await transaction.getFirstAsync<OutboxCommandRow>(
          SELECT_FAILED_OUTBOX_COMMAND,
          input.conversationId,
          input.clientMsgId,
        );
        if (
          !outboxCommand ||
          outboxCommand.conversation_id !== input.conversationId ||
          outboxCommand.client_msg_id !== input.clientMsgId ||
          outboxCommand.command_type !== "message.create" ||
          outboxCommand.body !== message.body ||
          outboxCommand.created_at_ms !== message.createdAtMs ||
          outboxCommand.state !== "failed"
        ) {
          throw new Error(
            "Failed outbox command did not match the message retry.",
          );
        }

        const messageUpdate = await transaction.runAsync(
          UPDATE_FAILED_MESSAGE_TO_PENDING,
          message.localId,
          input.conversationId,
          input.clientMsgId,
        );
        if (messageUpdate.changes !== 1) {
          throw new Error(
            "Failed message retry did not update exactly one row.",
          );
        }
        const outboxUpdate = await transaction.runAsync(
          UPDATE_FAILED_OUTBOX_TO_QUEUED,
          outboxCommand.command_id,
          input.conversationId,
          input.clientMsgId,
        );
        if (outboxUpdate.changes !== 1) {
          throw new Error(
            "Failed outbox retry did not update exactly one row.",
          );
        }

        retriedMessage = { ...message, status: "pending" };
      });

      if (!retriedMessage) {
        throw new Error("Failed message retry did not commit.");
      }
      notify({
        conversationId: input.conversationId,
        kind: "message-retry-committed",
      });
      return retriedMessage;
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
