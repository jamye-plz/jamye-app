// This file runs under Bun as a disposable real-SQLite scenario (same
// pattern as connected-chat-media-migration.bun.ts / connected-chat-
// deletions-migration.bun.ts) -- AC5's "메시지 행, outbox 명령, 업로드
// 초안을 한 번에 정리" needs a real FOREIGN KEY ... ON DELETE CASCADE to
// verify, which a fake/recording SQLite adapter cannot exercise.
// @ts-nocheck
import assert from "node:assert/strict";

import { Database } from "bun:sqlite";

import { accountMigrations } from "../../../../src/core/database/account/migrations";
import { createConnectedChatRepository } from "../../../../src/core/database/account/connected-chat-repository";
import { runMigrations } from "../../../../src/core/database/migrate";

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
  origin: "https://api.jamye.example",
  userId: "aaaaaaaa-1111-4111-8111-111111111111",
});
const ROOM_ID = "bbbbbbbb-2222-4222-8222-222222222222";
const GROUP_ID = "cccccccc-3333-4333-8333-333333333333";

async function main(): Promise<void> {
  const database = new Database(":memory:");
  const adapter = createAdapter(database);
  await runMigrations(adapter, accountMigrations);
  database
    .query(
      `INSERT INTO scope_metadata (singleton, origin, user_id, schema_version)
       VALUES (1, ?, ?, 6)`,
    )
    .run(PRINCIPAL.origin, PRINCIPAL.userId);

  let active = true;
  const repository = createConnectedChatRepository(adapter, PRINCIPAL, () => {
    if (!active) throw new Error("Account database handle is closed or stale.");
  });
  await repository.upsertChatrooms([
    {
      chatroomId: ROOM_ID,
      groupId: GROUP_ID,
      kind: "main",
      topicId: null,
      createdAtRaw: "2026-09-10T00:00:00Z",
    },
  ]);

  // A failed message that carries an upload draft (pendingMedia / the
  // outbox command's media_upload_ids_json) -- the discard must clear all
  // three together, not just the message row.
  const pending = await repository.enqueuePendingMessage({
    body: "",
    chatroomId: ROOM_ID,
    clientMsgId: "discard-client",
    commandId: "discard-command",
    localCreatedAtMs: 1_000,
    localId: "discard-local",
    media: [
      {
        byteSize: 1_024,
        duration: null,
        filename: "draft.jpg",
        height: 10,
        mediaUploadId: "upload-1",
        posterMediaId: null,
        type: "image/jpeg",
        width: 10,
      },
    ],
  });
  assert.equal(pending.message.status, "pending");
  assert.equal(pending.message.pendingMedia?.length, 1);

  await repository.markSendFailed({
    clientMsgId: "discard-client",
    errorCode: "network",
  });
  const failedCommand = await repository.getOutboxCommand("discard-client");
  assert.equal(failedCommand?.state, "failed");

  await repository.discardFailedMessage({
    chatroomId: ROOM_ID,
    clientMsgId: "discard-client",
  });

  // The row (and with it the upload draft snapshot stored in its own
  // pending_media_json column) is gone.
  assert.equal(
    database
      .query(
        "SELECT count(*) AS count FROM connected_chat_messages WHERE local_id = 'discard-local'",
      )
      .get().count,
    0,
  );
  // FOREIGN KEY (local_id, chatroom_id) ... ON DELETE CASCADE removed the
  // outbox command (with its media_upload_ids_json upload-draft reference)
  // in the same statement -- no separate DELETE was needed.
  assert.equal(
    database
      .query(
        "SELECT count(*) AS count FROM connected_chat_outbox_commands WHERE command_id = 'discard-command'",
      )
      .get().count,
    0,
  );
  assert.equal(await repository.getOutboxCommand("discard-client"), null);

  // A repeat discard of the now-missing row is a safe no-op, not an error
  // (e.g. a slow double-tap on the confirm button).
  await repository.discardFailedMessage({
    chatroomId: ROOM_ID,
    clientMsgId: "discard-client",
  });

  // A row that exists but is no longer 'failed' (e.g. a concurrent retry
  // already moved it back to 'pending') must never be race-deleted.
  await repository.enqueuePendingMessage({
    body: "아직 전송 중",
    chatroomId: ROOM_ID,
    clientMsgId: "still-pending-client",
    commandId: "still-pending-command",
    localCreatedAtMs: 2_000,
    localId: "still-pending-local",
  });
  await repository.discardFailedMessage({
    chatroomId: ROOM_ID,
    clientMsgId: "still-pending-client",
  });
  assert.equal(
    database
      .query(
        "SELECT count(*) AS count FROM connected_chat_messages WHERE local_id = 'still-pending-local'",
      )
      .get().count,
    1,
  );

  // A failed row in a *different* chatroom must not be discarded by id alone.
  await repository.upsertChatrooms([
    {
      chatroomId: "dddddddd-4444-4444-8444-444444444444",
      groupId: GROUP_ID,
      kind: "main",
      topicId: null,
      createdAtRaw: "2026-09-10T00:00:00Z",
    },
  ]);
  await repository.enqueuePendingMessage({
    body: "다른 방",
    chatroomId: "dddddddd-4444-4444-8444-444444444444",
    clientMsgId: "other-room-client",
    commandId: "other-room-command",
    localCreatedAtMs: 3_000,
    localId: "other-room-local",
  });
  await repository.markSendFailed({
    clientMsgId: "other-room-client",
    errorCode: "network",
  });
  await repository.discardFailedMessage({
    chatroomId: ROOM_ID,
    clientMsgId: "other-room-client",
  });
  assert.equal(
    database
      .query(
        "SELECT count(*) AS count FROM connected_chat_messages WHERE local_id = 'other-room-local'",
      )
      .get().count,
    1,
  );

  assert.deepEqual(database.query("PRAGMA foreign_key_check").all(), []);
  database.close();
}

await main();
process.stdout.write("connected-chat-discard-message: PASS\n");
