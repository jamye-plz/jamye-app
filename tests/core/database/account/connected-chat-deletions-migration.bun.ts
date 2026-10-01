// This file runs under Bun as a disposable real-SQLite migration scenario
// (connected-chat-media-migration.bun.ts's established pattern -- a fake/
// recording SQLite adapter cannot exercise SQLite's real ALTER TABLE RENAME
// TO foreign-key-repoint behavior migration 006 depends on).
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
        throw new Error("synthetic v6 migration failure");
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
const MESSAGE_LOCAL_ID = "local-1";
const MESSAGE_SERVER_ID = "dddddddd-4444-4444-8444-444444444444";
const MESSAGE_CREATED_EVENT_ID = "eeeeeeee-5555-4555-8555-555555555555";
const UNSUPPORTED_EVENT_ID = "ffffffff-6666-4666-8666-666666666666";

async function openPopulatedV5Database() {
  const database = new Database(":memory:");
  const adapter = createAdapter(database);
  await runMigrations(adapter, accountMigrations.slice(0, 5));
  database
    .query(
      `INSERT INTO scope_metadata (singleton, origin, user_id, schema_version)
       VALUES (1, ?, ?, 5)`,
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
  database
    .query(
      `INSERT INTO connected_chat_messages (
        local_id, server_message_id, chatroom_id, client_msg_id, sender_id,
        sender_nickname, sender_avatar_url, body, kind, media_json,
        pending_media_json, created_at_raw, local_created_at_ms,
        sort_seconds, sort_nanos, sort_tiebreaker, status
      ) VALUES (?, ?, ?, NULL, ?, '닉네임', NULL, '안녕', 'user', '[]', '[]',
        '2026-09-10T00:00:00Z', 1788998400000, 1788998400, 0, ?, 'sent')`,
    )
    .run(
      MESSAGE_LOCAL_ID,
      MESSAGE_SERVER_ID,
      ROOM_ID,
      PRINCIPAL.userId,
      MESSAGE_LOCAL_ID,
    );
  // A message.created applied-events row and an unsupported dirty-marker row
  // whose connected_chat_reconciliation_scopes entry must survive the
  // applied_events rebuild (the migration's central risk).
  database
    .query(
      `INSERT INTO connected_chat_applied_events (
        event_id, chatroom_id, event_kind, message_server_id
      ) VALUES (?, ?, 'message.created', ?)`,
    )
    .run(MESSAGE_CREATED_EVENT_ID, ROOM_ID, MESSAGE_SERVER_ID);
  database
    .query(
      `INSERT INTO connected_chat_applied_events (
        event_id, chatroom_id, event_kind, message_server_id
      ) VALUES (?, ?, 'unsupported', NULL)`,
    )
    .run(UNSUPPORTED_EVENT_ID, ROOM_ID);
  database
    .query(
      `INSERT INTO connected_chat_reconciliation_scopes (
        chatroom_id, scope, marker_event_id
      ) VALUES (?, 'group_topics', ?)`,
    )
    .run(ROOM_ID, UNSUPPORTED_EVENT_ID);
  return { adapter, database };
}

async function verifySuccessfulUpgrade() {
  const { adapter, database } = await openPopulatedV5Database();
  await runMigrations(adapter, accountMigrations);

  // task-app-chat (E2/C2/U2): the full registry's latest version is now 7
  // (006 + 007) -- this "after all migrations" assertion tracks the
  // registry's current length, not migration 006 specifically.
  assert.equal(database.query("PRAGMA user_version").get().user_version, 7);
  assert.equal(
    database.query("SELECT schema_version FROM scope_metadata").get()
      .schema_version,
    7,
  );

  // The pre-existing message.created/unsupported applied-events rows and the
  // reconciliation_scopes marker that references the unsupported row must
  // come through byte-identical -- this is the migration's acceptance bar
  // (plan api_contracts.app_account_db_v6.applied_events_choice).
  assert.deepEqual(
    database
      .query(
        `SELECT event_id, chatroom_id, event_kind, message_server_id
         FROM connected_chat_applied_events ORDER BY event_id`,
      )
      .all(),
    [
      {
        chatroom_id: ROOM_ID,
        event_id: MESSAGE_CREATED_EVENT_ID,
        event_kind: "message.created",
        message_server_id: MESSAGE_SERVER_ID,
      },
      {
        chatroom_id: ROOM_ID,
        event_id: UNSUPPORTED_EVENT_ID,
        event_kind: "unsupported",
        message_server_id: null,
      },
    ],
  );
  assert.deepEqual(
    database
      .query(
        `SELECT chatroom_id, scope, marker_event_id
         FROM connected_chat_reconciliation_scopes`,
      )
      .all(),
    [
      {
        chatroom_id: ROOM_ID,
        marker_event_id: UNSUPPORTED_EVENT_ID,
        scope: "group_topics",
      },
    ],
  );

  // No _v5 rebuild leftovers, and every FK (including the rebuilt ones) is
  // internally consistent.
  for (const leftover of [
    "connected_chat_applied_events_v5",
    "connected_chat_reconciliation_scopes_v5",
  ]) {
    assert.equal(
      database
        .query(
          `SELECT count(*) AS count FROM sqlite_master
           WHERE type = 'table' AND name = ?`,
        )
        .get(leftover).count,
      0,
    );
  }
  assert.deepEqual(database.query("PRAGMA foreign_key_check").all(), []);

  // The widened CHECK now accepts message.deleted (with a message_server_id)
  // and topic.deleted (without one); the old two kinds still work too.
  database
    .query(
      `INSERT INTO connected_chat_applied_events (
        event_id, chatroom_id, event_kind, message_server_id
      ) VALUES ('10000000-0000-4000-8000-000000000001', ?, 'message.deleted', ?)`,
    )
    .run(ROOM_ID, MESSAGE_SERVER_ID);
  database
    .query(
      `INSERT INTO connected_chat_applied_events (
        event_id, chatroom_id, event_kind, message_server_id
      ) VALUES ('10000000-0000-4000-8000-000000000002', ?, 'topic.deleted', NULL)`,
    )
    .run(ROOM_ID);
  assert.throws(
    () =>
      database
        .query(
          `INSERT INTO connected_chat_applied_events (
            event_id, chatroom_id, event_kind, message_server_id
          ) VALUES ('10000000-0000-4000-8000-000000000003', ?, 'message.deleted', NULL)`,
        )
        .run(ROOM_ID),
    /CHECK constraint failed/i,
  );

  // deleted_at_ms defaults to NULL for the pre-existing row, and the new
  // column accepts a tombstone write.
  assert.equal(
    database
      .query(
        "SELECT deleted_at_ms FROM connected_chat_messages WHERE local_id = ?",
      )
      .get(MESSAGE_LOCAL_ID).deleted_at_ms,
    null,
  );
  database
    .query(
      "UPDATE connected_chat_messages SET deleted_at_ms = 1788999999000 WHERE local_id = ?",
    )
    .run(MESSAGE_LOCAL_ID);
  assert.equal(
    database
      .query(
        "SELECT deleted_at_ms FROM connected_chat_messages WHERE local_id = ?",
      )
      .get(MESSAGE_LOCAL_ID).deleted_at_ms,
    1788999999000,
  );

  // The monotonic guard: clearing deleted_at_ms once set must be rejected.
  assert.throws(
    () =>
      database
        .query(
          "UPDATE connected_chat_messages SET deleted_at_ms = NULL WHERE local_id = ?",
        )
        .run(MESSAGE_LOCAL_ID),
    /monotonic/i,
  );
  // A no-op re-set to the same (or a different) non-null value is not a
  // revive and must stay allowed -- the trigger only guards NOT NULL -> NULL.
  database
    .query(
      "UPDATE connected_chat_messages SET deleted_at_ms = 1789000000000 WHERE local_id = ?",
    )
    .run(MESSAGE_LOCAL_ID);
  assert.equal(
    database
      .query(
        "SELECT deleted_at_ms FROM connected_chat_messages WHERE local_id = ?",
      )
      .get(MESSAGE_LOCAL_ID).deleted_at_ms,
    1789000000000,
  );

  database.close();
}

async function verifyRollback() {
  const { database } = await openPopulatedV5Database();
  const failingAdapter = createAdapter(database, (statement) =>
    /DROP TABLE connected_chat_applied_events_v5/i.test(statement),
  );
  await assert.rejects(
    runMigrations(failingAdapter, accountMigrations),
    /synthetic v6 migration failure/i,
  );

  assert.equal(database.query("PRAGMA user_version").get().user_version, 5);
  assert.equal(
    database.query("SELECT schema_version FROM scope_metadata").get()
      .schema_version,
    5,
  );
  // The marker must still be there -- the whole rebuild rolled back as one
  // transaction, it was never silently dropped mid-migration.
  assert.deepEqual(
    database
      .query(
        `SELECT chatroom_id, scope, marker_event_id
         FROM connected_chat_reconciliation_scopes`,
      )
      .all(),
    [
      {
        chatroom_id: ROOM_ID,
        marker_event_id: UNSUPPORTED_EVENT_ID,
        scope: "group_topics",
      },
    ],
  );
  assert.equal(
    database
      .query(
        `SELECT count(*) AS count FROM sqlite_master
         WHERE type = 'table' AND name = 'connected_chat_messages_deletion_monotonic'`,
      )
      .get().count,
    0,
  );
  assert.deepEqual(database.query("PRAGMA foreign_key_check").all(), []);
  database.close();
}

async function verifyFreshInstallReachesV6(): Promise<void> {
  const database = new Database(":memory:");
  const adapter = createAdapter(database);
  await runMigrations(adapter, accountMigrations);
  // task-app-chat (E2/C2/U2): a fresh install now reaches 7 (006 + 007),
  // not 6 -- this function name predates 007 but still exercises "every
  // migration including 006 applies to a brand-new database", unchanged.
  assert.equal(database.query("PRAGMA user_version").get().user_version, 7);
  assert.deepEqual(
    database
      .query(
        `SELECT sql FROM sqlite_master
         WHERE type = 'table' AND name = 'connected_chat_messages'`,
      )
      .get()
      .sql.includes("deleted_at_ms"),
    true,
  );
  database.close();
}

await verifySuccessfulUpgrade();
await verifyRollback();
await verifyFreshInstallReachesV6();
process.stdout.write("connected-chat-deletions-migration: PASS\n");
