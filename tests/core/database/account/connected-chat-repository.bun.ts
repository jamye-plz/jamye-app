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
  epoch: 7,
  origin: "https://api.jamye.example",
  userId: "aaaaaaaa-1111-4111-8111-111111111111",
});
const ROOM_ID = "bbbbbbbb-2222-4222-8222-222222222222";
const GROUP_ID = "cccccccc-3333-4333-8333-333333333333";

async function main(): Promise<void> {
  const database = new Database(":memory:");
  const adapter = createAdapter(database);
  database.exec(`
    PRAGMA user_version = 1;
    CREATE TABLE scope_metadata (
      singleton INTEGER PRIMARY KEY NOT NULL CHECK (singleton = 1),
      origin TEXT NOT NULL CHECK (length(origin) > 0),
      user_id TEXT NOT NULL CHECK (length(user_id) > 0),
      schema_version INTEGER NOT NULL CHECK (schema_version >= 1)
    );
    INSERT INTO scope_metadata VALUES (1, '${PRINCIPAL.origin}', '${PRINCIPAL.userId}', 1);
  `);

  await runMigrations(adapter, accountMigrations);
  assert.equal(database.query("PRAGMA user_version").get().user_version, 4);
  assert.deepEqual(database.query("SELECT * FROM scope_metadata").get(), {
    singleton: 1,
    origin: PRINCIPAL.origin,
    user_id: PRINCIPAL.userId,
    schema_version: 4,
  });

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
      createdAtRaw: "2026-09-10T00:00:00.000000001Z",
    },
  ]);

  const pending = await repository.enqueuePendingMessage({
    body: "  안녕\n",
    chatroomId: ROOM_ID,
    clientMsgId: "dddddddd-4444-4444-8444-444444444444",
    commandId: "eeeeeeee-5555-4555-8555-555555555555",
    localCreatedAtMs: 1_757_462_401_123,
    localId: "local-one",
  });
  assert.equal(pending.message.localId, "local-one");
  assert.equal(pending.command.body, "  안녕\n");

  database.exec(`CREATE TEMP TRIGGER fail_test_outbox
    BEFORE INSERT ON connected_chat_outbox_commands
    WHEN NEW.client_msg_id = '44444444-cccc-4ccc-8ccc-cccccccccccc'
    BEGIN SELECT RAISE(ABORT, 'synthetic outbox failure'); END;`);
  await assert.rejects(
    repository.enqueuePendingMessage({
      body: "atomic",
      chatroomId: ROOM_ID,
      clientMsgId: "44444444-cccc-4ccc-8ccc-cccccccccccc",
      commandId: "55555555-dddd-4ddd-8ddd-dddddddddddd",
      localCreatedAtMs: 2,
      localId: "rolled-back-message",
    }),
    /synthetic outbox failure/i,
  );
  assert.equal(
    database
      .query(
        "SELECT count(*) AS count FROM connected_chat_messages WHERE local_id = 'rolled-back-message'",
      )
      .get().count,
    0,
  );
  database.exec("DROP TRIGGER fail_test_outbox");

  await repository.markSendFailed({
    clientMsgId: pending.command.clientMsgId,
    errorCode: "network",
  });
  await assert.rejects(
    repository.retryFailedMessage({
      body: "안녕\n",
      chatroomId: ROOM_ID,
      clientMsgId: pending.command.clientMsgId,
    }),
    /exact|immutable|match/i,
  );
  const retried = await repository.retryFailedMessage({
    body: "  안녕\n",
    chatroomId: ROOM_ID,
    clientMsgId: pending.command.clientMsgId,
  });
  assert.equal(retried.message.localId, "local-one");
  assert.equal(retried.command.commandId, pending.command.commandId);

  await repository.mergeHistoryMessages([
    {
      body: "  안녕\n",
      chatroomId: ROOM_ID,
      clientMsgId: pending.command.clientMsgId,
      createdAtRaw: "2026-09-10T00:00:00.123456789Z",
      kind: "user",
      localId: "history-proposed-id",
      media: [],
      senderAvatarUrl: "https://cdn.example/avatar.png",
      senderId: PRINCIPAL.userId,
      senderNickname: "포비",
      serverMessageId: "ffffffff-6666-4666-8666-666666666666",
    },
  ]);
  const afterHistory = await repository.mergeCanonicalMessage({
    body: "  안녕\n",
    chatroomId: ROOM_ID,
    clientMsgId: pending.command.clientMsgId,
    createdAtRaw: "2026-09-10T00:00:00.123456789Z",
    kind: "user",
    localId: "response-proposed-id",
    media: [],
    senderId: PRINCIPAL.userId,
    serverMessageId: "ffffffff-6666-4666-8666-666666666666",
  });
  assert.equal(afterHistory.localId, "local-one");
  assert.equal(afterHistory.senderNickname, "포비");
  assert.equal(afterHistory.senderAvatarUrl, "https://cdn.example/avatar.png");
  assert.equal(
    (await repository.getOutboxCommand(pending.command.clientMsgId))?.state,
    "acked",
  );
  // A cancellation racing with a committed canonical response must not undo it.
  await repository.markSendFailed({
    clientMsgId: pending.command.clientMsgId,
    errorCode: "network",
  });
  assert.equal(
    (await repository.getOutboxCommand(pending.command.clientMsgId))?.state,
    "acked",
  );
  assert.equal(
    (
      await repository.listMessagesWindow({ chatroomId: ROOM_ID, limit: 10 })
    ).items.find((row) => row.localId === "local-one")?.status,
    "sent",
  );

  const responseFirst = await repository.mergeCanonicalMessage({
    body: "response first",
    chatroomId: ROOM_ID,
    clientMsgId: "66666666-eeee-4eee-8eee-eeeeeeeeeeee",
    createdAtRaw: "2026-09-10T00:00:00.123456788Z",
    kind: "user",
    localId: "response-first-local",
    media: [],
    senderId: "77777777-ffff-4fff-8fff-ffffffffffff",
    serverMessageId: "88888888-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
  });
  await repository.mergeHistoryMessages([
    {
      body: "response first",
      chatroomId: ROOM_ID,
      clientMsgId: "66666666-eeee-4eee-8eee-eeeeeeeeeeee",
      createdAtRaw: "2026-09-10T00:00:00.123456788Z",
      kind: "user",
      localId: "history-should-not-replace-local",
      media: [],
      senderAvatarUrl: null,
      senderId: "77777777-ffff-4fff-8fff-ffffffffffff",
      senderNickname: "response-first-sender",
      serverMessageId: "88888888-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
    },
  ]);
  assert.equal(responseFirst.localId, "response-first-local");

  await repository.mergeHistoryMessages([
    {
      body: "  안녕\n",
      chatroomId: ROOM_ID,
      clientMsgId: pending.command.clientMsgId,
      createdAtRaw: "2026-09-10T00:00:00.123456789Z",
      kind: "user",
      localId: "another-proposed-id",
      media: [],
      senderAvatarUrl: null,
      senderId: PRINCIPAL.userId,
      senderNickname: null,
      serverMessageId: "ffffffff-6666-4666-8666-666666666666",
    },
    {
      body: null,
      chatroomId: ROOM_ID,
      clientMsgId: null,
      createdAtRaw: "2026-09-10T09:00:00.123456790+09:00",
      kind: "system",
      localId: "tombstone",
      media: [],
      senderAvatarUrl: null,
      senderId: null,
      senderNickname: null,
      serverMessageId: "00000000-7777-4777-8777-777777777777",
    },
  ]);

  const page = await repository.listMessagesWindow({
    before: null,
    chatroomId: ROOM_ID,
    limit: 20,
  });
  assert.equal(page.items.length, 3);
  assert.deepEqual(
    page.items.map((item) => item.serverMessageId),
    [
      "88888888-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      "ffffffff-6666-4666-8666-666666666666",
      "00000000-7777-4777-8777-777777777777",
    ],
  );
  assert.equal(page.items[0]?.localId, "response-first-local");
  assert.equal(page.items[0]?.senderNickname, "response-first-sender");
  assert.equal(page.items[1]?.localId, "local-one");
  assert.equal(page.items[1]?.senderNickname, null);
  assert.equal(page.items[1]?.createdAtRaw, "2026-09-10T00:00:00.123456789Z");
  assert.equal(page.items[2]?.body, null);
  assert.deepEqual(page.items[2]?.media, []);
  assert.equal(
    page.items[2]?.createdAtRaw,
    "2026-09-10T09:00:00.123456790+09:00",
  );

  const sameClientOtherSender = "dddddddd-4444-4444-8444-444444444444";
  await repository.mergeHistoryMessages([
    {
      body: "other sender",
      chatroomId: ROOM_ID,
      clientMsgId: sameClientOtherSender,
      createdAtRaw: "2026-09-10T00:00:01Z",
      kind: "user",
      localId: "other-sender-row",
      media: [],
      senderAvatarUrl: null,
      senderId: "99999999-8888-4888-8888-888888888888",
      senderNickname: null,
      serverMessageId: "11111111-9999-4999-8999-999999999999",
    },
  ]);
  assert.equal(
    database
      .query("SELECT count(*) AS count FROM connected_chat_messages")
      .get().count,
    4,
  );

  active = false;
  await assert.rejects(
    repository.enqueuePendingMessage({
      body: "late",
      chatroomId: ROOM_ID,
      clientMsgId: "22222222-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      commandId: "33333333-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
      localCreatedAtMs: 1,
      localId: "late",
    }),
    /closed|stale/i,
  );

  database.close();
  process.stdout.write("connected-chat-sqlite: PASS\n");
}

await main();
