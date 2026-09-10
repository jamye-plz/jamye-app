import type { Migration } from "../../migrations/001-initial-schema";

// Rebuildable topic/query snapshots only. Existing messages, outbox commands
// and ordered event checkpoints are untouched; no backfill or destructive DDL.
export const topicsCacheMigration: Migration = {
  version: 4,
  name: "topics-cache",
  statements: [
    `CREATE TABLE connected_topics (
      topic_id TEXT PRIMARY KEY NOT NULL,
      group_id TEXT NOT NULL,
      snapshot_json TEXT NOT NULL CHECK (json_valid(snapshot_json))
    );`,
    `CREATE INDEX connected_topics_group_idx ON connected_topics (group_id, topic_id);`,
    `CREATE TABLE connected_topic_queries (
      group_id TEXT NOT NULL,
      query_key TEXT NOT NULL,
      snapshot_json TEXT NOT NULL CHECK (json_valid(snapshot_json)),
      PRIMARY KEY (group_id, query_key)
    );`,
    `UPDATE scope_metadata SET schema_version = 4 WHERE singleton = 1;`,
  ],
};
