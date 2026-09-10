// This file runs under Bun as a disposable real-SQLite scenario. The project
// TypeScript environment intentionally exposes only the React Native runtime.
// @ts-nocheck
import assert from "node:assert/strict";

import { Database } from "bun:sqlite";

import { runMigrations } from "../../../../src/core/database/migrate";
import { accountMigrations } from "../../../../src/core/database/account/migrations";
import { createConnectedChatRepository } from "../../../../src/core/database/account/connected-chat-repository";

type Value = string | number | null;

function createAdapter(database: Database) {
  const adapter = {
    async execAsync(statement: string): Promise<void> {
      database.exec(statement);
    },
    async getAllAsync<Row>(
      statement: string,
      ...values: Value[]
    ): Promise<Row[]> {
      return database.query(statement).all(...values) as Row[];
    },
    async getFirstAsync<Row>(
      statement: string,
      ...values: Value[]
    ): Promise<Row | null> {
      return (database.query(statement).get(...values) as Row | null) ?? null;
    },
    async runAsync(statement: string, ...values: Value[]) {
      const result = database.query(statement).run(...values);
      return {
        changes: result.changes,
        lastInsertRowId: Number(result.lastInsertRowid),
      };
    },
    async withExclusiveTransactionAsync<Result>(
      operation: (transaction: typeof adapter) => Promise<Result>,
    ): Promise<Result> {
      database.exec("BEGIN EXCLUSIVE");
      try {
        const result = await operation(adapter);
        database.exec("COMMIT");
        return result;
      } catch (error) {
        database.exec("ROLLBACK");
        throw error;
      }
    },
  };
  return adapter;
}

const PRINCIPAL = Object.freeze({
  epoch: 9,
  origin: "https://api.jamye.example",
  userId: "aaaaaaaa-1111-4111-8111-111111111111",
});
const ROOM_ID = "bbbbbbbb-2222-4222-8222-222222222222";
const OTHER_ROOM_ID = "cccccccc-3333-4333-8333-333333333333";
const GROUP_ID = "dddddddd-4444-4444-8444-444444444444";

const canonicalMessage = (overrides = {}) => ({
  body: "canonical body",
  chatroomId: ROOM_ID,
  clientMsgId: "eeeeeeee-5555-4555-8555-555555555555",
  createdAtRaw: "2026-09-10T00:00:00.123456789Z",
  kind: "user",
  localId: "canonical-local",
  media: [],
  senderId: PRINCIPAL.userId,
  serverMessageId: "ffffffff-6666-4666-8666-666666666666",
  ...overrides,
});

async function openV2Database() {
  const database = new Database(":memory:");
  const adapter = createAdapter(database);
  await runMigrations(adapter, accountMigrations.slice(0, 2));
  database
    .query(
      `INSERT INTO scope_metadata (singleton, origin, user_id, schema_version)
       VALUES (1, ?, ?, 2)`,
    )
    .run(PRINCIPAL.origin, PRINCIPAL.userId);
  database
    .query(
      `INSERT INTO connected_chatrooms (
        chatroom_id, group_id, kind, topic_id, created_at_raw, sort_seconds, sort_nanos
      ) VALUES (?, ?, 'main', NULL, '2026-09-10T00:00:00Z', 1788998400, 0)`,
    )
    .run(ROOM_ID, GROUP_ID);
  database
    .query(
      `INSERT INTO connected_chatrooms (
        chatroom_id, group_id, kind, topic_id, created_at_raw, sort_seconds, sort_nanos
      ) VALUES (?, ?, 'main', NULL, '2026-09-10T00:00:01Z', 1788998401, 0)`,
    )
    .run(OTHER_ROOM_ID, GROUP_ID);
  return { adapter, database };
}

function insertV2Intent(
  database: Database,
  input: {
    suffix: string;
    state: "queued" | "in_flight" | "acked" | "failed";
    messageStatus: "pending" | "sent" | "failed";
    createdAtMs: number;
  },
) {
  const localId = `local-${input.suffix}`;
  const clientMsgId = `client-${input.suffix}`;
  const commandId = `command-${input.suffix}`;
  database
    .query(
      `INSERT INTO connected_chat_messages (
        local_id, server_message_id, chatroom_id, client_msg_id, sender_id,
        sender_nickname, sender_avatar_url, body, kind, media_json,
        created_at_raw, local_created_at_ms, sort_seconds, sort_nanos,
        sort_tiebreaker, status
      ) VALUES (?, NULL, ?, ?, ?, NULL, NULL, ?, 'user', '[]', NULL, ?, ?, 0, ?, ?)`,
    )
    .run(
      localId,
      ROOM_ID,
      clientMsgId,
      PRINCIPAL.userId,
      `body-${input.suffix}`,
      input.createdAtMs,
      Math.floor(input.createdAtMs / 1_000),
      localId,
      input.messageStatus,
    );
  database
    .query(
      `INSERT INTO connected_chat_outbox_commands (
        command_id, local_id, chatroom_id, client_msg_id, sender_id, body,
        state, error_code, created_at_ms
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      commandId,
      localId,
      ROOM_ID,
      clientMsgId,
      PRINCIPAL.userId,
      `body-${input.suffix}`,
      input.state,
      input.state === "failed" ? "network" : null,
      input.createdAtMs,
    );
  return { clientMsgId, commandId, localId };
}

async function migrateWithoutLosingV2Rows() {
  const { adapter, database } = await openV2Database();
  const queued = insertV2Intent(database, {
    suffix: "queued",
    state: "queued",
    messageStatus: "pending",
    createdAtMs: 10,
  });
  const inFlight = insertV2Intent(database, {
    suffix: "in-flight",
    state: "in_flight",
    messageStatus: "pending",
    createdAtMs: 20,
  });
  const failed = insertV2Intent(database, {
    suffix: "failed",
    state: "failed",
    messageStatus: "failed",
    createdAtMs: 30,
  });
  const acked = insertV2Intent(database, {
    suffix: "acked",
    state: "acked",
    messageStatus: "sent",
    createdAtMs: 40,
  });

  await runMigrations(adapter, accountMigrations);
  assert.equal(database.query("PRAGMA user_version").get().user_version, 3);
  assert.equal(
    database.query("SELECT schema_version FROM scope_metadata").get()
      .schema_version,
    3,
  );
  assert.deepEqual(
    database
      .query(
        `SELECT command_id, local_id, chatroom_id, client_msg_id, sender_id,
          body, state, error_code, created_at_ms
         FROM connected_chat_outbox_commands ORDER BY created_at_ms`,
      )
      .all(),
    [
      {
        command_id: queued.commandId,
        local_id: queued.localId,
        chatroom_id: ROOM_ID,
        client_msg_id: queued.clientMsgId,
        sender_id: PRINCIPAL.userId,
        body: "body-queued",
        state: "queued",
        error_code: null,
        created_at_ms: 10,
      },
      {
        command_id: inFlight.commandId,
        local_id: inFlight.localId,
        chatroom_id: ROOM_ID,
        client_msg_id: inFlight.clientMsgId,
        sender_id: PRINCIPAL.userId,
        body: "body-in-flight",
        state: "in_flight",
        error_code: null,
        created_at_ms: 20,
      },
      {
        command_id: failed.commandId,
        local_id: failed.localId,
        chatroom_id: ROOM_ID,
        client_msg_id: failed.clientMsgId,
        sender_id: PRINCIPAL.userId,
        body: "body-failed",
        state: "failed",
        error_code: "network",
        created_at_ms: 30,
      },
      {
        command_id: acked.commandId,
        local_id: acked.localId,
        chatroom_id: ROOM_ID,
        client_msg_id: acked.clientMsgId,
        sender_id: PRINCIPAL.userId,
        body: "body-acked",
        state: "acked",
        error_code: null,
        created_at_ms: 40,
      },
    ],
  );
  assert.deepEqual(
    database
      .query(
        "SELECT local_id, status FROM connected_chat_messages ORDER BY local_created_at_ms",
      )
      .all(),
    [
      { local_id: queued.localId, status: "pending" },
      { local_id: inFlight.localId, status: "pending" },
      { local_id: failed.localId, status: "failed" },
      { local_id: acked.localId, status: "sent" },
    ],
  );
  assert.deepEqual(
    database
      .query(
        `SELECT attempt_count, next_attempt_at_ms, lease_token, lease_expires_at_ms
         FROM connected_chat_outbox_commands WHERE command_id = ?`,
      )
      .get(queued.commandId),
    {
      attempt_count: 0,
      next_attempt_at_ms: 0,
      lease_token: null,
      lease_expires_at_ms: null,
    },
  );
  database.close();
}

async function exerciseOutboxLeaseCas() {
  const { adapter, database } = await openV2Database();
  await runMigrations(adapter, accountMigrations);
  const repository = createConnectedChatRepository(
    adapter,
    PRINCIPAL,
    () => {},
  );
  await repository.enqueuePendingMessage({
    body: "lease me",
    chatroomId: ROOM_ID,
    clientMsgId: "client-lease",
    commandId: "command-lease",
    localCreatedAtMs: 100,
    localId: "local-lease",
  });

  const first = await repository.claimDueOutboxCommands({
    nowMs: 100,
    leaseToken: "lease-old",
    leaseExpiresAtMs: 200,
    limit: 10,
  });
  assert.equal(first.length, 1);
  assert.equal(first[0].attemptCount, 1);
  assert.equal(first[0].leaseToken, "lease-old");
  assert.equal(
    (
      await repository.claimDueOutboxCommands({
        nowMs: 150,
        leaseToken: "lease-other",
        leaseExpiresAtMs: 250,
        limit: 10,
      })
    ).length,
    0,
  );

  const reclaimed = await repository.claimDueOutboxCommands({
    nowMs: 200,
    leaseToken: "lease-new",
    leaseExpiresAtMs: 300,
    limit: 10,
  });
  assert.equal(reclaimed.length, 1);
  assert.equal(reclaimed[0].attemptCount, 2);
  assert.equal(
    await repository.rescheduleClaimedOutboxCommand({
      commandId: "command-lease",
      leaseToken: "lease-old",
      errorCode: "network",
      nextAttemptAtMs: 500,
    }),
    false,
  );
  assert.equal(
    await repository.failClaimedOutboxCommand({
      commandId: "command-lease",
      leaseToken: "lease-old",
      errorCode: "validation",
    }),
    false,
  );
  assert.equal(
    await repository.rescheduleClaimedOutboxCommand({
      commandId: "command-lease",
      leaseToken: "lease-new",
      errorCode: "server_unavailable",
      nextAttemptAtMs: 500,
    }),
    true,
  );
  assert.equal(
    (
      await repository.claimDueOutboxCommands({
        nowMs: 499,
        leaseToken: "lease-too-soon",
        leaseExpiresAtMs: 600,
        limit: 10,
      })
    ).length,
    0,
  );
  const afterBackoff = await repository.claimDueOutboxCommands({
    nowMs: 500,
    leaseToken: "lease-after-backoff",
    leaseExpiresAtMs: 600,
    limit: 10,
  });
  assert.equal(afterBackoff[0].attemptCount, 3);
  assert.equal(
    await repository.releaseOutboxClaims({
      leaseToken: "lease-after-backoff",
      nextAttemptAtMs: 700,
    }),
    1,
  );
  assert.equal(
    (
      await repository.claimDueOutboxCommands({
        nowMs: 699,
        leaseToken: "lease-before-release-due",
        leaseExpiresAtMs: 800,
        limit: 10,
      })
    ).length,
    0,
  );
  database.close();
}

async function exerciseEventApplyAndReconciliation() {
  const { adapter, database } = await openV2Database();
  await runMigrations(adapter, accountMigrations);
  const repository = createConnectedChatRepository(
    adapter,
    PRINCIPAL,
    () => {},
  );

  await repository.enqueuePendingMessage({
    body: "canonical body",
    chatroomId: ROOM_ID,
    clientMsgId: canonicalMessage().clientMsgId,
    commandId: "command-canonical",
    localCreatedAtMs: 100,
    localId: "canonical-pending-local",
  });
  await repository.mergeCanonicalMessage(canonicalMessage());
  assert.equal(await repository.getEventCheckpoint(ROOM_ID), null);
  assert.equal(
    (await repository.getOutboxCommand(canonicalMessage().clientMsgId)).state,
    "acked",
  );

  const realtime = await repository.applyRealtimeMessageCreated({
    eventId: "event-known",
    message: canonicalMessage({
      clientMsgId: "client-known",
      localId: "known-local",
      senderId: "sender-known",
      serverMessageId: "server-known",
    }),
  });
  assert.equal(realtime.status, "applied");
  assert.equal(await repository.getEventCheckpoint(ROOM_ID), null);

  const orderedDuplicate = await repository.applyOrderedMessageCreated({
    chatroomId: ROOM_ID,
    eventId: "event-known",
    expectedCursor: null,
    cursor: "z-opaque",
    message: canonicalMessage({
      clientMsgId: "client-known",
      localId: "ignored-duplicate-local",
      senderId: "sender-known",
      serverMessageId: "server-known",
    }),
  });
  assert.equal(orderedDuplicate.status, "duplicate");
  assert.equal(await repository.getEventCheckpoint(ROOM_ID), "z-opaque");
  assert.equal(
    database
      .query(
        "SELECT count(*) AS count FROM connected_chat_messages WHERE server_message_id = 'server-known'",
      )
      .get().count,
    1,
  );

  const lexicallySmaller = await repository.applyOrderedMessageCreated({
    chatroomId: ROOM_ID,
    eventId: "event-smaller-cursor",
    expectedCursor: "z-opaque",
    cursor: "a-opaque",
    message: canonicalMessage({
      clientMsgId: "client-smaller",
      localId: "smaller-local",
      senderId: "sender-smaller",
      serverMessageId: "server-smaller",
    }),
  });
  assert.equal(lexicallySmaller.status, "applied");
  assert.equal(await repository.getEventCheckpoint(ROOM_ID), "a-opaque");

  const mismatch = await repository.applyOrderedMessageCreated({
    chatroomId: ROOM_ID,
    eventId: "event-cas-mismatch",
    expectedCursor: "wrong-cursor",
    cursor: "must-not-commit",
    message: canonicalMessage({
      clientMsgId: "client-cas-mismatch",
      localId: "cas-mismatch-local",
      senderId: "sender-cas-mismatch",
      serverMessageId: "server-cas-mismatch",
    }),
  });
  assert.equal(mismatch.status, "checkpoint_mismatch");
  assert.equal(mismatch.actualCheckpoint, "a-opaque");
  assert.equal(await repository.getEventCheckpoint(ROOM_ID), "a-opaque");
  assert.equal(
    database
      .query(
        "SELECT count(*) AS count FROM connected_chat_messages WHERE server_message_id = 'server-cas-mismatch'",
      )
      .get().count,
    0,
  );

  const noProgress = await repository.applyOrderedUnsupportedEvent({
    chatroomId: ROOM_ID,
    eventId: "event-no-progress",
    expectedCursor: "a-opaque",
    cursor: "a-opaque",
    reconcileScope: "chat_history",
  });
  assert.equal(noProgress.status, "no_progress");
  assert.equal(await repository.getEventCheckpoint(ROOM_ID), "a-opaque");
  assert.deepEqual(await repository.listDirtyReconciliationScopes(ROOM_ID), []);

  await assert.rejects(
    repository.applyOrderedMessageCreated({
      chatroomId: ROOM_ID,
      eventId: "event-room-mismatch",
      expectedCursor: "a-opaque",
      cursor: "room-mismatch-cursor",
      message: canonicalMessage({ chatroomId: OTHER_ROOM_ID }),
    }),
    /chatroom|scope/i,
  );
  assert.equal(await repository.getEventCheckpoint(ROOM_ID), "a-opaque");

  await assert.rejects(
    repository.applyRealtimeMessageCreated({
      eventId: "event-known",
      message: canonicalMessage({
        chatroomId: OTHER_ROOM_ID,
        localId: "cross-room-local",
        serverMessageId: "cross-room-server",
      }),
    }),
    /event.*chatroom|identity|scope/i,
  );

  const unsupportedOne = await repository.applyOrderedUnsupportedEvent({
    chatroomId: ROOM_ID,
    eventId: "event-unsupported-one",
    expectedCursor: "a-opaque",
    cursor: "cursor-unsupported-one",
    reconcileScope: "chat_history",
  });
  assert.equal(unsupportedOne.status, "applied");
  assert.deepEqual(await repository.listDirtyReconciliationScopes(ROOM_ID), [
    { markerEventId: "event-unsupported-one", scope: "chat_history" },
  ]);

  const unsupportedTwo = await repository.applyOrderedUnsupportedEvent({
    chatroomId: ROOM_ID,
    eventId: "event-unsupported-two",
    expectedCursor: "cursor-unsupported-one",
    cursor: "cursor-unsupported-two",
    reconcileScope: "chat_history",
  });
  assert.equal(unsupportedTwo.status, "applied");
  await repository.reconcileChatHistory({
    chatroomId: ROOM_ID,
    expectedMarkerEventId: "event-unsupported-one",
    messages: [],
  });
  assert.deepEqual(await repository.listDirtyReconciliationScopes(ROOM_ID), [
    { markerEventId: "event-unsupported-two", scope: "chat_history" },
  ]);
  await repository.reconcileChatHistory({
    chatroomId: ROOM_ID,
    expectedMarkerEventId: "event-unsupported-two",
    messages: [],
  });
  assert.deepEqual(await repository.listDirtyReconciliationScopes(ROOM_ID), []);

  database.exec(`CREATE TEMP TRIGGER fail_m9_message
    BEFORE INSERT ON connected_chat_messages
    WHEN NEW.server_message_id = 'server-rollback'
    BEGIN SELECT RAISE(ABORT, 'synthetic event merge failure'); END;`);
  await assert.rejects(
    repository.applyOrderedMessageCreated({
      chatroomId: ROOM_ID,
      eventId: "event-rollback",
      expectedCursor: "cursor-unsupported-two",
      cursor: "cursor-must-roll-back",
      message: canonicalMessage({
        clientMsgId: "client-rollback",
        localId: "rollback-local",
        senderId: "sender-rollback",
        serverMessageId: "server-rollback",
      }),
    }),
    /synthetic event merge failure/i,
  );
  assert.equal(
    await repository.getEventCheckpoint(ROOM_ID),
    "cursor-unsupported-two",
  );
  assert.equal(
    database
      .query(
        "SELECT count(*) AS count FROM connected_chat_applied_events WHERE event_id = 'event-rollback'",
      )
      .get().count,
    0,
  );
  database.close();
}

await migrateWithoutLosingV2Rows();
await exerciseOutboxLeaseCas();
await exerciseEventApplyAndReconciliation();
process.stdout.write("m9-account-sync-sqlite: PASS\n");
