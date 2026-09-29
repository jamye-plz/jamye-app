import type { Migration } from "../../migrations/001-initial-schema";

// Version 006 (AC1/E17) adds a monotonic per-message deletion tombstone and
// widens connected_chat_applied_events.event_kind to record message.deleted
// and topic.deleted. SQLite auto-repoints a referencing table's FOREIGN KEY
// definition at the new name when the referenced table is RENAMEd while
// foreign_keys=ON (which migrate.ts sets before any migration runs) -- so
// renaming connected_chat_applied_events alone would leave
// connected_chat_reconciliation_scopes's FK pointing at the dropped `_v5`
// table. Both tables are therefore rebuilt together in dependency order
// (parent, then child) and every existing connected_chat_reconciliation_scopes
// marker row is copied across unchanged -- preserving that marker data is a
// migration acceptance criterion (plan api_contracts.app_account_db_v6.
// applied_events_choice), not just the schema shape.
export const connectedChatDeletionsMigration: Migration = {
  version: 6,
  name: "connected-chat-deletions",
  statements: [
    `ALTER TABLE connected_chat_messages
      ADD COLUMN deleted_at_ms INTEGER CHECK (deleted_at_ms IS NULL OR deleted_at_ms >= 0);`,
    `CREATE TRIGGER connected_chat_messages_deletion_monotonic
      BEFORE UPDATE OF deleted_at_ms ON connected_chat_messages
      FOR EACH ROW WHEN OLD.deleted_at_ms IS NOT NULL AND NEW.deleted_at_ms IS NULL
      BEGIN SELECT RAISE(ABORT, 'connected chat message deletion is monotonic'); END;`,
    `ALTER TABLE connected_chat_applied_events
      RENAME TO connected_chat_applied_events_v5;`,
    `CREATE TABLE connected_chat_applied_events (
      event_id TEXT PRIMARY KEY NOT NULL CHECK (length(event_id) > 0),
      chatroom_id TEXT NOT NULL,
      event_kind TEXT NOT NULL CHECK (
        event_kind IN ('message.created', 'unsupported', 'message.deleted', 'topic.deleted')
      ),
      message_server_id TEXT,
      CHECK (
        (event_kind = 'message.created' AND message_server_id IS NOT NULL) OR
        (event_kind = 'unsupported' AND message_server_id IS NULL) OR
        (event_kind = 'message.deleted' AND message_server_id IS NOT NULL) OR
        (event_kind = 'topic.deleted' AND message_server_id IS NULL)
      ),
      UNIQUE (event_id, chatroom_id),
      FOREIGN KEY (chatroom_id) REFERENCES connected_chatrooms(chatroom_id) ON DELETE CASCADE
    );`,
    `INSERT INTO connected_chat_applied_events (
      event_id, chatroom_id, event_kind, message_server_id
    )
    SELECT event_id, chatroom_id, event_kind, message_server_id
    FROM connected_chat_applied_events_v5;`,
    `ALTER TABLE connected_chat_reconciliation_scopes
      RENAME TO connected_chat_reconciliation_scopes_v5;`,
    `CREATE TABLE connected_chat_reconciliation_scopes (
      chatroom_id TEXT NOT NULL,
      scope TEXT NOT NULL CHECK (scope IN ('chat_history', 'group_topics', 'notifications')),
      marker_event_id TEXT NOT NULL,
      PRIMARY KEY (chatroom_id, scope),
      FOREIGN KEY (chatroom_id) REFERENCES connected_chatrooms(chatroom_id) ON DELETE CASCADE,
      FOREIGN KEY (marker_event_id, chatroom_id)
        REFERENCES connected_chat_applied_events(event_id, chatroom_id) ON DELETE CASCADE
    );`,
    `INSERT INTO connected_chat_reconciliation_scopes (chatroom_id, scope, marker_event_id)
     SELECT chatroom_id, scope, marker_event_id
     FROM connected_chat_reconciliation_scopes_v5;`,
    `DROP TABLE connected_chat_reconciliation_scopes_v5;`,
    // SQLite index names are schema-global, not per-table: renaming
    // connected_chat_applied_events above left its original
    // connected_chat_applied_events_room_idx index attached to (but not
    // renamed with) the now-_v5 table, so creating an index of the same
    // name on the fresh table before dropping _v5 collides ("index ...
    // already exists"). DROP TABLE drops a table's own indexes with it, so
    // the old index is only gone once _v5 itself is dropped -- the CREATE
    // INDEX below must come after this DROP, not before it.
    `DROP TABLE connected_chat_applied_events_v5;`,
    `CREATE INDEX connected_chat_applied_events_room_idx
      ON connected_chat_applied_events (chatroom_id, event_id);`,
    `UPDATE scope_metadata SET schema_version = 6 WHERE singleton = 1;`,
  ],
};
