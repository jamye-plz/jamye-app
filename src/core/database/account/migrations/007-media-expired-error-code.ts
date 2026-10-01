import type { Migration } from "../../migrations/001-initial-schema";

// Version 007 (E2/C2/U2) widens connected_chat_outbox_commands.error_code's
// CHECK to also accept 'media_expired' -- the distinct terminal failure for a
// 422 media_not_available send (the staged upload's 1h bind TTL elapsed
// before the message could be sent). SQLite cannot ALTER a CHECK constraint
// in place, so the table is rebuilt with the widened CHECK the same way
// migration 005 rebuilt it for pending_media_json -- every existing row
// (any state, any existing error_code including NULL) is carried across
// unchanged. No down migration, matching every migration in this directory.
//
// It first removes rows whose parent is already gone. expo-sqlite runs every
// exclusive transaction on a new connection with foreign_keys OFF, so the
// app's own deletes (a pruned chatroom, a discarded failed message) never
// fired their ON DELETE CASCADE. runMigrations' PRAGMA foreign_key_check
// rejects any such row, which kept this migration -- and with it the account
// database -- from opening on real devices (M17 device round). The deletes
// below do what those cascades would have done, parents before children; the
// outbox rebuild skips commands whose message is gone.
export const mediaExpiredErrorCodeMigration: Migration = {
  version: 7,
  name: "media-expired-error-code",
  statements: [
    `DELETE FROM connected_chat_applied_events
      WHERE chatroom_id NOT IN (SELECT chatroom_id FROM connected_chatrooms);`,
    `DELETE FROM connected_chat_reconciliation_scopes
      WHERE chatroom_id NOT IN (SELECT chatroom_id FROM connected_chatrooms)
        OR NOT EXISTS (
          SELECT 1 FROM connected_chat_applied_events e
          WHERE e.event_id = connected_chat_reconciliation_scopes.marker_event_id
            AND e.chatroom_id = connected_chat_reconciliation_scopes.chatroom_id
        );`,
    `DELETE FROM connected_chat_event_checkpoints
      WHERE chatroom_id NOT IN (SELECT chatroom_id FROM connected_chatrooms);`,
    `DELETE FROM connected_chat_messages
      WHERE chatroom_id NOT IN (SELECT chatroom_id FROM connected_chatrooms);`,
    `ALTER TABLE connected_chat_outbox_commands
      RENAME TO connected_chat_outbox_commands_v6;`,
    `CREATE TABLE connected_chat_outbox_commands (
      command_id TEXT PRIMARY KEY NOT NULL CHECK (length(command_id) > 0),
      local_id TEXT NOT NULL UNIQUE,
      chatroom_id TEXT NOT NULL,
      client_msg_id TEXT NOT NULL CHECK (length(client_msg_id) > 0),
      sender_id TEXT NOT NULL CHECK (length(sender_id) > 0),
      body TEXT NOT NULL,
      media_upload_ids_json TEXT NOT NULL DEFAULT '[]' CHECK (
        json_valid(media_upload_ids_json) AND
        json_type(media_upload_ids_json) = 'array' AND
        json_array_length(media_upload_ids_json) BETWEEN 0 AND 4
      ),
      state TEXT NOT NULL CHECK (state IN ('queued', 'in_flight', 'acked', 'failed')),
      error_code TEXT CHECK (error_code IS NULL OR error_code IN (
        'network', 'unauthorized', 'forbidden', 'conflict', 'validation',
        'server_unavailable', 'unknown', 'media_expired'
      )),
      created_at_ms INTEGER NOT NULL,
      attempt_count INTEGER NOT NULL DEFAULT 0 CHECK (attempt_count >= 0),
      next_attempt_at_ms INTEGER NOT NULL DEFAULT 0 CHECK (next_attempt_at_ms >= 0),
      lease_token TEXT,
      lease_expires_at_ms INTEGER,
      CHECK (length(body) > 0 OR json_array_length(media_upload_ids_json) > 0),
      UNIQUE (sender_id, client_msg_id),
      FOREIGN KEY (local_id, chatroom_id)
        REFERENCES connected_chat_messages(local_id, chatroom_id) ON DELETE CASCADE
    );`,
    `INSERT INTO connected_chat_outbox_commands (
      command_id, local_id, chatroom_id, client_msg_id, sender_id, body,
      media_upload_ids_json, state, error_code, created_at_ms, attempt_count,
      next_attempt_at_ms, lease_token, lease_expires_at_ms
    )
    SELECT
      command_id, local_id, chatroom_id, client_msg_id, sender_id, body,
      media_upload_ids_json, state, error_code, created_at_ms, attempt_count,
      next_attempt_at_ms, lease_token, lease_expires_at_ms
    FROM connected_chat_outbox_commands_v6 v6
    WHERE EXISTS (
      SELECT 1 FROM connected_chat_messages m
      WHERE m.local_id = v6.local_id AND m.chatroom_id = v6.chatroom_id
    );`,
    `DROP TABLE connected_chat_outbox_commands_v6;`,
    `CREATE INDEX connected_chat_outbox_queued_due_idx
      ON connected_chat_outbox_commands (
        sender_id, next_attempt_at_ms, created_at_ms, command_id
      ) WHERE state = 'queued';`,
    `CREATE INDEX connected_chat_outbox_in_flight_lease_idx
      ON connected_chat_outbox_commands (
        sender_id, lease_expires_at_ms, created_at_ms, command_id
      ) WHERE state = 'in_flight';`,
    `CREATE TRIGGER connected_chat_outbox_immutable_intent
      BEFORE UPDATE OF command_id, local_id, chatroom_id, client_msg_id,
        sender_id, body, media_upload_ids_json, created_at_ms
      ON connected_chat_outbox_commands
      FOR EACH ROW WHEN
        NEW.command_id <> OLD.command_id OR NEW.local_id <> OLD.local_id OR
        NEW.chatroom_id <> OLD.chatroom_id OR NEW.client_msg_id <> OLD.client_msg_id OR
        NEW.sender_id <> OLD.sender_id OR NEW.body <> OLD.body OR
        NEW.media_upload_ids_json <> OLD.media_upload_ids_json OR
        NEW.created_at_ms <> OLD.created_at_ms
      BEGIN SELECT RAISE(ABORT, 'connected chat send intent is immutable'); END;`,
    `UPDATE scope_metadata SET schema_version = 7 WHERE singleton = 1;`,
  ],
};
