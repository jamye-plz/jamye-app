import type { Migration } from "../../migrations/001-initial-schema";

// Version 005 keeps transfer state out of SQLite. Only confirmed upload
// references enter the durable send intent, while pending metadata exists
// solely to render that intent until a canonical server message replaces it.
// runMigrations executes every statement below in one exclusive transaction.
export const connectedChatMediaMigration: Migration = {
  version: 5,
  name: "connected-chat-media",
  statements: [
    `ALTER TABLE connected_chat_messages
      ADD COLUMN pending_media_json TEXT NOT NULL DEFAULT '[]'
      CHECK (
        json_valid(pending_media_json) AND
        json_type(pending_media_json) = 'array' AND
        json_array_length(pending_media_json) BETWEEN 0 AND 4
      );`,
    `ALTER TABLE connected_chat_outbox_commands
      RENAME TO connected_chat_outbox_commands_v4;`,
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
        'server_unavailable', 'unknown'
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
      '[]', state, error_code, created_at_ms, attempt_count,
      next_attempt_at_ms, lease_token, lease_expires_at_ms
    FROM connected_chat_outbox_commands_v4;`,
    `DROP TABLE connected_chat_outbox_commands_v4;`,
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
    `UPDATE scope_metadata SET schema_version = 5 WHERE singleton = 1;`,
  ],
};
