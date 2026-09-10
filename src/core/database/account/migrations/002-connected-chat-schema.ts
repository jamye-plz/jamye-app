import type { Migration } from "../../migrations";

export const connectedChatSchemaMigration: Migration = {
  version: 2,
  name: "connected-chat-schema",
  statements: [
    `CREATE TABLE connected_chatrooms (
      chatroom_id TEXT PRIMARY KEY NOT NULL CHECK (length(chatroom_id) > 0),
      group_id TEXT NOT NULL CHECK (length(group_id) > 0),
      kind TEXT NOT NULL CHECK (kind IN ('main', 'topic')),
      topic_id TEXT,
      created_at_raw TEXT NOT NULL CHECK (length(created_at_raw) > 0),
      sort_seconds INTEGER NOT NULL,
      sort_nanos INTEGER NOT NULL CHECK (sort_nanos BETWEEN 0 AND 999999999),
      CHECK ((kind = 'main' AND topic_id IS NULL) OR (kind = 'topic' AND topic_id IS NOT NULL))
    );`,
    `CREATE INDEX connected_chatrooms_group_window_idx
      ON connected_chatrooms (group_id, sort_seconds, sort_nanos, chatroom_id);`,
    `CREATE TABLE connected_chat_messages (
      local_id TEXT PRIMARY KEY NOT NULL CHECK (length(local_id) > 0),
      server_message_id TEXT UNIQUE,
      chatroom_id TEXT NOT NULL,
      client_msg_id TEXT,
      sender_id TEXT,
      sender_nickname TEXT,
      sender_avatar_url TEXT,
      body TEXT,
      kind TEXT NOT NULL CHECK (kind IN ('user', 'system')),
      media_json TEXT NOT NULL DEFAULT '[]' CHECK (json_valid(media_json)),
      created_at_raw TEXT,
      local_created_at_ms INTEGER NOT NULL,
      sort_seconds INTEGER NOT NULL,
      sort_nanos INTEGER NOT NULL CHECK (sort_nanos BETWEEN 0 AND 999999999),
      sort_tiebreaker TEXT NOT NULL CHECK (length(sort_tiebreaker) > 0),
      status TEXT NOT NULL CHECK (status IN ('pending', 'sent', 'failed')),
      UNIQUE (local_id, chatroom_id),
      FOREIGN KEY (chatroom_id) REFERENCES connected_chatrooms(chatroom_id) ON DELETE CASCADE
    );`,
    `CREATE UNIQUE INDEX connected_chat_messages_sender_client_idx
      ON connected_chat_messages (sender_id, client_msg_id)
      WHERE sender_id IS NOT NULL AND client_msg_id IS NOT NULL;`,
    `CREATE INDEX connected_chat_messages_room_window_idx
      ON connected_chat_messages (
        chatroom_id, sort_seconds DESC, sort_nanos DESC,
        sort_tiebreaker DESC, local_id DESC
      );`,
    `CREATE TABLE connected_chat_outbox_commands (
      command_id TEXT PRIMARY KEY NOT NULL CHECK (length(command_id) > 0),
      local_id TEXT NOT NULL UNIQUE,
      chatroom_id TEXT NOT NULL,
      client_msg_id TEXT NOT NULL CHECK (length(client_msg_id) > 0),
      sender_id TEXT NOT NULL CHECK (length(sender_id) > 0),
      body TEXT NOT NULL CHECK (length(body) > 0),
      state TEXT NOT NULL CHECK (state IN ('queued', 'in_flight', 'acked', 'failed')),
      error_code TEXT CHECK (error_code IS NULL OR error_code IN (
        'network', 'unauthorized', 'forbidden', 'conflict', 'validation',
        'server_unavailable', 'unknown'
      )),
      created_at_ms INTEGER NOT NULL,
      UNIQUE (sender_id, client_msg_id),
      FOREIGN KEY (local_id, chatroom_id)
        REFERENCES connected_chat_messages(local_id, chatroom_id) ON DELETE CASCADE
    );`,
    `CREATE TRIGGER connected_chat_outbox_immutable_intent
      BEFORE UPDATE OF command_id, local_id, chatroom_id, client_msg_id, sender_id, body, created_at_ms
      ON connected_chat_outbox_commands
      FOR EACH ROW WHEN
        NEW.command_id <> OLD.command_id OR NEW.local_id <> OLD.local_id OR
        NEW.chatroom_id <> OLD.chatroom_id OR NEW.client_msg_id <> OLD.client_msg_id OR
        NEW.sender_id <> OLD.sender_id OR NEW.body <> OLD.body OR
        NEW.created_at_ms <> OLD.created_at_ms
      BEGIN SELECT RAISE(ABORT, 'connected chat send intent is immutable'); END;`,
    `UPDATE scope_metadata SET schema_version = 2 WHERE singleton = 1;`,
  ],
};
