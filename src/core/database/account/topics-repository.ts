import {
  mapTopic,
  mapTopicDates,
  topicToWire,
  type Topic,
  type TopicDatePage,
  type TopicPage,
} from "../../contracts/server/topics";
import {
  validateCanonicalTopic,
  validateTopicDatePage,
} from "../../contracts/server/validators";
import type { SqliteRepositoryDatabase, SqliteRow } from "../types";
import type { AccountPrincipal } from "./types";
import type { TopicsRepository } from "./topics-types";

type SnapshotRow = SqliteRow & { snapshot_json: string };
function parseTopic(text: string, groupId: string, topicId?: string): Topic {
  const value: unknown = JSON.parse(text);
  if (
    !validateCanonicalTopic(value) ||
    value.group_id !== groupId ||
    (topicId !== undefined && value.id !== topicId) ||
    value.tags.some((tag) => tag.topic_id !== value.id) ||
    value.media.some((item) => item.topic_id !== value.id)
  )
    throw new Error("Invalid cached topic scope.");
  return mapTopic(value);
}
function topicBytes(topic: Topic): string {
  const bytes = JSON.stringify(topicToWire(topic));
  parseTopic(bytes, topic.groupId, topic.id);
  return bytes;
}
function datesBytes(dates: TopicDatePage): string {
  const wire = {
    dates: dates.dates,
    today: dates.today,
    next_cursor: dates.nextCursor,
  };
  if (!validateTopicDatePage(wire))
    throw new Error("Invalid cached topic dates.");
  return JSON.stringify(wire);
}
function parsePage(
  text: string,
): Readonly<{ ids: readonly string[]; nextCursor: string | null }> {
  const value: unknown = JSON.parse(text);
  if (
    !value ||
    typeof value !== "object" ||
    !("ids" in value) ||
    !Array.isArray(value.ids) ||
    !value.ids.every((id: unknown) => typeof id === "string") ||
    !("nextCursor" in value) ||
    (value.nextCursor !== null && typeof value.nextCursor !== "string")
  )
    throw new Error("Invalid cached topic page.");
  return { ids: value.ids, nextCursor: value.nextCursor };
}

/** Canonical topic JSON is an owned aggregate, query JSON only stores ordered IDs.
 * Both are disposable API caches, not a second authority for messages or outbox. */
export function createTopicsRepository(
  database: SqliteRepositoryDatabase,
  principal: AccountPrincipal,
  assertActive: () => void,
): TopicsRepository {
  const { origin, userId } = principal;
  async function assertScope(db = database) {
    assertActive();
    const row = await db.getFirstAsync<SqliteRow>(
      "SELECT origin, user_id FROM scope_metadata WHERE singleton = 1",
    );
    if (row?.origin !== origin || row?.user_id !== userId)
      throw new Error("Topic account scope mismatch.");
    assertActive();
  }
  async function transaction(
    run: (db: SqliteRepositoryDatabase) => Promise<void>,
    signal?: AbortSignal,
  ) {
    assertActive();
    await database.withExclusiveTransactionAsync(async (db) => {
      await assertScope(db);
      if (signal?.aborted) throw new Error("Topic refresh cancelled.");
      await run(db);
      assertActive();
      // Cancellation during SQLite work rolls back both snapshot and marker.
      if (signal?.aborted) throw new Error("Topic refresh cancelled.");
    });
  }
  async function putTopic(db: SqliteRepositoryDatabase, topic: Topic) {
    const bytes = topicBytes(topic);
    const existing = await db.getFirstAsync<SqliteRow>(
      "SELECT group_id FROM connected_topics WHERE topic_id = ?",
      topic.id,
    );
    if (existing && existing.group_id !== topic.groupId)
      throw new Error("Topic identity scope conflict.");
    await db.runAsync(
      `INSERT INTO connected_topics (topic_id, group_id, snapshot_json) VALUES (?, ?, ?)
      ON CONFLICT(topic_id) DO UPDATE SET snapshot_json = excluded.snapshot_json`,
      topic.id,
      topic.groupId,
      bytes,
    );
  }
  async function putQuery(
    db: SqliteRepositoryDatabase,
    groupId: string,
    key: string,
    bytes: string,
  ) {
    await db.runAsync(
      `INSERT INTO connected_topic_queries (group_id, query_key, snapshot_json) VALUES (?, ?, ?)
      ON CONFLICT(group_id, query_key) DO UPDATE SET snapshot_json = excluded.snapshot_json`,
      groupId,
      key,
      bytes,
    );
  }
  async function putPage(
    db: SqliteRepositoryDatabase,
    groupId: string,
    date: string,
    page: TopicPage,
  ) {
    if (page.items.some((topic) => topic.groupId !== groupId))
      throw new Error("Topic page scope mismatch.");
    if (new Set(page.items.map((topic) => topic.id)).size !== page.items.length)
      throw new Error("Duplicate topic page identity.");
    for (const topic of page.items) await putTopic(db, topic);
    await putQuery(
      db,
      groupId,
      `topics:${date}`,
      JSON.stringify({
        ids: page.items.map((topic) => topic.id),
        nextCursor: page.nextCursor,
      }),
    );
  }
  return {
    async getTopic(groupId, topicId) {
      await assertScope();
      const row = await database.getFirstAsync<SnapshotRow>(
        "SELECT snapshot_json FROM connected_topics WHERE group_id = ? AND topic_id = ?",
        groupId,
        topicId,
      );
      assertActive();
      return row ? parseTopic(row.snapshot_json, groupId, topicId) : null;
    },
    async getPage(groupId, date) {
      await assertScope();
      const row = await database.getFirstAsync<SnapshotRow>(
        "SELECT snapshot_json FROM connected_topic_queries WHERE group_id = ? AND query_key = ?",
        groupId,
        `topics:${date}`,
      );
      if (!row) return null;
      const page = parsePage(row.snapshot_json);
      const rows = await database.getAllAsync<SnapshotRow>(
        `SELECT t.snapshot_json
        FROM json_each(?) p JOIN connected_topics t ON t.topic_id = p.value AND t.group_id = ?
        ORDER BY CAST(p.key AS INTEGER)`,
        JSON.stringify(page.ids),
        groupId,
      );
      assertActive();
      if (rows.length !== page.ids.length)
        throw new Error("Incomplete cached topic page.");
      return {
        items: rows.map((item, index) =>
          parseTopic(item.snapshot_json, groupId, page.ids[index]),
        ),
        nextCursor: page.nextCursor,
      };
    },
    async getDates(groupId) {
      await assertScope();
      const row = await database.getFirstAsync<SnapshotRow>(
        "SELECT snapshot_json FROM connected_topic_queries WHERE group_id = ? AND query_key = 'dates'",
        groupId,
      );
      assertActive();
      if (!row) return null;
      const value: unknown = JSON.parse(row.snapshot_json);
      if (!validateTopicDatePage(value))
        throw new Error("Invalid cached topic dates.");
      return mapTopicDates(value);
    },
    async saveTopic(topic) {
      await transaction((db) => putTopic(db, topic));
    },
    async savePage(groupId, date, page) {
      await transaction((db) => putPage(db, groupId, date, page));
    },
    async saveDates(groupId, dates) {
      await transaction((db) =>
        putQuery(db, groupId, "dates", datesBytes(dates)),
      );
    },
    async listDirtyMarkers(groupId) {
      await assertScope();
      const rows = await database.getAllAsync<
        SqliteRow & { chatroom_id: string; marker_event_id: string }
      >(
        `SELECT s.chatroom_id, s.marker_event_id FROM connected_chat_reconciliation_scopes s
         JOIN connected_chatrooms r ON r.chatroom_id = s.chatroom_id
         WHERE r.group_id = ? AND s.scope = 'group_topics' ORDER BY s.chatroom_id`,
        groupId,
      );
      assertActive();
      return rows.map((row) => ({
        chatroomId: row.chatroom_id,
        markerEventId: row.marker_event_id,
      }));
    },
    async reconcileGroup({ groupId, date, dates, page, markers }, signal) {
      await transaction(async (db) => {
        await db.runAsync(
          "DELETE FROM connected_topic_queries WHERE group_id = ?",
          groupId,
        );
        await putQuery(db, groupId, "dates", datesBytes(dates));
        await putPage(db, groupId, date, page);
        for (const marker of markers)
          await db.runAsync(
            `DELETE FROM connected_chat_reconciliation_scopes
          WHERE scope = 'group_topics' AND chatroom_id = ? AND marker_event_id = ?
            AND EXISTS (SELECT 1 FROM connected_chatrooms r WHERE r.chatroom_id = connected_chat_reconciliation_scopes.chatroom_id AND r.group_id = ?)`,
            marker.chatroomId,
            marker.markerEventId,
            groupId,
          );
      }, signal);
    },
    async invalidateGroup(groupId) {
      await transaction(async (db) => {
        await db.runAsync(
          "DELETE FROM connected_topic_queries WHERE group_id = ?",
          groupId,
        );
        await db.runAsync(
          "DELETE FROM connected_topics WHERE group_id = ?",
          groupId,
        );
      });
    },
  };
}
