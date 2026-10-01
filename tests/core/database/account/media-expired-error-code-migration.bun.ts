// This file runs under Bun as a disposable real-SQLite migration scenario
// (connected-chat-deletions-migration.bun.ts's established pattern -- a
// fake/recording SQLite adapter cannot exercise SQLite's real ALTER TABLE
// RENAME TO + CHECK-constraint rebuild behavior migration 007 depends on).
// @ts-nocheck
import assert from "node:assert/strict";
import { rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

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
        throw new Error("synthetic v7 migration failure");
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
const QUEUED_LOCAL_ID = "local-queued";
const QUEUED_COMMAND_ID = "10000000-0000-4000-8000-000000000001";
const FAILED_LOCAL_ID = "local-failed";
const FAILED_COMMAND_ID = "10000000-0000-4000-8000-000000000002";

function insertMessage(database: Database, localId: string, status: string) {
  database
    .query(
      `INSERT INTO connected_chat_messages (
        local_id, server_message_id, chatroom_id, client_msg_id, sender_id,
        sender_nickname, sender_avatar_url, body, kind, media_json,
        pending_media_json, created_at_raw, local_created_at_ms,
        sort_seconds, sort_nanos, sort_tiebreaker, status
      ) VALUES (?, NULL, ?, ?, ?, NULL, NULL, '안녕', 'user', '[]', '[]',
        NULL, 1788998400000, 1788998400, 0, ?, ?)`,
    )
    .run(localId, ROOM_ID, localId, PRINCIPAL.userId, localId, status);
}

async function openPopulatedV6Database() {
  const database = new Database(":memory:");
  const adapter = createAdapter(database);
  await runMigrations(adapter, accountMigrations.slice(0, 6));
  database
    .query(
      `INSERT INTO scope_metadata (singleton, origin, user_id, schema_version)
       VALUES (1, ?, ?, 6)`,
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
  // One never-failed queued command (error_code NULL) and one legacy failed
  // command using a pre-existing error_code (validation) -- both must survive
  // the rebuild byte-identical (CHAT-AC6).
  insertMessage(database, QUEUED_LOCAL_ID, "pending");
  database
    .query(
      `INSERT INTO connected_chat_outbox_commands (
        command_id, local_id, chatroom_id, client_msg_id, sender_id, body,
        media_upload_ids_json, state, error_code, created_at_ms,
        attempt_count, next_attempt_at_ms, lease_token, lease_expires_at_ms
      ) VALUES (?, ?, ?, ?, ?, '안녕', '[]', 'queued', NULL, 1788998400000,
        0, 0, NULL, NULL)`,
    )
    .run(
      QUEUED_COMMAND_ID,
      QUEUED_LOCAL_ID,
      ROOM_ID,
      QUEUED_LOCAL_ID,
      PRINCIPAL.userId,
    );
  insertMessage(database, FAILED_LOCAL_ID, "failed");
  database
    .query(
      `INSERT INTO connected_chat_outbox_commands (
        command_id, local_id, chatroom_id, client_msg_id, sender_id, body,
        media_upload_ids_json, state, error_code, created_at_ms,
        attempt_count, next_attempt_at_ms, lease_token, lease_expires_at_ms
      ) VALUES (?, ?, ?, ?, ?, '안녕', '[]', 'failed', 'validation',
        1788998400000, 2, 0, NULL, NULL)`,
    )
    .run(
      FAILED_COMMAND_ID,
      FAILED_LOCAL_ID,
      ROOM_ID,
      FAILED_LOCAL_ID,
      PRINCIPAL.userId,
    );
  return { adapter, database };
}

async function verifySuccessfulUpgrade() {
  const { adapter, database } = await openPopulatedV6Database();
  await runMigrations(adapter, accountMigrations);

  assert.equal(database.query("PRAGMA user_version").get().user_version, 7);
  assert.equal(
    database.query("SELECT schema_version FROM scope_metadata").get()
      .schema_version,
    7,
  );

  // Both pre-existing rows (including the legacy error_code) come through
  // byte-identical -- the migration only widens the CHECK, plan
  // api_contracts.E2_media_expired_failure.sqlite_migration.
  assert.deepEqual(
    database
      .query(
        `SELECT command_id, state, error_code, attempt_count
         FROM connected_chat_outbox_commands ORDER BY command_id`,
      )
      .all(),
    [
      {
        command_id: QUEUED_COMMAND_ID,
        state: "queued",
        error_code: null,
        attempt_count: 0,
      },
      {
        command_id: FAILED_COMMAND_ID,
        state: "failed",
        error_code: "validation",
        attempt_count: 2,
      },
    ],
  );

  assert.equal(
    database
      .query(
        `SELECT count(*) AS count FROM sqlite_master
         WHERE type = 'table' AND name = 'connected_chat_outbox_commands_v6'`,
      )
      .get().count,
    0,
  );
  assert.deepEqual(database.query("PRAGMA foreign_key_check").all(), []);

  // The widened CHECK now accepts 'media_expired' on both insert and update,
  // and still rejects an unrecognized code.
  database
    .query(
      `UPDATE connected_chat_outbox_commands SET state = 'failed', error_code = 'media_expired'
       WHERE command_id = ?`,
    )
    .run(QUEUED_COMMAND_ID);
  assert.equal(
    database
      .query(
        "SELECT error_code FROM connected_chat_outbox_commands WHERE command_id = ?",
      )
      .get(QUEUED_COMMAND_ID).error_code,
    "media_expired",
  );
  assert.throws(
    () =>
      database
        .query(
          `UPDATE connected_chat_outbox_commands SET error_code = 'not_a_real_code'
           WHERE command_id = ?`,
        )
        .run(FAILED_COMMAND_ID),
    /CHECK constraint failed/i,
  );

  database.close();
}

async function verifyRollback() {
  const { database } = await openPopulatedV6Database();
  const failingAdapter = createAdapter(database, (statement) =>
    /DROP TABLE connected_chat_outbox_commands_v6/i.test(statement),
  );
  await assert.rejects(
    runMigrations(failingAdapter, accountMigrations),
    /synthetic v7 migration failure/i,
  );

  assert.equal(database.query("PRAGMA user_version").get().user_version, 6);
  assert.equal(
    database.query("SELECT schema_version FROM scope_metadata").get()
      .schema_version,
    6,
  );
  assert.deepEqual(
    database
      .query(
        `SELECT command_id, state, error_code
         FROM connected_chat_outbox_commands ORDER BY command_id`,
      )
      .all(),
    [
      { command_id: QUEUED_COMMAND_ID, state: "queued", error_code: null },
      {
        command_id: FAILED_COMMAND_ID,
        state: "failed",
        error_code: "validation",
      },
    ],
  );
  assert.deepEqual(database.query("PRAGMA foreign_key_check").all(), []);
  database.close();
}

async function verifyFreshInstallReachesV7(): Promise<void> {
  const database = new Database(":memory:");
  const adapter = createAdapter(database);
  await runMigrations(adapter, accountMigrations);
  assert.equal(database.query("PRAGMA user_version").get().user_version, 7);
  assert.equal(
    database
      .query(
        `SELECT sql FROM sqlite_master
         WHERE type = 'table' AND name = 'connected_chat_outbox_commands'`,
      )
      .get()
      .sql.includes("media_expired"),
    true,
  );
  database.close();
}

// The device model: like expo-sqlite, every exclusive transaction runs on a
// new connection, where SQLite's foreign_keys pragma is OFF by default -- the
// connection runMigrations turns it ON for is never the one that writes.
function createDeviceAdapter(path: string) {
  const main = new Database(path);
  function bind(database: Database) {
    return {
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
    };
  }
  const adapter = {
    ...bind(main),
    async withExclusiveTransactionAsync<Result>(
      operation: (transaction: ReturnType<typeof bind>) => Promise<Result>,
    ): Promise<Result> {
      const connection = new Database(path);
      try {
        connection.exec("BEGIN");
        try {
          const result = await operation(bind(connection));
          connection.exec("COMMIT");
          return result;
        } catch (error) {
          connection.exec("ROLLBACK");
          throw error;
        }
      } finally {
        connection.close();
      }
    },
  };
  return { adapter, main };
}

// M17 device round: v6 databases on devices hold rows whose parent the app
// already deleted (a pruned chatroom, a discarded failed message) because
// their ON DELETE CASCADE never fired. v7 must still open, keep every live
// row, and leave no foreign-key violation behind.
async function verifyDeviceOrphansAreRemoved(): Promise<void> {
  const path = join(tmpdir(), `jamye-v7-orphans-${process.pid}.db`);
  const { adapter, main } = createDeviceAdapter(path);
  const KEPT_ROOM = ROOM_ID;
  const PRUNED_ROOM = "dddddddd-4444-4444-8444-444444444444";
  try {
    await runMigrations(adapter, accountMigrations.slice(0, 6));
    await adapter.withExclusiveTransactionAsync(async (transaction) => {
      assert.equal(
        (await transaction.getFirstAsync("PRAGMA foreign_keys")).foreign_keys,
        0,
      );
      await transaction.runAsync(
        `INSERT INTO scope_metadata (singleton, origin, user_id, schema_version)
         VALUES (1, ?, ?, 6)`,
        PRINCIPAL.origin,
        PRINCIPAL.userId,
      );
      for (const room of [KEPT_ROOM, PRUNED_ROOM]) {
        await transaction.runAsync(
          `INSERT INTO connected_chatrooms (
            chatroom_id, group_id, kind, topic_id, created_at_raw,
            sort_seconds, sort_nanos
          ) VALUES (?, ?, 'main', NULL, '2026-09-10T00:00:00Z', 1788998400, 0)`,
          room,
          GROUP_ID,
        );
        await transaction.runAsync(
          `INSERT INTO connected_chat_event_checkpoints (chatroom_id, checkpoint)
           VALUES (?, '7')`,
          room,
        );
        await transaction.runAsync(
          `INSERT INTO connected_chat_applied_events (
            event_id, chatroom_id, event_kind, message_server_id
          ) VALUES (?, ?, 'unsupported', NULL)`,
          `event-${room}`,
          room,
        );
        await transaction.runAsync(
          `INSERT INTO connected_chat_reconciliation_scopes (
            chatroom_id, scope, marker_event_id
          ) VALUES (?, 'group_topics', ?)`,
          room,
          `event-${room}`,
        );
      }
      for (const [localId, room, state] of [
        ["kept-queued", KEPT_ROOM, "queued"],
        ["kept-discarded", KEPT_ROOM, "failed"],
        ["pruned-queued", PRUNED_ROOM, "queued"],
      ]) {
        await transaction.runAsync(
          `INSERT INTO connected_chat_messages (
            local_id, server_message_id, chatroom_id, client_msg_id, sender_id,
            sender_nickname, sender_avatar_url, body, kind, media_json,
            pending_media_json, created_at_raw, local_created_at_ms,
            sort_seconds, sort_nanos, sort_tiebreaker, status
          ) VALUES (?, NULL, ?, ?, ?, NULL, NULL, '안녕', 'user', '[]', '[]',
            NULL, 1788998400000, 1788998400, 0, ?, 'pending')`,
          localId,
          room,
          localId,
          PRINCIPAL.userId,
          localId,
        );
        await transaction.runAsync(
          `INSERT INTO connected_chat_outbox_commands (
            command_id, local_id, chatroom_id, client_msg_id, sender_id, body,
            media_upload_ids_json, state, error_code, created_at_ms,
            attempt_count, next_attempt_at_ms, lease_token, lease_expires_at_ms
          ) VALUES (?, ?, ?, ?, ?, '안녕', '[]', ?, NULL, 1788998400000,
            0, 0, NULL, NULL)`,
          `command-${localId}`,
          localId,
          room,
          localId,
          PRINCIPAL.userId,
          state,
        );
      }
      // The app's own deletes, on a connection where no cascade fires.
      await transaction.runAsync(
        "DELETE FROM connected_chatrooms WHERE chatroom_id = ?",
        PRUNED_ROOM,
      );
      await transaction.runAsync(
        "DELETE FROM connected_chat_messages WHERE local_id = 'kept-discarded'",
      );
      assert.notDeepEqual(
        await transaction.getAllAsync("PRAGMA foreign_key_check"),
        [],
      );
    });

    await runMigrations(adapter, accountMigrations);

    // A fresh connection, so no earlier read snapshot of `main` can hide the
    // migration's result.
    const check = new Database(path);
    assert.equal(check.query("PRAGMA user_version").get().user_version, 7);
    assert.deepEqual(check.query("PRAGMA foreign_key_check").all(), []);
    const idsOf = (sql: string) =>
      check
        .query(sql)
        .all()
        .map((row) => Object.values(row)[0]);
    assert.deepEqual(idsOf("SELECT local_id FROM connected_chat_messages"), [
      "kept-queued",
    ]);
    assert.deepEqual(
      idsOf("SELECT command_id FROM connected_chat_outbox_commands"),
      ["command-kept-queued"],
    );
    for (const table of [
      "connected_chat_applied_events",
      "connected_chat_event_checkpoints",
      "connected_chat_reconciliation_scopes",
    ]) {
      assert.deepEqual(idsOf(`SELECT chatroom_id FROM ${table}`), [KEPT_ROOM]);
    }
    check.close();
  } finally {
    main.close();
    for (const suffix of ["", "-wal", "-shm"])
      rmSync(`${path}${suffix}`, { force: true });
  }
}

await verifySuccessfulUpgrade();
await verifyRollback();
await verifyFreshInstallReachesV7();
await verifyDeviceOrphansAreRemoved();
process.stdout.write("media-expired-error-code-migration: PASS\n");
