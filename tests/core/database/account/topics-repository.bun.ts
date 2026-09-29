// Disposable real SQLite under Bun; no device or server database is opened.
// @ts-nocheck
import assert from "node:assert/strict";
import { Database } from "bun:sqlite";
import { runMigrations } from "../../../../src/core/database/migrate";
import { accountMigrations } from "../../../../src/core/database/account/migrations";
import { createTopicsRepository } from "../../../../src/core/database/account/topics-repository";
import { createConnectedChatRepository } from "../../../../src/core/database/account/connected-chat-repository";
import { mapTopic } from "../../../../src/core/contracts/server/topics";
import {
  groupId,
  topicId,
  roomId,
  authorId,
  otherId,
  topicWire,
} from "../../../features/topics/topics-fixtures";

let afterWrite = (_sql: string) => {};
function adapterFor(db) {
  const adapter = {
    async execAsync(sql) {
      db.exec(sql);
    },
    async getAllAsync(sql, ...values) {
      return db.query(sql).all(...values);
    },
    async getFirstAsync(sql, ...values) {
      return db.query(sql).get(...values) ?? null;
    },
    async runAsync(sql, ...values) {
      const result = db.query(sql).run(...values);
      afterWrite(sql);
      return {
        changes: result.changes,
        lastInsertRowId: Number(result.lastInsertRowid),
      };
    },
    async withExclusiveTransactionAsync(run) {
      db.exec("BEGIN EXCLUSIVE");
      try {
        const result = await run(adapter);
        db.exec("COMMIT");
        return result;
      } catch (error) {
        db.exec("ROLLBACK");
        throw error;
      }
    },
  };
  return adapter;
}
const db = new Database(":memory:");
const adapter = adapterFor(db);
const principal = {
  epoch: 10,
  origin: "https://api.example.com",
  userId: authorId,
};
await runMigrations(adapter, accountMigrations.slice(0, 3));
db.query("INSERT INTO scope_metadata VALUES (1, ?, ?, 3)").run(
  principal.origin,
  authorId,
);
const chat = createConnectedChatRepository(adapter, principal, () => {});
await chat.upsertChatrooms([
  {
    chatroomId: roomId,
    groupId,
    kind: "topic",
    topicId,
    createdAtRaw: topicWire.created_at,
  },
]);
await chat.applyOrderedUnsupportedEvent({
  chatroomId: roomId,
  expectedCursor: null,
  cursor: "cursor-1",
  eventId: "marker-1",
  reconcileScope: "group_topics",
});
const before = db.query("SELECT * FROM connected_chatrooms").all();
// Seed the historical v3 wire directly: the current repository writes v5 columns.
await adapter.withExclusiveTransactionAsync(async (transaction) => {
  await transaction.runAsync(
    `INSERT INTO connected_chat_messages (
      local_id, chatroom_id, client_msg_id, sender_id, body, kind,
      local_created_at_ms, sort_seconds, sort_nanos, sort_tiebreaker, status
    ) VALUES ('pending-local', ?, 'pending-client', ?, '보존할 메시지', 'user',
      10, 0, 10000000, 'pending-local', 'pending')`,
    roomId,
    authorId,
  );
  await transaction.runAsync(
    `INSERT INTO connected_chat_outbox_commands (
      command_id, local_id, chatroom_id, client_msg_id, sender_id, body,
      state, created_at_ms, next_attempt_at_ms
    ) VALUES ('pending-command', 'pending-local', ?, 'pending-client', ?,
      '보존할 메시지', 'queued', 10, 10)`,
    roomId,
    authorId,
  );
});
const beforeMessages = db.query("SELECT * FROM connected_chat_messages").all();
const beforeOutbox = db
  .query("SELECT * FROM connected_chat_outbox_commands")
  .all();
await runMigrations(adapter, accountMigrations.slice(0, 4));
assert.equal(db.query("PRAGMA user_version").get().user_version, 4);
assert.deepEqual(db.query("SELECT * FROM connected_chatrooms").all(), before);
assert.deepEqual(
  db.query("SELECT * FROM connected_chat_messages").all(),
  beforeMessages,
);
assert.deepEqual(
  db.query("SELECT * FROM connected_chat_outbox_commands").all(),
  beforeOutbox,
);
assert.equal(await chat.getEventCheckpoint(roomId), "cursor-1");
await runMigrations(adapter, accountMigrations);
let active = true;
const guard = () => {
  if (!active) throw new Error("stale");
};
let repository = createTopicsRepository(adapter, principal, guard);
const topic = mapTopic(topicWire);
const dates = { today: "2026-09-11", dates: ["2026-09-11"], nextCursor: null };
const page = { items: [topic], nextCursor: "next-opaque" };
assert.equal(await repository.getPage(groupId, "2026-09-11"), null);
await repository.savePage(groupId, "2026-09-11", page);
await repository.saveDates(groupId, dates);
assert.deepEqual(await repository.getPage(groupId, "2026-09-11"), page);
assert.deepEqual(await repository.getDates(groupId), dates);
assert.equal(await repository.getTopic(otherId, topicId), null);
assert.equal(await repository.getPage(otherId, "2026-09-11"), null);
repository = createTopicsRepository(adapter, principal, guard);
assert.deepEqual(await repository.getTopic(groupId, topicId), topic);
await repository.saveTopic({ ...topic, title: "수정됨" });
assert.equal(
  (await repository.getPage(groupId, "2026-09-11")).items[0].title,
  "수정됨",
);
await assert.rejects(
  repository.savePage(groupId, "", {
    items: [{ ...topic, groupId: otherId }],
    nextCursor: null,
  }),
);
await assert.rejects(repository.saveTopic({ ...topic, groupId: otherId }));
const markers = await repository.listDirtyMarkers(groupId);
assert.deepEqual(markers, [{ chatroomId: roomId, markerEventId: "marker-1" }]);
await chat.applyOrderedUnsupportedEvent({
  chatroomId: roomId,
  expectedCursor: "cursor-1",
  cursor: "cursor-2",
  eventId: "marker-2",
  reconcileScope: "group_topics",
});
await repository.reconcileGroup({ groupId, date: "", dates, page, markers });
assert.equal(
  (await repository.listDirtyMarkers(groupId))[0].markerEventId,
  "marker-2",
);
assert.equal(await repository.getPage(groupId, "2026-09-11"), null);
assert.deepEqual(await repository.getPage(groupId, ""), page);
const freshMarkers = await repository.listDirtyMarkers(groupId);
db.exec(
  "CREATE TRIGGER reject_topic_write BEFORE UPDATE ON connected_topics BEGIN SELECT RAISE(ABORT, 'write failed'); END;",
);
await assert.rejects(
  repository.reconcileGroup({
    groupId,
    date: "",
    dates,
    page,
    markers: freshMarkers,
  }),
);
assert.equal(
  (await repository.listDirtyMarkers(groupId))[0].markerEventId,
  "marker-2",
);
db.exec("DROP TRIGGER reject_topic_write");
const cancelledRefresh = new AbortController();
afterWrite = (sql) => {
  if (sql.includes("INSERT INTO connected_topics")) cancelledRefresh.abort();
};
await assert.rejects(
  repository.reconcileGroup(
    {
      groupId,
      date: "",
      dates,
      page: { ...page, items: [{ ...topic, title: "취소된 조회" }] },
      markers: freshMarkers,
    },
    cancelledRefresh.signal,
  ),
  /cancelled/,
);
assert.deepEqual(await repository.getPage(groupId, ""), page);
assert.deepEqual(await repository.listDirtyMarkers(groupId), freshMarkers);
afterWrite = () => {};
await repository.reconcileGroup({
  groupId,
  date: "",
  dates,
  page,
  markers: freshMarkers,
});
assert.deepEqual(await repository.listDirtyMarkers(groupId), []);
assert.equal(await chat.getEventCheckpoint(roomId), "cursor-2");
assert.deepEqual(
  db.query("SELECT * FROM connected_chat_messages").all(),
  // beforeMessages was captured at v3, before the v5 pending_media_json and
  // v6 deleted_at_ms columns existed at all -- both are additive migrations
  // that give every pre-existing row a non-destructive default, never
  // dropped/renamed data, so both are added here rather than treated as a
  // mismatch.
  beforeMessages.map((message) => ({
    ...message,
    deleted_at_ms: null,
    pending_media_json: "[]",
  })),
);
assert.deepEqual(
  db.query("SELECT * FROM connected_chat_outbox_commands").all(),
  beforeOutbox.map((command) => ({ ...command, media_upload_ids_json: "[]" })),
);
const wrong = createTopicsRepository(
  adapter,
  { ...principal, userId: otherId },
  () => {},
);
await assert.rejects(wrong.getDates(groupId), /scope/);
await assert.rejects(wrong.saveTopic(topic), /scope/);

// M15 AC8: refreshAuthorIdentities reuses connected-chat's
// propagateSenderIdentity (r3/defect 10) against the very same account
// SQLite DB the chat repository above writes to.
const AUTHOR_LOCAL_ID = "topic-author-live-local";
const AUTHOR_SERVER_MESSAGE_ID = "77777777-7777-4777-8777-777777777777";
const ORIGINAL_AUTHOR_NICK = "원래 이름";
const ORIGINAL_AUTHOR_AVATAR = "https://cdn.example/original.png";
const DEPARTED_AUTHOR_NICK = "탈퇴한 사용자";
function findChatRow(chatroomId, localId) {
  return chat
    .listMessagesWindow({ chatroomId, limit: 20 })
    .then((page) => page.items.find((row) => row.localId === localId));
}
await chat.mergeHistoryMessages([
  {
    body: "작성자의 메시지",
    chatroomId: roomId,
    clientMsgId: null,
    createdAtRaw: "2026-09-11T00:20:00.000000000Z",
    kind: "user",
    localId: AUTHOR_LOCAL_ID,
    media: [],
    senderAvatarUrl: ORIGINAL_AUTHOR_AVATAR,
    senderId: otherId,
    senderNickname: ORIGINAL_AUTHOR_NICK,
    serverMessageId: AUTHOR_SERVER_MESSAGE_ID,
  },
]);
await chat.markMessageDeleted({
  deletedAtMs: 1_757_470_000_000,
  serverMessageId: AUTHOR_SERVER_MESSAGE_ID,
});
const beforeAuthorRefresh = await findChatRow(roomId, AUTHOR_LOCAL_ID);
assert.equal(beforeAuthorRefresh?.senderNickname, ORIGINAL_AUTHOR_NICK);
assert.equal(beforeAuthorRefresh?.senderAvatarUrl, ORIGINAL_AUTHOR_AVATAR);
assert.equal(beforeAuthorRefresh?.body, null);
const principalRowBefore = await findChatRow(roomId, "pending-local");

// A T3/T4 response shows the author's current (anonymized) identity.
await repository.refreshAuthorIdentities([
  {
    authorId: otherId,
    authorNickname: DEPARTED_AUTHOR_NICK,
    authorAvatarUrl: null,
  },
]);
const afterAuthorRefresh = await findChatRow(roomId, AUTHOR_LOCAL_ID);
assert.equal(afterAuthorRefresh?.senderNickname, DEPARTED_AUTHOR_NICK);
assert.equal(afterAuthorRefresh?.senderAvatarUrl, null);
// E2 unaffected: content and the tombstone stay frozen.
assert.equal(afterAuthorRefresh?.body, null);
assert.equal(afterAuthorRefresh?.deletedAtMs, beforeAuthorRefresh?.deletedAtMs);
// A different sender_id (the principal's own row) is untouched.
assert.deepEqual(
  await findChatRow(roomId, "pending-local"),
  principalRowBefore,
);

// No-op when equal: calling again with the same identity changes nothing.
await repository.refreshAuthorIdentities([
  {
    authorId: otherId,
    authorNickname: DEPARTED_AUTHOR_NICK,
    authorAvatarUrl: null,
  },
]);
assert.deepEqual(
  await findChatRow(roomId, AUTHOR_LOCAL_ID),
  afterAuthorRefresh,
);

// Restore direction (A2): the account is restored, a later T3/T4 response
// shows the original identity again.
await repository.refreshAuthorIdentities([
  {
    authorId: otherId,
    authorNickname: ORIGINAL_AUTHOR_NICK,
    authorAvatarUrl: ORIGINAL_AUTHOR_AVATAR,
  },
]);
const restoredAuthorRow = await findChatRow(roomId, AUTHOR_LOCAL_ID);
assert.equal(restoredAuthorRow?.senderNickname, ORIGINAL_AUTHOR_NICK);
assert.equal(restoredAuthorRow?.senderAvatarUrl, ORIGINAL_AUTHOR_AVATAR);
assert.equal(restoredAuthorRow?.body, null);
assert.equal(restoredAuthorRow?.deletedAtMs, beforeAuthorRefresh?.deletedAtMs);

// An empty identity list is a no-op (no transaction, no error).
await repository.refreshAuthorIdentities([]);
assert.deepEqual(await findChatRow(roomId, AUTHOR_LOCAL_ID), restoredAuthorRow);

active = false;
await assert.rejects(repository.getTopic(groupId, topicId), /stale/);
await assert.rejects(repository.saveTopic(topic), /stale/);
db.close();
console.log("m10-topics-sqlite: PASS");
