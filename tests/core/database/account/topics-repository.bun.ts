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
await chat.enqueuePendingMessage({
  body: "보존할 메시지",
  chatroomId: roomId,
  clientMsgId: "pending-client",
  commandId: "pending-command",
  localId: "pending-local",
  localCreatedAtMs: 10,
});
const beforeMessages = db.query("SELECT * FROM connected_chat_messages").all();
const beforeOutbox = db
  .query("SELECT * FROM connected_chat_outbox_commands")
  .all();
await runMigrations(adapter, accountMigrations);
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
  beforeMessages,
);
assert.deepEqual(
  db.query("SELECT * FROM connected_chat_outbox_commands").all(),
  beforeOutbox,
);
const wrong = createTopicsRepository(
  adapter,
  { ...principal, userId: otherId },
  () => {},
);
await assert.rejects(wrong.getDates(groupId), /scope/);
await assert.rejects(wrong.saveTopic(topic), /scope/);
active = false;
await assert.rejects(repository.getTopic(groupId, topicId), /stale/);
await assert.rejects(repository.saveTopic(topic), /stale/);
db.close();
console.log("m10-topics-sqlite: PASS");
