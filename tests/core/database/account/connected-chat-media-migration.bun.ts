// This file runs under Bun as a disposable real-SQLite migration scenario.
// @ts-nocheck
import assert from "node:assert/strict";

import { Database } from "bun:sqlite";

import { accountMigrations } from "../../../../src/core/database/account/migrations";
import { runMigrations } from "../../../../src/core/database/migrate";

type Value = string | number | null;

function createAdapter(
  database: Database,
  failStatement?: (statement: string) => boolean,
) {
  const adapter = {
    async execAsync(statement: string): Promise<void> {
      if (failStatement?.(statement)) {
        throw new Error("synthetic v5 migration failure");
      }
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
  origin: "https://api.jamye.example",
  userId: "aaaaaaaa-1111-4111-8111-111111111111",
});
const ROOM_ID = "bbbbbbbb-2222-4222-8222-222222222222";
const GROUP_ID = "cccccccc-3333-4333-8333-333333333333";

async function openPopulatedV4Database() {
  const database = new Database(":memory:");
  const adapter = createAdapter(database);
  await runMigrations(adapter, accountMigrations.slice(0, 4));
  database
    .query(
      `INSERT INTO scope_metadata (singleton, origin, user_id, schema_version)
       VALUES (1, ?, ?, 4)`,
    )
    .run(PRINCIPAL.origin, PRINCIPAL.userId);
  database
    .query(
      `INSERT INTO connected_chatrooms (
        chatroom_id, group_id, kind, topic_id, created_at_raw,
        sort_seconds, sort_nanos
      ) VALUES (?, ?, 'main', NULL, '2026-09-10T00:00:00Z', 1788998400, 0)`,
    )
    .run(ROOM_ID, GROUP_ID);

  const intents = [
    {
      attemptCount: 1,
      errorCode: null,
      leaseExpiresAtMs: null,
      leaseToken: null,
      nextAttemptAtMs: 100,
      state: "queued",
      status: "pending",
      suffix: "queued",
    },
    {
      attemptCount: 2,
      errorCode: null,
      leaseExpiresAtMs: 400,
      leaseToken: "lease-in-flight",
      nextAttemptAtMs: 200,
      state: "in_flight",
      status: "pending",
      suffix: "in-flight",
    },
    {
      attemptCount: 3,
      errorCode: null,
      leaseExpiresAtMs: null,
      leaseToken: null,
      nextAttemptAtMs: 300,
      state: "acked",
      status: "sent",
      suffix: "acked",
    },
    {
      attemptCount: 4,
      errorCode: "network",
      leaseExpiresAtMs: null,
      leaseToken: null,
      nextAttemptAtMs: 500,
      state: "failed",
      status: "failed",
      suffix: "failed",
    },
  ];

  for (const [index, intent] of intents.entries()) {
    const localId = `local-${intent.suffix}`;
    const clientMsgId = `client-${intent.suffix}`;
    const createdAtMs = (index + 1) * 10;
    database
      .query(
        `INSERT INTO connected_chat_messages (
          local_id, server_message_id, chatroom_id, client_msg_id, sender_id,
          sender_nickname, sender_avatar_url, body, kind, media_json,
          created_at_raw, local_created_at_ms, sort_seconds, sort_nanos,
          sort_tiebreaker, status
        ) VALUES (?, NULL, ?, ?, ?, NULL, NULL, ?, 'user', '[]', NULL, ?, 0, 0, ?, ?)`,
      )
      .run(
        localId,
        ROOM_ID,
        clientMsgId,
        PRINCIPAL.userId,
        `body-${intent.suffix}`,
        createdAtMs,
        localId,
        intent.status,
      );
    database
      .query(
        `INSERT INTO connected_chat_outbox_commands (
          command_id, local_id, chatroom_id, client_msg_id, sender_id, body,
          state, error_code, created_at_ms, attempt_count, next_attempt_at_ms,
          lease_token, lease_expires_at_ms
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        `command-${intent.suffix}`,
        localId,
        ROOM_ID,
        clientMsgId,
        PRINCIPAL.userId,
        `body-${intent.suffix}`,
        intent.state,
        intent.errorCode,
        createdAtMs,
        intent.attemptCount,
        intent.nextAttemptAtMs,
        intent.leaseToken,
        intent.leaseExpiresAtMs,
      );
  }
  return { adapter, database };
}

async function verifySuccessfulUpgrade() {
  const { adapter, database } = await openPopulatedV4Database();
  await runMigrations(adapter, accountMigrations);

  assert.equal(database.query("PRAGMA user_version").get().user_version, 5);
  assert.equal(
    database.query("SELECT schema_version FROM scope_metadata").get()
      .schema_version,
    5,
  );
  assert.deepEqual(
    database
      .query(
        `SELECT command_id, local_id, chatroom_id, client_msg_id, sender_id,
          body, media_upload_ids_json, state, error_code, created_at_ms,
          attempt_count, next_attempt_at_ms, lease_token, lease_expires_at_ms
         FROM connected_chat_outbox_commands ORDER BY created_at_ms`,
      )
      .all(),
    [
      {
        attempt_count: 1,
        body: "body-queued",
        chatroom_id: ROOM_ID,
        client_msg_id: "client-queued",
        command_id: "command-queued",
        created_at_ms: 10,
        error_code: null,
        lease_expires_at_ms: null,
        lease_token: null,
        local_id: "local-queued",
        media_upload_ids_json: "[]",
        next_attempt_at_ms: 100,
        sender_id: PRINCIPAL.userId,
        state: "queued",
      },
      {
        attempt_count: 2,
        body: "body-in-flight",
        chatroom_id: ROOM_ID,
        client_msg_id: "client-in-flight",
        command_id: "command-in-flight",
        created_at_ms: 20,
        error_code: null,
        lease_expires_at_ms: 400,
        lease_token: "lease-in-flight",
        local_id: "local-in-flight",
        media_upload_ids_json: "[]",
        next_attempt_at_ms: 200,
        sender_id: PRINCIPAL.userId,
        state: "in_flight",
      },
      {
        attempt_count: 3,
        body: "body-acked",
        chatroom_id: ROOM_ID,
        client_msg_id: "client-acked",
        command_id: "command-acked",
        created_at_ms: 30,
        error_code: null,
        lease_expires_at_ms: null,
        lease_token: null,
        local_id: "local-acked",
        media_upload_ids_json: "[]",
        next_attempt_at_ms: 300,
        sender_id: PRINCIPAL.userId,
        state: "acked",
      },
      {
        attempt_count: 4,
        body: "body-failed",
        chatroom_id: ROOM_ID,
        client_msg_id: "client-failed",
        command_id: "command-failed",
        created_at_ms: 40,
        error_code: "network",
        lease_expires_at_ms: null,
        lease_token: null,
        local_id: "local-failed",
        media_upload_ids_json: "[]",
        next_attempt_at_ms: 500,
        sender_id: PRINCIPAL.userId,
        state: "failed",
      },
    ],
  );
  assert.deepEqual(
    database
      .query(
        `SELECT local_id, pending_media_json
         FROM connected_chat_messages ORDER BY local_created_at_ms`,
      )
      .all(),
    ["queued", "in-flight", "acked", "failed"].map((suffix) => ({
      local_id: `local-${suffix}`,
      pending_media_json: "[]",
    })),
  );

  const indexNames = database
    .query("PRAGMA index_list(connected_chat_outbox_commands)")
    .all()
    .map((row) => row.name);
  assert(indexNames.includes("connected_chat_outbox_queued_due_idx"));
  assert(indexNames.includes("connected_chat_outbox_in_flight_lease_idx"));
  assert.equal(
    database
      .query(
        `SELECT count(*) AS count FROM sqlite_master
         WHERE type = 'trigger' AND name = 'connected_chat_outbox_immutable_intent'`,
      )
      .get().count,
    1,
  );
  assert.equal(
    database
      .query(
        `SELECT count(*) AS count FROM sqlite_master
         WHERE type = 'table' AND name = 'connected_chat_outbox_commands_v4'`,
      )
      .get().count,
    0,
  );
  assert.equal(
    database
      .query("PRAGMA foreign_key_list(connected_chat_outbox_commands)")
      .all()
      .filter((row) => row.table === "connected_chat_messages").length,
    2,
  );
  assert.throws(
    () =>
      database
        .query(
          `UPDATE connected_chat_outbox_commands SET
             media_upload_ids_json = '["changed"]'
           WHERE command_id = 'command-queued'`,
        )
        .run(),
    /immutable/i,
  );
  assert.throws(
    () =>
      database
        .query(
          `UPDATE connected_chat_outbox_commands SET body = 'changed'
           WHERE command_id = 'command-queued'`,
        )
        .run(),
    /immutable/i,
  );
  assert.deepEqual(database.query("PRAGMA foreign_key_check").all(), []);
  database.close();
}

async function verifyRollback() {
  const { database } = await openPopulatedV4Database();
  const failingAdapter = createAdapter(database, (statement) =>
    /DROP TABLE connected_chat_outbox_commands_v4/i.test(statement),
  );
  await assert.rejects(
    runMigrations(failingAdapter, accountMigrations),
    /synthetic v5 migration failure/i,
  );

  assert.equal(database.query("PRAGMA user_version").get().user_version, 4);
  assert.equal(
    database.query("SELECT schema_version FROM scope_metadata").get()
      .schema_version,
    4,
  );
  assert.equal(
    database
      .query(`SELECT count(*) AS count FROM connected_chat_outbox_commands`)
      .get().count,
    4,
  );
  assert.equal(
    database
      .query("PRAGMA table_info(connected_chat_messages)")
      .all()
      .some((column) => column.name === "pending_media_json"),
    false,
  );
  assert.equal(
    database
      .query("PRAGMA table_info(connected_chat_outbox_commands)")
      .all()
      .some((column) => column.name === "media_upload_ids_json"),
    false,
  );
  assert.deepEqual(database.query("PRAGMA foreign_key_check").all(), []);
  database.close();
}

await verifySuccessfulUpgrade();
await verifyRollback();
process.stdout.write("connected-chat-media-migration: PASS\n");
