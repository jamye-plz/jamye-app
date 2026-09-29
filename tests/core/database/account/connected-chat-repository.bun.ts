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
  assert.equal(database.query("PRAGMA user_version").get().user_version, 6);
  assert.deepEqual(database.query("SELECT * FROM scope_metadata").get(), {
    singleton: 1,
    origin: PRINCIPAL.origin,
    user_id: PRINCIPAL.userId,
    schema_version: 6,
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

  const pendingMedia = [
    {
      byteSize: 100,
      duration: null,
      filename: "image.png",
      height: 20,
      mediaUploadId: "upload-image",
      posterMediaId: null,
      type: "image/png",
      width: 30,
    },
    {
      byteSize: 200,
      duration: 2.5,
      filename: "video.mp4",
      height: 40,
      mediaUploadId: "upload-video",
      posterMediaId: null,
      type: "video/mp4",
      width: 50,
    },
  ];
  const pendingAttachmentMessage = await repository.enqueuePendingMessage({
    body: "",
    chatroomId: ROOM_ID,
    clientMsgId: "client-media",
    commandId: "command-media",
    localCreatedAtMs: 1_757_462_402_000,
    localId: "local-media",
    media: pendingMedia,
  });
  assert.deepEqual(pendingAttachmentMessage.command.mediaUploadIds, [
    "upload-image",
    "upload-video",
  ]);
  assert.deepEqual(pendingAttachmentMessage.message.pendingMedia, pendingMedia);

  await repository.markSendFailed({
    clientMsgId: "client-media",
    errorCode: "network",
  });
  const retriedMedia = await repository.retryFailedMessage({
    body: "",
    chatroomId: ROOM_ID,
    clientMsgId: "client-media",
  });
  assert.deepEqual(retriedMedia.command.mediaUploadIds, [
    "upload-image",
    "upload-video",
  ]);
  assert.deepEqual(retriedMedia.message.pendingMedia, pendingMedia);

  const reopenedRepository = createConnectedChatRepository(
    adapter,
    PRINCIPAL,
    () => {},
  );
  assert.deepEqual(
    (await reopenedRepository.getOutboxCommand("client-media"))?.mediaUploadIds,
    ["upload-image", "upload-video"],
  );
  const acknowledgedMedia = await reopenedRepository.mergeCanonicalMessage({
    body: null,
    chatroomId: ROOM_ID,
    clientMsgId: "client-media",
    createdAtRaw: "2026-09-10T00:00:02Z",
    kind: "user",
    localId: "server-proposed-media-local",
    media: [
      {
        ...pendingMedia[0],
        id: "canonical-media-id",
        position: 0,
      },
    ],
    senderId: PRINCIPAL.userId,
    serverMessageId: "server-media-message",
  });
  assert.equal(acknowledgedMedia.pendingMedia, undefined);
  assert.equal(acknowledgedMedia.media[0]?.id, "canonical-media-id");
  assert.equal(acknowledgedMedia.media[0]?.mediaUploadId, "upload-image");
  assert.deepEqual(
    (await reopenedRepository.getOutboxCommand("client-media"))?.mediaUploadIds,
    ["upload-image", "upload-video"],
  );
  assert.equal(
    (await reopenedRepository.getOutboxCommand("client-media"))?.state,
    "acked",
  );

  // pruneChatroomsNotIn (M15 device round r2 follow-up, P2/root cause B):
  // converges a group's local chatroom rows onto the server-confirmed live
  // set, and ON DELETE CASCADE (migrations 002/006) must carry each pruned
  // room's messages, outbox commands and applied-event rows away with it --
  // this cascade is the entire local-cleanup mechanism P3 was descoped in
  // favor of (coordinator round 2 decision).
  function countWhere(table: string, column: string, value: string): number {
    return database
      .query(`SELECT count(*) AS count FROM ${table} WHERE ${column} = ?`)
      .get(value).count;
  }
  const OTHER_GROUP_ID = "12121212-1212-4212-8212-121212121212";
  const TOPIC_ROOM_ID = "13131313-1313-4313-8313-131313131313";
  const STALE_TOPIC_ROOM_ID = "14141414-1414-4414-8414-141414141414";
  const OTHER_GROUP_ROOM_ID = "15151515-1515-4515-8515-151515151515";
  await repository.upsertChatrooms([
    {
      chatroomId: TOPIC_ROOM_ID,
      createdAtRaw: "2026-09-10T00:00:00.000000003Z",
      groupId: GROUP_ID,
      kind: "topic",
      topicId: "16161616-1616-4616-8616-161616161616",
    },
    {
      chatroomId: STALE_TOPIC_ROOM_ID,
      createdAtRaw: "2026-09-10T00:00:00.000000004Z",
      groupId: GROUP_ID,
      kind: "topic",
      topicId: "17171717-1717-4717-8717-171717171717",
    },
    {
      chatroomId: OTHER_GROUP_ROOM_ID,
      createdAtRaw: "2026-09-10T00:00:00.000000005Z",
      groupId: OTHER_GROUP_ID,
      kind: "main",
      topicId: null,
    },
  ]);
  await repository.enqueuePendingMessage({
    body: "stale topic message",
    chatroomId: STALE_TOPIC_ROOM_ID,
    clientMsgId: "19191919-1919-4919-8919-191919191919",
    commandId: "20202020-2020-4020-8020-202020202020",
    localCreatedAtMs: 1_757_462_403_000,
    localId: "stale-topic-local",
  });
  await repository.applyOrderedUnsupportedEvent({
    chatroomId: STALE_TOPIC_ROOM_ID,
    cursor: "cursor-1",
    eventId: "21212121-2121-4121-8121-212121212121",
    expectedCursor: null,
    reconcileScope: "chat_history",
  });
  assert.equal(
    countWhere("connected_chat_messages", "chatroom_id", STALE_TOPIC_ROOM_ID),
    1,
  );
  assert.equal(
    countWhere(
      "connected_chat_outbox_commands",
      "chatroom_id",
      STALE_TOPIC_ROOM_ID,
    ),
    1,
  );
  assert.equal(
    countWhere(
      "connected_chat_applied_events",
      "chatroom_id",
      STALE_TOPIC_ROOM_ID,
    ),
    1,
  );

  await repository.pruneChatroomsNotIn({
    groupId: GROUP_ID,
    keepChatroomIds: [ROOM_ID, TOPIC_ROOM_ID],
  });
  assert.equal(
    countWhere("connected_chatrooms", "chatroom_id", STALE_TOPIC_ROOM_ID),
    0,
  );
  assert.equal(
    countWhere("connected_chat_messages", "chatroom_id", STALE_TOPIC_ROOM_ID),
    0,
  );
  assert.equal(
    countWhere(
      "connected_chat_outbox_commands",
      "chatroom_id",
      STALE_TOPIC_ROOM_ID,
    ),
    0,
  );
  assert.equal(
    countWhere(
      "connected_chat_applied_events",
      "chatroom_id",
      STALE_TOPIC_ROOM_ID,
    ),
    0,
  );
  assert.deepEqual(
    database
      .query(
        "SELECT chatroom_id FROM connected_chatrooms WHERE group_id = ? ORDER BY chatroom_id",
      )
      .all(GROUP_ID)
      .map((row) => row.chatroom_id),
    [ROOM_ID, TOPIC_ROOM_ID].sort(),
  );
  assert.equal(
    countWhere("connected_chatrooms", "chatroom_id", OTHER_GROUP_ROOM_ID),
    1,
  );

  // An empty keep list prunes every remaining local row for that group only.
  await repository.pruneChatroomsNotIn({
    groupId: GROUP_ID,
    keepChatroomIds: [],
  });
  assert.equal(countWhere("connected_chatrooms", "group_id", GROUP_ID), 0);
  assert.equal(
    countWhere("connected_chatrooms", "chatroom_id", OTHER_GROUP_ROOM_ID),
    1,
  );

  // Defect 10 (G1/E12): a "history" merge propagates the sender's current
  // display to every other local row for that sender_id -- including a
  // soft-deleted row in a *different* chatroom -- while freezing that
  // deleted row's body/media/deleted_at_ms (E2, migration 006's
  // connected_chat_messages_deletion_monotonic trigger).
  const DEPARTED_SENDER_ID = "23232323-2323-4323-8323-232323232323";
  const DEPARTED_ROOM_A_ID = "24242424-2424-4424-8424-242424242424";
  const DEPARTED_MSG_A_SERVER_ID = "25252525-2525-4525-8525-252525252525";
  const DEPARTED_MSG_B_SERVER_ID = "26262626-2626-4626-8626-262626262626";
  const DEPARTED_MSG_C_SERVER_ID = "27272727-2727-4727-8727-272727272727";
  const DEPARTED_MSG_D_SERVER_ID = "28282828-2828-4828-8828-282828282828";
  const DEPARTED_SYSTEM_SERVER_ID = "29292929-2929-4929-8929-292929292929";
  const ORIGINAL_NICK = "Sangmin Kim Google";
  const ORIGINAL_AVATAR = "https://cdn.example/sangmin.png";
  const DEPARTED_NICK = "탈퇴한 사용자";
  function findByLocalId(chatroomId: string, localId: string) {
    return repository
      .listMessagesWindow({ chatroomId, limit: 20 })
      .then((page) => page.items.find((row) => row.localId === localId));
  }

  await repository.upsertChatrooms([
    {
      chatroomId: DEPARTED_ROOM_A_ID,
      createdAtRaw: "2026-09-10T00:00:00.000000006Z",
      groupId: GROUP_ID,
      kind: "main",
      topicId: null,
    },
  ]);
  // Room A: the sender's message, alive with their original display, then
  // tombstoned (as if deleted before the account itself was deleted).
  await repository.mergeHistoryMessages([
    {
      body: "안녕히 계세요",
      chatroomId: DEPARTED_ROOM_A_ID,
      clientMsgId: null,
      createdAtRaw: "2026-09-10T00:10:00.000000000Z",
      kind: "user",
      localId: "departed-a-local",
      media: [],
      senderAvatarUrl: ORIGINAL_AVATAR,
      senderId: DEPARTED_SENDER_ID,
      senderNickname: ORIGINAL_NICK,
      serverMessageId: DEPARTED_MSG_A_SERVER_ID,
    },
  ]);
  await repository.markMessageDeleted({
    deletedAtMs: 1_757_462_500_000,
    serverMessageId: DEPARTED_MSG_A_SERVER_ID,
  });
  const beforePropagation = await findByLocalId(
    DEPARTED_ROOM_A_ID,
    "departed-a-local",
  );
  assert.equal(beforePropagation?.deletedAtMs, 1_757_462_500_000);
  assert.equal(beforePropagation?.senderNickname, ORIGINAL_NICK);
  assert.equal(beforePropagation?.senderAvatarUrl, ORIGINAL_AVATAR);
  assert.equal(beforePropagation?.body, null);

  // Room B (a different chatroom, a different group): a C2 page for the
  // same sender arrives already anonymized -- the account was deleted.
  await repository.mergeHistoryMessages([
    {
      body: "룸 B의 마지막 메시지",
      chatroomId: OTHER_GROUP_ROOM_ID,
      clientMsgId: null,
      createdAtRaw: "2026-09-10T00:11:00.000000000Z",
      kind: "user",
      localId: "departed-b-local",
      media: [],
      senderAvatarUrl: null,
      senderId: DEPARTED_SENDER_ID,
      senderNickname: DEPARTED_NICK,
      serverMessageId: DEPARTED_MSG_B_SERVER_ID,
    },
  ]);
  const afterPropagation = await findByLocalId(
    DEPARTED_ROOM_A_ID,
    "departed-a-local",
  );
  assert.equal(afterPropagation?.senderNickname, DEPARTED_NICK);
  assert.equal(afterPropagation?.senderAvatarUrl, null);
  // E2 unaffected by the propagation: content and the tombstone stay frozen.
  assert.equal(afterPropagation?.body, null);
  assert.deepEqual(afterPropagation?.media, []);
  assert.equal(afterPropagation?.deletedAtMs, 1_757_462_500_000);
  assert.equal(afterPropagation?.kind, "user");

  // Recovery direction (A2): a later history page shows the sender's
  // original display again (e.g. the account was restored) -- both the
  // deleted row (room A) and the earlier-anonymized live row (room B) must
  // revert.
  await repository.mergeHistoryMessages([
    {
      body: "복구 후 메시지",
      chatroomId: OTHER_GROUP_ROOM_ID,
      clientMsgId: null,
      createdAtRaw: "2026-09-10T00:12:00.000000000Z",
      kind: "user",
      localId: "departed-c-local",
      media: [],
      senderAvatarUrl: ORIGINAL_AVATAR,
      senderId: DEPARTED_SENDER_ID,
      senderNickname: ORIGINAL_NICK,
      serverMessageId: DEPARTED_MSG_C_SERVER_ID,
    },
  ]);
  const afterRecovery = await findByLocalId(
    DEPARTED_ROOM_A_ID,
    "departed-a-local",
  );
  assert.equal(afterRecovery?.senderNickname, ORIGINAL_NICK);
  assert.equal(afterRecovery?.senderAvatarUrl, ORIGINAL_AVATAR);
  assert.equal(afterRecovery?.deletedAtMs, 1_757_462_500_000);
  assert.equal(afterRecovery?.body, null);
  const roomBRevert = await findByLocalId(
    OTHER_GROUP_ROOM_ID,
    "departed-b-local",
  );
  assert.equal(roomBRevert?.senderNickname, ORIGINAL_NICK);
  assert.equal(roomBRevert?.senderAvatarUrl, ORIGINAL_AVATAR);

  // "canonical" (delta/WS) must never propagate -- a stale replayed event
  // must not regress the display history already brought current.
  await repository.mergeCanonicalMessage({
    body: "옛 이벤트 재생",
    chatroomId: OTHER_GROUP_ROOM_ID,
    clientMsgId: null,
    createdAtRaw: "2026-09-10T00:13:00.000000000Z",
    kind: "user",
    localId: "departed-canonical-local",
    media: [],
    senderAvatarUrl: "https://cdn.example/stale.png",
    senderId: DEPARTED_SENDER_ID,
    senderNickname: "Stale Replay Name",
    serverMessageId: DEPARTED_MSG_D_SERVER_ID,
  });
  const afterCanonical = await findByLocalId(
    DEPARTED_ROOM_A_ID,
    "departed-a-local",
  );
  assert.equal(afterCanonical?.senderNickname, ORIGINAL_NICK);
  assert.equal(afterCanonical?.senderAvatarUrl, ORIGINAL_AVATAR);

  // System messages (sender_id null) never propagate and are themselves
  // unaffected.
  await repository.mergeHistoryMessages([
    {
      body: null,
      chatroomId: OTHER_GROUP_ROOM_ID,
      clientMsgId: null,
      createdAtRaw: "2026-09-10T00:14:00.000000000Z",
      kind: "system",
      localId: "departed-system-local",
      media: [],
      senderAvatarUrl: null,
      senderId: null,
      senderNickname: null,
      serverMessageId: DEPARTED_SYSTEM_SERVER_ID,
    },
  ]);
  const afterSystem = await findByLocalId(
    DEPARTED_ROOM_A_ID,
    "departed-a-local",
  );
  assert.equal(afterSystem?.senderNickname, ORIGINAL_NICK);
  assert.equal(afterSystem?.senderAvatarUrl, ORIGINAL_AVATAR);
  const systemRow = await findByLocalId(
    OTHER_GROUP_ROOM_ID,
    "departed-system-local",
  );
  assert.equal(systemRow?.senderNickname, null);
  assert.equal(systemRow?.senderAvatarUrl, null);

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
