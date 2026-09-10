import type { SqliteRepositoryDatabase, SqliteRow } from "../types";
import type { AccountPrincipal } from "./types";
import type {
  ConnectedCanonicalMessageUpsert,
  ConnectedChatMedia,
  ConnectedChatMessage,
  ConnectedChatOutboxCommand,
  ConnectedChatRepository,
  ConnectedChatroom,
  ConnectedChatroomUpsert,
  ConnectedHistoryMessageUpsert,
  ConnectedMessageAndCommand,
  ConnectedMessageCursor,
  ConnectedPendingMessageInput,
  ConnectedSendErrorCode,
} from "./connected-chat-types";

type TimestampSort = Readonly<{ nanos: number; seconds: number }>;

type ChatroomRow = SqliteRow & {
  chatroom_id: string;
  created_at_raw: string;
  group_id: string;
  kind: "main" | "topic";
  sort_nanos: number;
  sort_seconds: number;
  topic_id: string | null;
};

type MessageRow = SqliteRow & {
  body: string | null;
  chatroom_id: string;
  client_msg_id: string | null;
  created_at_raw: string | null;
  kind: "user" | "system";
  local_created_at_ms: number;
  local_id: string;
  media_json: string;
  sender_avatar_url: string | null;
  sender_id: string | null;
  sender_nickname: string | null;
  server_message_id: string | null;
  sort_nanos: number;
  sort_seconds: number;
  sort_tiebreaker: string;
  status: "pending" | "sent" | "failed";
};

type OutboxRow = SqliteRow & {
  body: string;
  chatroom_id: string;
  client_msg_id: string;
  command_id: string;
  error_code: ConnectedSendErrorCode | null;
  local_id: string;
  state: "queued" | "in_flight" | "acked" | "failed";
};

const RFC3339 =
  /^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2})(?:\.(\d{1,9}))?(Z|[+-]\d{2}:\d{2})$/;

const MESSAGE_COLUMNS = `local_id, server_message_id, chatroom_id,
  client_msg_id, sender_id, sender_nickname, sender_avatar_url, body, kind,
  media_json, created_at_raw, local_created_at_ms, sort_seconds, sort_nanos,
  sort_tiebreaker, status`;

function parseTimestampSort(raw: string): TimestampSort {
  const match = RFC3339.exec(raw);
  if (!match?.[1] || !match[3]) {
    throw new Error(
      "Connected chat timestamp must be RFC3339 with at most nanosecond precision.",
    );
  }
  const milliseconds = Date.parse(`${match[1]}${match[3]}`);
  if (!Number.isFinite(milliseconds)) {
    throw new Error("Connected chat timestamp is not a valid RFC3339 instant.");
  }
  return {
    nanos: Number((match[2] ?? "").padEnd(9, "0")),
    seconds: Math.floor(milliseconds / 1_000),
  };
}

function assertLimit(limit: number): void {
  if (!Number.isInteger(limit) || limit < 1 || limit > 100) {
    throw new Error(
      "Connected chat window limit must be an integer from 1 through 100.",
    );
  }
}

function mapChatroom(row: ChatroomRow): ConnectedChatroom {
  return {
    chatroomId: row.chatroom_id,
    createdAtRaw: row.created_at_raw,
    groupId: row.group_id,
    kind: row.kind,
    topicId: row.topic_id,
  };
}

function parseMedia(value: string): readonly ConnectedChatMedia[] {
  const parsed: unknown = JSON.parse(value);
  if (!Array.isArray(parsed)) {
    throw new Error("Connected chat media metadata is not an array.");
  }
  return parsed as ConnectedChatMedia[];
}

function mapMessage(row: MessageRow): ConnectedChatMessage {
  return {
    body: row.body,
    chatroomId: row.chatroom_id,
    clientMsgId: row.client_msg_id,
    createdAtRaw: row.created_at_raw,
    kind: row.kind,
    localCreatedAtMs: row.local_created_at_ms,
    localId: row.local_id,
    media: parseMedia(row.media_json),
    senderAvatarUrl: row.sender_avatar_url,
    senderId: row.sender_id,
    senderNickname: row.sender_nickname,
    serverMessageId: row.server_message_id,
    status: row.status,
  };
}

function mapOutbox(row: OutboxRow): ConnectedChatOutboxCommand {
  return {
    body: row.body,
    chatroomId: row.chatroom_id,
    clientMsgId: row.client_msg_id,
    commandId: row.command_id,
    errorCode: row.error_code,
    localId: row.local_id,
    state: row.state,
  };
}

function cursorOfMessage(row: MessageRow): ConnectedMessageCursor {
  return {
    localId: row.local_id,
    sortNanos: row.sort_nanos,
    sortSeconds: row.sort_seconds,
    sortTieBreaker: row.sort_tiebreaker,
  };
}

export function createConnectedChatRepository(
  database: SqliteRepositoryDatabase,
  principal: AccountPrincipal,
  assertActive: () => void,
): ConnectedChatRepository {
  async function selectMessageByIdentity(
    transaction: SqliteRepositoryDatabase,
    input: ConnectedCanonicalMessageUpsert | ConnectedHistoryMessageUpsert,
  ): Promise<MessageRow | null> {
    const byServer = await transaction.getFirstAsync<MessageRow>(
      `SELECT ${MESSAGE_COLUMNS} FROM connected_chat_messages WHERE server_message_id = ?`,
      input.serverMessageId,
    );
    if (byServer) return byServer;
    if (!input.senderId || !input.clientMsgId) return null;
    return transaction.getFirstAsync<MessageRow>(
      `SELECT ${MESSAGE_COLUMNS} FROM connected_chat_messages
       WHERE sender_id = ? AND client_msg_id = ?`,
      input.senderId,
      input.clientMsgId,
    );
  }

  async function mergeMessage(
    transaction: SqliteRepositoryDatabase,
    input: ConnectedCanonicalMessageUpsert | ConnectedHistoryMessageUpsert,
    source: "history" | "canonical",
  ): Promise<MessageRow> {
    const sort = parseTimestampSort(input.createdAtRaw);
    const existing = await selectMessageByIdentity(transaction, input);
    const localId = existing?.local_id ?? input.localId;
    const localCreatedAtMs =
      existing?.local_created_at_ms ??
      sort.seconds * 1_000 + Math.floor(sort.nanos / 1_000_000);
    const historyInput =
      source === "history" ? (input as ConnectedHistoryMessageUpsert) : null;
    const nickname = historyInput
      ? historyInput.senderNickname
      : (existing?.sender_nickname ?? null);
    const avatar = historyInput
      ? historyInput.senderAvatarUrl
      : (existing?.sender_avatar_url ?? null);

    if (existing) {
      await transaction.runAsync(
        `UPDATE connected_chat_messages SET
          server_message_id = ?, chatroom_id = ?, client_msg_id = ?, sender_id = ?,
          sender_nickname = ?, sender_avatar_url = ?, body = ?, kind = ?, media_json = ?,
          created_at_raw = ?, sort_seconds = ?, sort_nanos = ?, sort_tiebreaker = ?,
          status = 'sent'
         WHERE local_id = ?`,
        input.serverMessageId,
        input.chatroomId,
        input.clientMsgId,
        input.senderId,
        nickname,
        avatar,
        input.body,
        input.kind,
        JSON.stringify(input.media),
        input.createdAtRaw,
        sort.seconds,
        sort.nanos,
        input.serverMessageId,
        localId,
      );
    } else {
      await transaction.runAsync(
        `INSERT INTO connected_chat_messages (${MESSAGE_COLUMNS})
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'sent')`,
        localId,
        input.serverMessageId,
        input.chatroomId,
        input.clientMsgId,
        input.senderId,
        nickname,
        avatar,
        input.body,
        input.kind,
        JSON.stringify(input.media),
        input.createdAtRaw,
        localCreatedAtMs,
        sort.seconds,
        sort.nanos,
        input.serverMessageId,
      );
    }

    if (input.senderId === principal.userId && input.clientMsgId) {
      await transaction.runAsync(
        `UPDATE connected_chat_outbox_commands
         SET state = 'acked', error_code = NULL
         WHERE sender_id = ? AND client_msg_id = ?`,
        principal.userId,
        input.clientMsgId,
      );
    }
    const merged = await transaction.getFirstAsync<MessageRow>(
      `SELECT ${MESSAGE_COLUMNS} FROM connected_chat_messages WHERE local_id = ?`,
      localId,
    );
    if (!merged)
      throw new Error(
        "Connected chat canonical merge did not persist a message.",
      );
    return merged;
  }

  return {
    async upsertChatrooms(inputs: readonly ConnectedChatroomUpsert[]) {
      assertActive();
      await database.withExclusiveTransactionAsync(async (transaction) => {
        for (const input of inputs) {
          const sort = parseTimestampSort(input.createdAtRaw);
          await transaction.runAsync(
            `INSERT INTO connected_chatrooms (
              chatroom_id, group_id, kind, topic_id, created_at_raw, sort_seconds, sort_nanos
            ) VALUES (?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(chatroom_id) DO UPDATE SET
              group_id = excluded.group_id, kind = excluded.kind,
              topic_id = excluded.topic_id, created_at_raw = excluded.created_at_raw,
              sort_seconds = excluded.sort_seconds, sort_nanos = excluded.sort_nanos`,
            input.chatroomId,
            input.groupId,
            input.kind,
            input.topicId,
            input.createdAtRaw,
            sort.seconds,
            sort.nanos,
          );
        }
      });
    },

    async listChatrooms({ after, groupId, limit }) {
      assertActive();
      assertLimit(limit);
      const rows = await database.getAllAsync<ChatroomRow>(
        `SELECT chatroom_id, group_id, kind, topic_id, created_at_raw,
          sort_seconds, sort_nanos
         FROM connected_chatrooms
         WHERE group_id = ? AND (
           ? IS NULL OR sort_seconds > ? OR
           (sort_seconds = ? AND sort_nanos > ?) OR
           (sort_seconds = ? AND sort_nanos = ? AND chatroom_id > ?)
         )
         ORDER BY sort_seconds, sort_nanos, chatroom_id
         LIMIT ?`,
        groupId,
        after?.chatroomId ?? null,
        after?.sortSeconds ?? 0,
        after?.sortSeconds ?? 0,
        after?.sortNanos ?? 0,
        after?.sortSeconds ?? 0,
        after?.sortNanos ?? 0,
        after?.chatroomId ?? "",
        limit + 1,
      );
      const hasMore = rows.length > limit;
      const visible = rows.slice(0, limit);
      const last = visible.at(-1);
      return {
        hasMore,
        items: visible.map(mapChatroom),
        nextAfter: last
          ? {
              chatroomId: last.chatroom_id,
              sortNanos: last.sort_nanos,
              sortSeconds: last.sort_seconds,
            }
          : null,
      };
    },

    async mergeHistoryMessages(inputs) {
      assertActive();
      await database.withExclusiveTransactionAsync(async (transaction) => {
        for (const input of inputs)
          await mergeMessage(transaction, input, "history");
      });
    },

    async mergeCanonicalMessage(input) {
      assertActive();
      let result: MessageRow | null = null;
      await database.withExclusiveTransactionAsync(async (transaction) => {
        result = await mergeMessage(transaction, input, "canonical");
      });
      if (!result)
        throw new Error("Connected chat canonical merge did not complete.");
      return mapMessage(result);
    },

    async listMessagesWindow({ before, chatroomId, limit }) {
      assertActive();
      assertLimit(limit);
      const rows = await database.getAllAsync<MessageRow>(
        `SELECT ${MESSAGE_COLUMNS} FROM connected_chat_messages
         WHERE chatroom_id = ? AND (
           ? IS NULL OR sort_seconds < ? OR
           (sort_seconds = ? AND sort_nanos < ?) OR
           (sort_seconds = ? AND sort_nanos = ? AND sort_tiebreaker < ?) OR
           (sort_seconds = ? AND sort_nanos = ? AND sort_tiebreaker = ? AND local_id < ?)
         )
         ORDER BY sort_seconds DESC, sort_nanos DESC, sort_tiebreaker DESC, local_id DESC
         LIMIT ?`,
        chatroomId,
        before?.localId ?? null,
        before?.sortSeconds ?? 0,
        before?.sortSeconds ?? 0,
        before?.sortNanos ?? 0,
        before?.sortSeconds ?? 0,
        before?.sortNanos ?? 0,
        before?.sortTieBreaker ?? "",
        before?.sortSeconds ?? 0,
        before?.sortNanos ?? 0,
        before?.sortTieBreaker ?? "",
        before?.localId ?? "",
        limit + 1,
      );
      const hasMore = rows.length > limit;
      const newestFirst = rows.slice(0, limit);
      const oldest = newestFirst.at(-1);
      return {
        hasMore,
        items: [...newestFirst].reverse().map(mapMessage),
        nextBefore: oldest ? cursorOfMessage(oldest) : null,
      };
    },

    async enqueuePendingMessage(input: ConnectedPendingMessageInput) {
      assertActive();
      if (input.body.length === 0)
        throw new Error("Connected text message body must not be empty.");
      if (!Number.isSafeInteger(input.localCreatedAtMs))
        throw new Error("Local creation time must be a safe integer.");
      const seconds = Math.floor(input.localCreatedAtMs / 1_000);
      const nanos =
        (((input.localCreatedAtMs % 1_000) + 1_000) % 1_000) * 1_000_000;
      await database.withExclusiveTransactionAsync(async (transaction) => {
        await transaction.runAsync(
          `INSERT INTO connected_chat_messages (${MESSAGE_COLUMNS})
           VALUES (?, NULL, ?, ?, ?, NULL, NULL, ?, 'user', '[]', NULL, ?, ?, ?, ?, 'pending')`,
          input.localId,
          input.chatroomId,
          input.clientMsgId,
          principal.userId,
          input.body,
          input.localCreatedAtMs,
          seconds,
          nanos,
          input.localId,
        );
        await transaction.runAsync(
          `INSERT INTO connected_chat_outbox_commands (
            command_id, local_id, chatroom_id, client_msg_id, sender_id, body,
            state, error_code, created_at_ms
          ) VALUES (?, ?, ?, ?, ?, ?, 'queued', NULL, ?)`,
          input.commandId,
          input.localId,
          input.chatroomId,
          input.clientMsgId,
          principal.userId,
          input.body,
          input.localCreatedAtMs,
        );
      });
      const message = await database.getFirstAsync<MessageRow>(
        `SELECT ${MESSAGE_COLUMNS} FROM connected_chat_messages WHERE local_id = ?`,
        input.localId,
      );
      const command = await database.getFirstAsync<OutboxRow>(
        `SELECT command_id, local_id, chatroom_id, client_msg_id, body, state, error_code
         FROM connected_chat_outbox_commands WHERE sender_id = ? AND client_msg_id = ?`,
        principal.userId,
        input.clientMsgId,
      );
      if (!message || !command)
        throw new Error(
          "Connected chat pending transaction did not persist both rows.",
        );
      return { command: mapOutbox(command), message: mapMessage(message) };
    },

    async getOutboxCommand(clientMsgId) {
      assertActive();
      const row = await database.getFirstAsync<OutboxRow>(
        `SELECT command_id, local_id, chatroom_id, client_msg_id, body, state, error_code
         FROM connected_chat_outbox_commands WHERE sender_id = ? AND client_msg_id = ?`,
        principal.userId,
        clientMsgId,
      );
      return row ? mapOutbox(row) : null;
    },

    async markSendFailed({ clientMsgId, errorCode }) {
      assertActive();
      await database.withExclusiveTransactionAsync(async (transaction) => {
        const command = await transaction.getFirstAsync<OutboxRow>(
          `SELECT command_id, local_id, chatroom_id, client_msg_id, body, state, error_code
           FROM connected_chat_outbox_commands WHERE sender_id = ? AND client_msg_id = ?`,
          principal.userId,
          clientMsgId,
        );
        if (!command)
          throw new Error("Connected chat outbox command was not found.");
        await transaction.runAsync(
          `UPDATE connected_chat_outbox_commands SET state = 'failed', error_code = ?
           WHERE command_id = ?`,
          errorCode,
          command.command_id,
        );
        await transaction.runAsync(
          `UPDATE connected_chat_messages SET status = 'failed' WHERE local_id = ?`,
          command.local_id,
        );
      });
    },

    async retryFailedMessage({ body, chatroomId, clientMsgId }) {
      assertActive();
      let result: ConnectedMessageAndCommand | null = null;
      await database.withExclusiveTransactionAsync(async (transaction) => {
        const command = await transaction.getFirstAsync<OutboxRow>(
          `SELECT command_id, local_id, chatroom_id, client_msg_id, body, state, error_code
           FROM connected_chat_outbox_commands WHERE sender_id = ? AND client_msg_id = ?`,
          principal.userId,
          clientMsgId,
        );
        if (!command || command.state !== "failed")
          throw new Error("Connected chat failed send was not found.");
        if (command.chatroom_id !== chatroomId || command.body !== body) {
          throw new Error(
            "Connected chat retry must match the immutable room and exact body.",
          );
        }
        await transaction.runAsync(
          `UPDATE connected_chat_outbox_commands SET state = 'queued', error_code = NULL
           WHERE command_id = ? AND state = 'failed'`,
          command.command_id,
        );
        await transaction.runAsync(
          `UPDATE connected_chat_messages SET status = 'pending'
           WHERE local_id = ? AND status = 'failed'`,
          command.local_id,
        );
        const message = await transaction.getFirstAsync<MessageRow>(
          `SELECT ${MESSAGE_COLUMNS} FROM connected_chat_messages WHERE local_id = ?`,
          command.local_id,
        );
        const updated = await transaction.getFirstAsync<OutboxRow>(
          `SELECT command_id, local_id, chatroom_id, client_msg_id, body, state, error_code
           FROM connected_chat_outbox_commands WHERE command_id = ?`,
          command.command_id,
        );
        if (!message || !updated)
          throw new Error("Connected chat retry did not retain its rows.");
        result = { command: mapOutbox(updated), message: mapMessage(message) };
      });
      if (!result) throw new Error("Connected chat retry did not complete.");
      return result;
    },
  };
}
