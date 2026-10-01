import { getMediaContentPolicy } from "../../contracts/server/media";
import type { SqliteRepositoryDatabase, SqliteRow } from "../types";
import type { AccountPrincipal } from "./types";
import {
  createConnectedChatSyncRepository,
  hideAnnouncementMessage,
  tombstoneMessageIfLive,
} from "./connected-chat-sync-repository";
import type {
  ConnectedCanonicalMessageUpsert,
  ConnectedChatMedia,
  ConnectedChatMessage,
  ConnectedChatOutboxCommand,
  ConnectedPendingAttachment,
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
  deleted_at_ms: number | null;
  kind: "user" | "system";
  local_created_at_ms: number;
  local_id: string;
  media_json: string;
  /** Only present when selected via the `listMessagesWindow` LEFT JOIN below;
   * absent (not merely null) on every other MESSAGE_COLUMNS-only read. */
  outbox_error_code?: ConnectedSendErrorCode | null;
  pending_media_json: string;
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
  media_upload_ids_json: string;
  state: "queued" | "in_flight" | "acked" | "failed";
};

const RFC3339 =
  /^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2})(?:\.(\d{1,9}))?(Z|[+-]\d{2}:\d{2})$/;

const MESSAGE_COLUMNS = `local_id, server_message_id, chatroom_id,
  client_msg_id, sender_id, sender_nickname, sender_avatar_url, body, kind,
  media_json, pending_media_json, created_at_raw, local_created_at_ms,
  sort_seconds, sort_nanos, sort_tiebreaker, status, deleted_at_ms`;

// E2/CHAT-AC3: same columns as MESSAGE_COLUMNS, `m`-qualified for
// listMessagesWindow's LEFT JOIN against connected_chat_outbox_commands
// (`local_id`, `chatroom_id`, `client_msg_id`, `sender_id`, `body` collide
// between the two tables' unqualified column names).
const MESSAGE_COLUMNS_QUALIFIED = `m.local_id, m.server_message_id, m.chatroom_id,
  m.client_msg_id, m.sender_id, m.sender_nickname, m.sender_avatar_url, m.body, m.kind,
  m.media_json, m.pending_media_json, m.created_at_raw, m.local_created_at_ms,
  m.sort_seconds, m.sort_nanos, m.sort_tiebreaker, m.status, m.deleted_at_ms`;

const OUTBOX_COLUMNS = `command_id, local_id, chatroom_id, client_msg_id,
  body, media_upload_ids_json, state, error_code`;

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

// posterMediaId is a new key on rows persisted before this field existed;
// JSON.parse leaves it absent (undefined), never null, so both readers
// normalize it explicitly rather than trusting the unsafe cast below.
function parseMedia(value: string): readonly ConnectedChatMedia[] {
  const parsed: unknown = JSON.parse(value);
  if (!Array.isArray(parsed)) {
    throw new Error("Connected chat media metadata is not an array.");
  }
  return (parsed as ConnectedChatMedia[]).map((item) => ({
    ...item,
    posterMediaId: item.posterMediaId ?? null,
  }));
}

function parsePendingMedia(
  value: string,
): readonly ConnectedPendingAttachment[] {
  const parsed: unknown = JSON.parse(value);
  if (!Array.isArray(parsed)) {
    throw new Error("Connected pending media metadata is not an array.");
  }
  return (parsed as ConnectedPendingAttachment[]).map((item) => ({
    ...item,
    posterMediaId: item.posterMediaId ?? null,
  }));
}

function parseMediaUploadIds(value: string): readonly string[] {
  const parsed: unknown = JSON.parse(value);
  if (
    !Array.isArray(parsed) ||
    parsed.some((item) => typeof item !== "string")
  ) {
    throw new Error("Connected chat upload references are not a string array.");
  }
  return parsed;
}

function snapshotPendingMedia(
  body: string,
  media: readonly ConnectedPendingAttachment[] | undefined,
): readonly ConnectedPendingAttachment[] {
  if (typeof body !== "string") {
    throw new Error("Connected chat message body must be a string.");
  }
  const snapshot = (media ?? []).map((item) => ({ ...item }));
  if (snapshot.length === 0) {
    if (body.length === 0) {
      throw new Error(
        "Connected chat message body must not be empty unless media is included.",
      );
    }
    return snapshot;
  }
  if (snapshot.length > 4) {
    throw new Error(
      "Connected chat message supports at most four attachments.",
    );
  }

  const uploadIds = new Set<string>();
  for (const item of snapshot) {
    if (
      typeof item.mediaUploadId !== "string" ||
      item.mediaUploadId.length === 0
    ) {
      throw new Error("Connected chat media upload id must not be empty.");
    }
    if (uploadIds.has(item.mediaUploadId)) {
      throw new Error("Connected chat media upload ids must be unique.");
    }
    uploadIds.add(item.mediaUploadId);
    const contentPolicy =
      typeof item.type === "string" ? getMediaContentPolicy(item.type) : null;
    if (contentPolicy === null) {
      throw new Error("Connected chat media type is unsupported.");
    }
    if (
      !Number.isSafeInteger(item.byteSize) ||
      item.byteSize <= 0 ||
      item.byteSize > contentPolicy.maxBytes
    ) {
      throw new Error(
        "Connected chat media byte size is outside the supported limit.",
      );
    }
    if (
      item.filename !== null &&
      (typeof item.filename !== "string" || item.filename.length > 255)
    ) {
      throw new Error(
        "Connected chat media filename must be a string of at most 255 characters.",
      );
    }
    for (const [name, value] of [
      ["width", item.width],
      ["height", item.height],
    ] as const) {
      if (value !== null && (!Number.isSafeInteger(value) || value <= 0)) {
        throw new Error(
          `Connected chat media ${name} must be a positive safe integer.`,
        );
      }
    }
    if (
      item.duration !== null &&
      (!Number.isFinite(item.duration) || item.duration <= 0)
    ) {
      throw new Error("Connected chat media duration must be positive.");
    }
  }

  const audio = snapshot.filter((item) => item.type.startsWith("audio/"));
  if (audio.length > 0) {
    if (snapshot.length !== 1 || body.length !== 0) {
      throw new Error(
        "Connected chat audio must be the only attachment and have no body.",
      );
    }
    const duration = audio[0]?.duration;
    if (duration === null || duration === undefined || duration > 330) {
      throw new Error(
        "Connected chat audio duration must be positive and at most 330 seconds.",
      );
    }
  }
  return snapshot;
}

function mapMessage(row: MessageRow): ConnectedChatMessage {
  const pendingMedia = parsePendingMedia(row.pending_media_json);
  return {
    body: row.body,
    chatroomId: row.chatroom_id,
    clientMsgId: row.client_msg_id,
    createdAtRaw: row.created_at_raw,
    deletedAtMs: row.deleted_at_ms,
    ...(row.outbox_error_code !== undefined
      ? { errorCode: row.outbox_error_code }
      : {}),
    kind: row.kind,
    localCreatedAtMs: row.local_created_at_ms,
    localId: row.local_id,
    media: parseMedia(row.media_json),
    ...(pendingMedia.length > 0 ? { pendingMedia } : {}),
    senderAvatarUrl: row.sender_avatar_url,
    senderId: row.sender_id,
    senderNickname: row.sender_nickname,
    serverMessageId: row.server_message_id,
    status: row.status,
  };
}

function mapOutbox(row: OutboxRow): ConnectedChatOutboxCommand {
  const mediaUploadIds = parseMediaUploadIds(row.media_upload_ids_json);
  return {
    body: row.body,
    chatroomId: row.chatroom_id,
    clientMsgId: row.client_msg_id,
    commandId: row.command_id,
    errorCode: row.error_code,
    localId: row.local_id,
    ...(mediaUploadIds.length > 0 ? { mediaUploadIds } : {}),
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

/** Shared by mergeMessage's "history" source (above) and
 * topics-repository.ts's refreshAuthorIdentities (T3/T4 network responses,
 * M15 AC8): propagates a user's current display to every local
 * connected_chat_messages row for that sender_id in this account DB --
 * chatroom/group-agnostic, tombstoned rows included, since names/avatars are
 * per-user (server `users` table), not scoped to a chatroom or group. Only
 * sender_nickname/sender_avatar_url are ever assigned, so migration 006's
 * connected_chat_messages_deletion_monotonic trigger (`BEFORE UPDATE OF
 * deleted_at_ms`) never engages and body/media/deleted_at_ms/kind stay
 * frozen (E2). The WHERE diff makes a call for an already-matching sender a
 * no-op write, so repeated calls for the same identity settle after the
 * first real change. `excludeLocalId` skips the row a caller just wrote
 * directly with these exact values (mergeMessage's own upsert) -- pass null
 * to propagate to every row for that sender with no exclusion (the topics
 * author-identity path, which never merges a message row itself). */
export async function propagateSenderIdentity(
  transaction: SqliteRepositoryDatabase,
  input: Readonly<{
    avatar: string | null;
    excludeLocalId: string | null;
    nickname: string | null;
    senderId: string;
  }>,
): Promise<void> {
  await transaction.runAsync(
    `UPDATE connected_chat_messages
     SET sender_nickname = ?, sender_avatar_url = ?
     WHERE sender_id = ?
       AND (? IS NULL OR local_id != ?)
       AND (sender_nickname IS NOT ? OR sender_avatar_url IS NOT ?)`,
    input.nickname,
    input.avatar,
    input.senderId,
    input.excludeLocalId,
    input.excludeLocalId,
    input.nickname,
    input.avatar,
  );
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
    // E2: a locally recorded tombstone is monotonic. A later message.created
    // replay or C2/history reconcile page for the same message identity must
    // never restore body/media/sender fields or clear deleted_at_ms -- the
    // SQLite trigger also blocks clearing the column directly, but this
    // early return additionally freezes every other column once deleted, and
    // avoids a needless write the trigger would otherwise have to police.
    if (existing?.deleted_at_ms != null) return existing;
    const localId = existing?.local_id ?? input.localId;
    const localCreatedAtMs =
      existing?.local_created_at_ms ??
      sort.seconds * 1_000 + Math.floor(sort.nanos / 1_000_000);
    // "history" (the denormalized HTTP endpoint) always carries an authoritative
    // sender_nickname/sender_avatar_url and is trusted unconditionally, including
    // null for system messages. "canonical" (realtime/delta payloads) only
    // overwrites when the incoming value is non-null -- a null there means the
    // event predates this fix or is a system message, and must not clobber a
    // previously-stored nickname/avatar for the same message identity.
    const nickname =
      source === "history"
        ? input.senderNickname
        : (input.senderNickname ?? existing?.sender_nickname ?? null);
    const avatar =
      source === "history"
        ? input.senderAvatarUrl
        : (input.senderAvatarUrl ?? existing?.sender_avatar_url ?? null);

    if (existing) {
      await transaction.runAsync(
        `UPDATE connected_chat_messages SET
          server_message_id = ?, chatroom_id = ?, client_msg_id = ?, sender_id = ?,
          sender_nickname = ?, sender_avatar_url = ?, body = ?, kind = ?, media_json = ?,
          pending_media_json = '[]', created_at_raw = ?, sort_seconds = ?,
          sort_nanos = ?, sort_tiebreaker = ?, status = 'sent'
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
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, '[]', ?, ?, ?, ?, ?, 'sent', NULL)`,
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
         SET state = 'acked', error_code = NULL,
             lease_token = NULL, lease_expires_at_ms = NULL
         WHERE sender_id = ? AND client_msg_id = ?`,
        principal.userId,
        input.clientMsgId,
      );
    }
    // Defect 10 (G1/E12): "history" (C2 pages, reconcileChatHistory) is the
    // authoritative *current* sender display for input.senderId -- names and
    // avatars are per-user (server `users` table), not chatroom/group
    // scoped, and C2 never returns an already-deleted message again
    // (m.deleted_at_ms IS NULL in message_history), so a deleted row's own
    // sender_nickname/sender_avatar_url otherwise never gets a fresh input
    // to refresh from. Propagate the value this merge just established to
    // every *other* local row for the same sender_id (see
    // propagateSenderIdentity below). "canonical" (delta/WS) is
    // intentionally excluded: replaying an old event must never regress a
    // name/avatar that history has already brought current.
    if (source === "history" && input.senderId !== null) {
      await propagateSenderIdentity(transaction, {
        avatar,
        excludeLocalId: localId,
        nickname,
        senderId: input.senderId,
      });
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

  const syncRepository = createConnectedChatSyncRepository({
    assertActive,
    database,
    mergeMessage: async (transaction, input, source) => {
      await mergeMessage(transaction, input, source);
    },
    principal,
  });

  return {
    ...syncRepository,
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

    async pruneChatroomsNotIn({ groupId, keepChatroomIds }) {
      assertActive();
      await database.withExclusiveTransactionAsync(async (transaction) => {
        if (keepChatroomIds.length === 0) {
          // `NOT IN ()` is invalid SQL with an empty list -- an empty
          // confirmed-live set means every local row for this group is stale.
          await transaction.runAsync(
            `DELETE FROM connected_chatrooms WHERE group_id = ?`,
            groupId,
          );
          return;
        }
        const placeholders = keepChatroomIds.map(() => "?").join(", ");
        // `ON DELETE CASCADE` (migrations 002/006) removes each pruned room's
        // messages, outbox commands, applied-event records and
        // reconciliation markers with it in this same statement.
        await transaction.runAsync(
          `DELETE FROM connected_chatrooms
           WHERE group_id = ? AND chatroom_id NOT IN (${placeholders})`,
          groupId,
          ...keepChatroomIds,
        );
      });
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
      // E2/CHAT-AC3: LEFT JOINed so a failed row's UI can show its specific
      // reason (e.g. media_expired) -- the outbox command is the only place
      // error_code lives (connected_chat_messages has no such column).
      const rows = await database.getAllAsync<MessageRow>(
        `SELECT ${MESSAGE_COLUMNS_QUALIFIED}, o.error_code AS outbox_error_code
         FROM connected_chat_messages m
         LEFT JOIN connected_chat_outbox_commands o ON o.local_id = m.local_id
         WHERE m.chatroom_id = ?
           AND NOT (m.kind = 'system' AND m.deleted_at_ms IS NOT NULL)
           AND (
             ? IS NULL OR m.sort_seconds < ? OR
             (m.sort_seconds = ? AND m.sort_nanos < ?) OR
             (m.sort_seconds = ? AND m.sort_nanos = ? AND m.sort_tiebreaker < ?) OR
             (m.sort_seconds = ? AND m.sort_nanos = ? AND m.sort_tiebreaker = ? AND m.local_id < ?)
           )
         ORDER BY m.sort_seconds DESC, m.sort_nanos DESC, m.sort_tiebreaker DESC, m.local_id DESC
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
      const pendingMedia = snapshotPendingMedia(input.body, input.media);
      const pendingMediaJson = JSON.stringify(pendingMedia);
      const mediaUploadIdsJson = JSON.stringify(
        pendingMedia.map((item) => item.mediaUploadId),
      );
      if (!Number.isSafeInteger(input.localCreatedAtMs))
        throw new Error("Local creation time must be a safe integer.");
      const seconds = Math.floor(input.localCreatedAtMs / 1_000);
      const nanos =
        (((input.localCreatedAtMs % 1_000) + 1_000) % 1_000) * 1_000_000;
      await database.withExclusiveTransactionAsync(async (transaction) => {
        await transaction.runAsync(
          `INSERT INTO connected_chat_messages (${MESSAGE_COLUMNS})
           VALUES (?, NULL, ?, ?, ?, NULL, NULL, ?, 'user', '[]', ?, NULL, ?, ?, ?, ?, 'pending', NULL)`,
          input.localId,
          input.chatroomId,
          input.clientMsgId,
          principal.userId,
          input.body,
          pendingMediaJson,
          input.localCreatedAtMs,
          seconds,
          nanos,
          input.localId,
        );
        await transaction.runAsync(
          `INSERT INTO connected_chat_outbox_commands (
            command_id, local_id, chatroom_id, client_msg_id, sender_id, body,
            media_upload_ids_json, state, error_code, created_at_ms, next_attempt_at_ms
          ) VALUES (?, ?, ?, ?, ?, ?, ?, 'queued', NULL, ?, ?)`,
          input.commandId,
          input.localId,
          input.chatroomId,
          input.clientMsgId,
          principal.userId,
          input.body,
          mediaUploadIdsJson,
          input.localCreatedAtMs,
          input.localCreatedAtMs,
        );
      });
      const message = await database.getFirstAsync<MessageRow>(
        `SELECT ${MESSAGE_COLUMNS} FROM connected_chat_messages WHERE local_id = ?`,
        input.localId,
      );
      const command = await database.getFirstAsync<OutboxRow>(
        `SELECT ${OUTBOX_COLUMNS}
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
        `SELECT ${OUTBOX_COLUMNS}
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
          `SELECT ${OUTBOX_COLUMNS}
           FROM connected_chat_outbox_commands WHERE sender_id = ? AND client_msg_id = ?`,
          principal.userId,
          clientMsgId,
        );
        if (!command)
          throw new Error("Connected chat outbox command was not found.");
        if (command.state === "acked") return;
        await transaction.runAsync(
          `UPDATE connected_chat_outbox_commands SET
             state = 'failed', error_code = ?, lease_token = NULL,
             lease_expires_at_ms = NULL
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
          `SELECT ${OUTBOX_COLUMNS}
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
          `UPDATE connected_chat_outbox_commands SET
             state = 'queued', error_code = NULL, next_attempt_at_ms = 0,
             lease_token = NULL, lease_expires_at_ms = NULL
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
          `SELECT ${OUTBOX_COLUMNS}
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

    async markMessageDeleted({ deletedAtMs, serverMessageId }) {
      assertActive();
      assertNonEmptyValue(serverMessageId, "Deleted message server id");
      await database.withExclusiveTransactionAsync(async (transaction) => {
        await tombstoneMessageIfLive(transaction, {
          deletedAtMs,
          serverMessageId,
        });
      });
    },

    async markAnnouncementDeleted({ deletedAtMs, serverMessageId }) {
      assertActive();
      assertNonEmptyValue(serverMessageId, "Deleted announcement server id");
      await database.withExclusiveTransactionAsync(async (transaction) => {
        await hideAnnouncementMessage(transaction, {
          deletedAtMs,
          serverMessageId,
        });
      });
    },

    async discardFailedMessage({ chatroomId, clientMsgId }) {
      assertActive();
      await database.withExclusiveTransactionAsync(async (transaction) => {
        const command = await transaction.getFirstAsync<OutboxRow>(
          `SELECT ${OUTBOX_COLUMNS}
           FROM connected_chat_outbox_commands WHERE sender_id = ? AND client_msg_id = ?`,
          principal.userId,
          clientMsgId,
        );
        if (
          !command ||
          command.state !== "failed" ||
          command.chatroom_id !== chatroomId
        )
          return;
        // FOREIGN KEY (local_id, chatroom_id) REFERENCES
        // connected_chat_messages(...) ON DELETE CASCADE removes the matching
        // connected_chat_outbox_commands row (and with it the upload draft
        // reference in media_upload_ids_json) in the same statement -- AC5's
        // "메시지 행, outbox 명령, 업로드 초안을 한 번에 정리" in one delete.
        await transaction.runAsync(
          `DELETE FROM connected_chat_messages WHERE local_id = ? AND status = 'failed'`,
          command.local_id,
        );
      });
    },
  };
}

function assertNonEmptyValue(value: string, name: string): void {
  if (value.length === 0) throw new Error(`${name} must not be empty.`);
}
