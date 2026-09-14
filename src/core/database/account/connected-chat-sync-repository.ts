import type { SqliteRepositoryDatabase, SqliteRow } from "../types";
import type { AccountPrincipal } from "./types";
import type {
  ConnectedCanonicalMessageUpsert,
  ConnectedChatSyncRepository,
  ConnectedClaimedOutboxCommand,
  ConnectedHistoryMessageUpsert,
  ConnectedOrderedEventApplyResult,
  ConnectedReconciliationScope,
  ConnectedSendErrorCode,
} from "./connected-chat-types";

type AppliedEventRow = SqliteRow & {
  chatroom_id: string;
  event_kind: "message.created" | "unsupported";
  message_server_id: string | null;
};

type CheckpointRow = SqliteRow & { checkpoint: string | null };
type CommandIdRow = SqliteRow & { command_id: string };
type DirtyScopeRow = SqliteRow & {
  marker_event_id: string;
  scope: ConnectedReconciliationScope;
};

type ClaimedOutboxRow = SqliteRow & {
  attempt_count: number;
  body: string;
  chatroom_id: string;
  client_msg_id: string;
  command_id: string;
  error_code: ConnectedSendErrorCode | null;
  lease_expires_at_ms: number | null;
  lease_token: string | null;
  local_id: string;
  media_upload_ids_json: string;
  next_attempt_at_ms: number;
  state: "queued" | "in_flight" | "acked" | "failed";
};

type SyncRepositoryDependencies = Readonly<{
  assertActive: () => void;
  database: SqliteRepositoryDatabase;
  mergeMessage: (
    transaction: SqliteRepositoryDatabase,
    input: ConnectedCanonicalMessageUpsert | ConnectedHistoryMessageUpsert,
    source: "history" | "canonical",
  ) => Promise<void>;
  principal: AccountPrincipal;
}>;

const CLAIMED_OUTBOX_COLUMNS = `command_id, local_id, chatroom_id,
  client_msg_id, body, media_upload_ids_json, state, error_code, attempt_count,
  next_attempt_at_ms, lease_token, lease_expires_at_ms`;

function assertNonEmpty(value: string, name: string): void {
  if (value.length === 0) throw new Error(`${name} must not be empty.`);
}

function assertMillis(value: number, name: string): void {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new Error(`${name} must be a non-negative safe integer.`);
  }
}

function assertClaimLimit(limit: number): void {
  if (!Number.isInteger(limit) || limit < 1 || limit > 100) {
    throw new Error(
      "Outbox claim limit must be an integer from 1 through 100.",
    );
  }
}

function mapClaimedOutbox(
  row: ClaimedOutboxRow,
): ConnectedClaimedOutboxCommand {
  if (
    row.state !== "in_flight" ||
    row.lease_token === null ||
    row.lease_expires_at_ms === null
  ) {
    throw new Error("Claimed outbox row is missing its active lease.");
  }
  const mediaUploadIds: unknown = JSON.parse(row.media_upload_ids_json);
  if (
    !Array.isArray(mediaUploadIds) ||
    mediaUploadIds.some((item) => typeof item !== "string")
  ) {
    throw new Error("Claimed outbox upload references are not a string array.");
  }
  return {
    attemptCount: row.attempt_count,
    body: row.body,
    chatroomId: row.chatroom_id,
    clientMsgId: row.client_msg_id,
    commandId: row.command_id,
    errorCode: row.error_code,
    leaseExpiresAtMs: row.lease_expires_at_ms,
    leaseToken: row.lease_token,
    localId: row.local_id,
    ...(mediaUploadIds.length > 0 ? { mediaUploadIds } : {}),
    nextAttemptAtMs: row.next_attempt_at_ms,
    state: row.state,
  };
}

async function ensureAndReadCheckpoint(
  transaction: SqliteRepositoryDatabase,
  chatroomId: string,
): Promise<string | null> {
  await transaction.runAsync(
    `INSERT INTO connected_chat_event_checkpoints (chatroom_id, checkpoint)
     VALUES (?, NULL) ON CONFLICT(chatroom_id) DO NOTHING`,
    chatroomId,
  );
  const row = await transaction.getFirstAsync<CheckpointRow>(
    `SELECT checkpoint FROM connected_chat_event_checkpoints WHERE chatroom_id = ?`,
    chatroomId,
  );
  if (!row) throw new Error("Connected chat event checkpoint was not created.");
  return row.checkpoint;
}

async function advanceCheckpoint(
  transaction: SqliteRepositoryDatabase,
  input: Readonly<{
    chatroomId: string;
    cursor: string;
    expectedCursor: string | null;
  }>,
): Promise<void> {
  const update = await transaction.runAsync(
    `UPDATE connected_chat_event_checkpoints SET checkpoint = ?
     WHERE chatroom_id = ? AND checkpoint IS ?`,
    input.cursor,
    input.chatroomId,
    input.expectedCursor,
  );
  if (update.changes !== 1) {
    throw new Error("Connected chat checkpoint equality CAS failed.");
  }
}

async function insertAppliedEventIfNew(
  transaction: SqliteRepositoryDatabase,
  input: Readonly<{
    chatroomId: string;
    eventId: string;
    eventKind: "message.created" | "unsupported";
    messageServerId: string | null;
  }>,
): Promise<boolean> {
  const existing = await transaction.getFirstAsync<AppliedEventRow>(
    `SELECT chatroom_id, event_kind, message_server_id
     FROM connected_chat_applied_events WHERE event_id = ?`,
    input.eventId,
  );
  if (existing) {
    if (
      existing.chatroom_id !== input.chatroomId ||
      existing.event_kind !== input.eventKind ||
      existing.message_server_id !== input.messageServerId
    ) {
      throw new Error(
        "Connected chat event identity cannot cross chatroom, kind, or message identity.",
      );
    }
    return false;
  }
  await transaction.runAsync(
    `INSERT INTO connected_chat_applied_events (
      event_id, chatroom_id, event_kind, message_server_id
    ) VALUES (?, ?, ?, ?)`,
    input.eventId,
    input.chatroomId,
    input.eventKind,
    input.messageServerId,
  );
  return true;
}

function validateOrderedIdentity(input: {
  chatroomId: string;
  cursor: string;
  eventId: string;
  expectedCursor: string | null;
}): void {
  assertNonEmpty(input.chatroomId, "Chatroom id");
  assertNonEmpty(input.cursor, "Event cursor");
  assertNonEmpty(input.eventId, "Event id");
  if (input.expectedCursor !== null) {
    assertNonEmpty(input.expectedCursor, "Expected event cursor");
  }
}

async function prepareOrderedApply(
  transaction: SqliteRepositoryDatabase,
  input: Readonly<{
    chatroomId: string;
    cursor: string;
    expectedCursor: string | null;
  }>,
): Promise<ConnectedOrderedEventApplyResult | null> {
  const actualCheckpoint = await ensureAndReadCheckpoint(
    transaction,
    input.chatroomId,
  );
  if (actualCheckpoint !== input.expectedCursor) {
    return { actualCheckpoint, status: "checkpoint_mismatch" };
  }
  if (input.cursor === input.expectedCursor) {
    return { checkpoint: input.cursor, status: "no_progress" };
  }
  await advanceCheckpoint(transaction, input);
  return null;
}

export function createConnectedChatSyncRepository({
  assertActive,
  database,
  mergeMessage,
  principal,
}: SyncRepositoryDependencies): ConnectedChatSyncRepository {
  return {
    async claimDueOutboxCommands({
      leaseExpiresAtMs,
      leaseToken,
      limit,
      nowMs,
    }) {
      assertActive();
      assertMillis(nowMs, "Outbox claim time");
      assertMillis(leaseExpiresAtMs, "Outbox lease expiry");
      assertNonEmpty(leaseToken, "Outbox lease identifier");
      assertClaimLimit(limit);
      if (leaseExpiresAtMs <= nowMs) {
        throw new Error("Outbox lease expiry must be later than claim time.");
      }

      const claimed: ConnectedClaimedOutboxCommand[] = [];
      await database.withExclusiveTransactionAsync(async (transaction) => {
        const candidates = await transaction.getAllAsync<CommandIdRow>(
          `SELECT command_id FROM connected_chat_outbox_commands
           WHERE sender_id = ? AND (
             (state = 'queued' AND next_attempt_at_ms <= ?) OR
             (state = 'in_flight' AND (
               lease_token IS NULL OR lease_expires_at_ms IS NULL OR lease_expires_at_ms <= ?
             ))
           )
           ORDER BY
             CASE WHEN state = 'queued' THEN next_attempt_at_ms
                  ELSE COALESCE(lease_expires_at_ms, 0) END,
             created_at_ms, command_id
           LIMIT ?`,
          principal.userId,
          nowMs,
          nowMs,
          limit,
        );
        for (const candidate of candidates) {
          const update = await transaction.runAsync(
            `UPDATE connected_chat_outbox_commands SET
              state = 'in_flight', attempt_count = attempt_count + 1,
              lease_token = ?, lease_expires_at_ms = ?, error_code = NULL
             WHERE command_id = ? AND sender_id = ? AND (
               (state = 'queued' AND next_attempt_at_ms <= ?) OR
               (state = 'in_flight' AND (
                 lease_token IS NULL OR lease_expires_at_ms IS NULL OR lease_expires_at_ms <= ?
               ))
             )`,
            leaseToken,
            leaseExpiresAtMs,
            candidate.command_id,
            principal.userId,
            nowMs,
            nowMs,
          );
          if (update.changes !== 1) continue;
          const row = await transaction.getFirstAsync<ClaimedOutboxRow>(
            `SELECT ${CLAIMED_OUTBOX_COLUMNS}
             FROM connected_chat_outbox_commands WHERE command_id = ?`,
            candidate.command_id,
          );
          if (!row) throw new Error("Claimed outbox command disappeared.");
          claimed.push(mapClaimedOutbox(row));
        }
      });
      return claimed;
    },

    async rescheduleClaimedOutboxCommand({
      commandId,
      errorCode,
      leaseToken,
      nextAttemptAtMs,
    }) {
      assertActive();
      assertNonEmpty(commandId, "Outbox command id");
      assertNonEmpty(leaseToken, "Outbox lease identifier");
      assertMillis(nextAttemptAtMs, "Next outbox attempt time");
      const update = await database.runAsync(
        `UPDATE connected_chat_outbox_commands SET
          state = 'queued', error_code = ?, next_attempt_at_ms = ?,
          lease_token = NULL, lease_expires_at_ms = NULL
         WHERE command_id = ? AND sender_id = ?
           AND state = 'in_flight' AND lease_token = ?`,
        errorCode,
        nextAttemptAtMs,
        commandId,
        principal.userId,
        leaseToken,
      );
      return update.changes === 1;
    },

    async failClaimedOutboxCommand({ commandId, errorCode, leaseToken }) {
      assertActive();
      assertNonEmpty(commandId, "Outbox command id");
      assertNonEmpty(leaseToken, "Outbox lease identifier");
      let failed = false;
      await database.withExclusiveTransactionAsync(async (transaction) => {
        const update = await transaction.runAsync(
          `UPDATE connected_chat_outbox_commands SET
            state = 'failed', error_code = ?,
            lease_token = NULL, lease_expires_at_ms = NULL
           WHERE command_id = ? AND sender_id = ?
             AND state = 'in_flight' AND lease_token = ?`,
          errorCode,
          commandId,
          principal.userId,
          leaseToken,
        );
        if (update.changes !== 1) return;
        await transaction.runAsync(
          `UPDATE connected_chat_messages SET status = 'failed'
           WHERE local_id = (
             SELECT local_id FROM connected_chat_outbox_commands WHERE command_id = ?
           )`,
          commandId,
        );
        failed = true;
      });
      return failed;
    },

    async releaseOutboxClaims({ leaseToken, nextAttemptAtMs }) {
      assertActive();
      assertNonEmpty(leaseToken, "Outbox lease identifier");
      assertMillis(nextAttemptAtMs, "Released outbox attempt time");
      const update = await database.runAsync(
        `UPDATE connected_chat_outbox_commands SET
          state = 'queued', next_attempt_at_ms = ?,
          lease_token = NULL, lease_expires_at_ms = NULL
         WHERE sender_id = ? AND state = 'in_flight' AND lease_token = ?`,
        nextAttemptAtMs,
        principal.userId,
        leaseToken,
      );
      return update.changes;
    },

    async getEventCheckpoint(chatroomId) {
      assertActive();
      assertNonEmpty(chatroomId, "Chatroom id");
      const row = await database.getFirstAsync<CheckpointRow>(
        `SELECT checkpoint FROM connected_chat_event_checkpoints WHERE chatroom_id = ?`,
        chatroomId,
      );
      return row?.checkpoint ?? null;
    },

    async applyRealtimeMessageCreated({ eventId, message }) {
      assertActive();
      assertNonEmpty(eventId, "Event id");
      let status: "applied" | "duplicate" = "duplicate";
      await database.withExclusiveTransactionAsync(async (transaction) => {
        const isNew = await insertAppliedEventIfNew(transaction, {
          chatroomId: message.chatroomId,
          eventId,
          eventKind: "message.created",
          messageServerId: message.serverMessageId,
        });
        if (!isNew) return;
        await mergeMessage(transaction, message, "canonical");
        status = "applied";
      });
      return { status };
    },

    async applyOrderedMessageCreated(input) {
      assertActive();
      validateOrderedIdentity(input);
      if (input.message.chatroomId !== input.chatroomId) {
        throw new Error("Ordered message chatroom must match its event scope.");
      }
      let result: ConnectedOrderedEventApplyResult | null = null;
      await database.withExclusiveTransactionAsync(async (transaction) => {
        result = await prepareOrderedApply(transaction, input);
        if (result) return;
        const isNew = await insertAppliedEventIfNew(transaction, {
          chatroomId: input.chatroomId,
          eventId: input.eventId,
          eventKind: "message.created",
          messageServerId: input.message.serverMessageId,
        });
        if (isNew) await mergeMessage(transaction, input.message, "canonical");
        result = {
          checkpoint: input.cursor,
          status: isNew ? "applied" : "duplicate",
        };
      });
      if (!result)
        throw new Error("Ordered message event apply did not complete.");
      return result;
    },

    async applyOrderedUnsupportedEvent(input) {
      assertActive();
      validateOrderedIdentity(input);
      let result: ConnectedOrderedEventApplyResult | null = null;
      await database.withExclusiveTransactionAsync(async (transaction) => {
        result = await prepareOrderedApply(transaction, input);
        if (result) return;
        const isNew = await insertAppliedEventIfNew(transaction, {
          chatroomId: input.chatroomId,
          eventId: input.eventId,
          eventKind: "unsupported",
          messageServerId: null,
        });
        if (isNew) {
          await transaction.runAsync(
            `INSERT INTO connected_chat_reconciliation_scopes (
              chatroom_id, scope, marker_event_id
            ) VALUES (?, ?, ?)
            ON CONFLICT(chatroom_id, scope) DO UPDATE SET
              marker_event_id = excluded.marker_event_id`,
            input.chatroomId,
            input.reconcileScope,
            input.eventId,
          );
        }
        result = {
          checkpoint: input.cursor,
          status: isNew ? "applied" : "duplicate",
        };
      });
      if (!result)
        throw new Error("Ordered unsupported event apply did not complete.");
      return result;
    },

    async listDirtyReconciliationScopes(chatroomId) {
      assertActive();
      assertNonEmpty(chatroomId, "Chatroom id");
      const rows = await database.getAllAsync<DirtyScopeRow>(
        `SELECT scope, marker_event_id
         FROM connected_chat_reconciliation_scopes
         WHERE chatroom_id = ? ORDER BY scope`,
        chatroomId,
      );
      return rows.map((row) => ({
        markerEventId: row.marker_event_id,
        scope: row.scope,
      }));
    },

    async reconcileChatHistory({
      chatroomId,
      expectedMarkerEventId,
      messages,
    }) {
      assertActive();
      assertNonEmpty(chatroomId, "Chatroom id");
      assertNonEmpty(expectedMarkerEventId, "Reconciliation marker event id");
      if (messages.some((message) => message.chatroomId !== chatroomId)) {
        throw new Error(
          "Reconciled history messages must match the dirty chatroom scope.",
        );
      }
      await database.withExclusiveTransactionAsync(async (transaction) => {
        for (const message of messages) {
          await mergeMessage(transaction, message, "history");
        }
        await transaction.runAsync(
          `DELETE FROM connected_chat_reconciliation_scopes
           WHERE chatroom_id = ? AND scope = 'chat_history'
             AND marker_event_id = ?`,
          chatroomId,
          expectedMarkerEventId,
        );
      });
    },
  };
}
