import type { Migration } from "../../migrations/001-initial-schema";

export const durableOutboxEventsMigration: Migration = {
  version: 3,
  name: "durable-outbox-events",
  statements: [
    `ALTER TABLE connected_chat_outbox_commands
      ADD COLUMN attempt_count INTEGER NOT NULL DEFAULT 0 CHECK (attempt_count >= 0);`,
    `ALTER TABLE connected_chat_outbox_commands
      ADD COLUMN next_attempt_at_ms INTEGER NOT NULL DEFAULT 0 CHECK (next_attempt_at_ms >= 0);`,
    `ALTER TABLE connected_chat_outbox_commands
      ADD COLUMN lease_token TEXT;`,
    `ALTER TABLE connected_chat_outbox_commands
      ADD COLUMN lease_expires_at_ms INTEGER;`,
    `CREATE INDEX connected_chat_outbox_queued_due_idx
      ON connected_chat_outbox_commands (
        sender_id, next_attempt_at_ms, created_at_ms, command_id
      ) WHERE state = 'queued';`,
    `CREATE INDEX connected_chat_outbox_in_flight_lease_idx
      ON connected_chat_outbox_commands (
        sender_id, lease_expires_at_ms, created_at_ms, command_id
      ) WHERE state = 'in_flight';`,
    `CREATE TABLE connected_chat_event_checkpoints (
      chatroom_id TEXT PRIMARY KEY NOT NULL,
      checkpoint TEXT CHECK (checkpoint IS NULL OR length(checkpoint) > 0),
      FOREIGN KEY (chatroom_id) REFERENCES connected_chatrooms(chatroom_id) ON DELETE CASCADE
    );`,
    `CREATE TABLE connected_chat_applied_events (
      event_id TEXT PRIMARY KEY NOT NULL CHECK (length(event_id) > 0),
      chatroom_id TEXT NOT NULL,
      event_kind TEXT NOT NULL CHECK (event_kind IN ('message.created', 'unsupported')),
      message_server_id TEXT,
      CHECK (
        (event_kind = 'message.created' AND message_server_id IS NOT NULL) OR
        (event_kind = 'unsupported' AND message_server_id IS NULL)
      ),
      UNIQUE (event_id, chatroom_id),
      FOREIGN KEY (chatroom_id) REFERENCES connected_chatrooms(chatroom_id) ON DELETE CASCADE
    );`,
    `CREATE INDEX connected_chat_applied_events_room_idx
      ON connected_chat_applied_events (chatroom_id, event_id);`,
    `CREATE TABLE connected_chat_reconciliation_scopes (
      chatroom_id TEXT NOT NULL,
      scope TEXT NOT NULL CHECK (scope IN ('chat_history', 'group_topics', 'notifications')),
      marker_event_id TEXT NOT NULL,
      PRIMARY KEY (chatroom_id, scope),
      FOREIGN KEY (chatroom_id) REFERENCES connected_chatrooms(chatroom_id) ON DELETE CASCADE,
      FOREIGN KEY (marker_event_id, chatroom_id)
        REFERENCES connected_chat_applied_events(event_id, chatroom_id) ON DELETE CASCADE
    );`,
    `UPDATE scope_metadata SET schema_version = 3 WHERE singleton = 1;`,
  ],
};
