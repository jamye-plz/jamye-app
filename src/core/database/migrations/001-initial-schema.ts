export type Migration = Readonly<{
  name: string;
  statements: readonly string[];
  version: number;
}>;

export const initialSchemaMigration: Migration = {
  version: 1,
  name: "initial-schema",
  statements: [
    `CREATE TABLE conversations (
      id TEXT PRIMARY KEY NOT NULL CHECK (length(id) > 0),
      kind TEXT NOT NULL CHECK (kind = 'fixture'),
      title TEXT NOT NULL CHECK (length(title) > 0),
      updated_at_ms INTEGER NOT NULL CHECK (updated_at_ms >= 0)
    );`,
    `CREATE TABLE messages (
      local_id TEXT PRIMARY KEY NOT NULL CHECK (length(local_id) > 0),
      conversation_id TEXT NOT NULL,
      client_msg_id TEXT CHECK (client_msg_id IS NULL OR length(client_msg_id) > 0),
      event_id TEXT CHECK (event_id IS NULL OR length(event_id) > 0),
      sender_id TEXT NOT NULL CHECK (length(sender_id) > 0),
      body TEXT NOT NULL CHECK (length(body) > 0),
      status TEXT NOT NULL CHECK (status IN ('pending', 'sent', 'failed')),
      created_at_ms INTEGER NOT NULL CHECK (created_at_ms >= 0),
      server_sequence INTEGER CHECK (server_sequence IS NULL OR server_sequence >= 1),
      CONSTRAINT messages_conversation_fk
        FOREIGN KEY (conversation_id) REFERENCES conversations(id)
        ON UPDATE RESTRICT ON DELETE RESTRICT,
      CONSTRAINT messages_client_msg_id_unique UNIQUE (client_msg_id),
      CONSTRAINT messages_event_id_unique UNIQUE (event_id),
      CONSTRAINT messages_conversation_client_unique UNIQUE (conversation_id, client_msg_id),
      CONSTRAINT messages_sent_has_canonical_identity
        CHECK (status <> 'sent' OR (event_id IS NOT NULL AND server_sequence IS NOT NULL))
    );`,
    `CREATE INDEX messages_conversation_created_idx
      ON messages (conversation_id, created_at_ms, local_id);`,
    `CREATE TABLE outbox_commands (
      command_id TEXT PRIMARY KEY NOT NULL CHECK (length(command_id) > 0),
      conversation_id TEXT NOT NULL,
      client_msg_id TEXT NOT NULL CHECK (length(client_msg_id) > 0),
      command_type TEXT NOT NULL CHECK (command_type = 'message.create'),
      body TEXT NOT NULL CHECK (length(body) > 0),
      state TEXT NOT NULL CHECK (state IN ('queued', 'in_flight', 'acked', 'failed')),
      created_at_ms INTEGER NOT NULL CHECK (created_at_ms >= 0),
      CONSTRAINT outbox_client_msg_id_unique UNIQUE (client_msg_id),
      CONSTRAINT outbox_message_fk
        FOREIGN KEY (conversation_id, client_msg_id)
        REFERENCES messages (conversation_id, client_msg_id)
        ON UPDATE RESTRICT ON DELETE RESTRICT
    );`,
    `CREATE INDEX outbox_state_created_idx
      ON outbox_commands (state, created_at_ms, command_id);`,
    `CREATE TABLE applied_events (
      event_id TEXT PRIMARY KEY NOT NULL CHECK (length(event_id) > 0),
      conversation_id TEXT NOT NULL,
      type TEXT NOT NULL CHECK (length(type) > 0),
      server_sequence INTEGER NOT NULL CHECK (server_sequence >= 1),
      outcome TEXT NOT NULL CHECK (outcome IN ('applied', 'unknown_recorded')),
      payload_json TEXT NOT NULL CHECK (length(payload_json) > 0),
      recorded_at_ms INTEGER NOT NULL CHECK (recorded_at_ms >= 0),
      CONSTRAINT applied_events_conversation_fk
        FOREIGN KEY (conversation_id) REFERENCES conversations(id)
        ON UPDATE RESTRICT ON DELETE RESTRICT,
      CONSTRAINT applied_events_sequence_unique UNIQUE (conversation_id, server_sequence)
    );`,
    `CREATE TABLE sync_cursors (
      conversation_id TEXT PRIMARY KEY NOT NULL,
      cursor TEXT NOT NULL CHECK (length(cursor) > 0),
      server_sequence INTEGER NOT NULL CHECK (server_sequence >= 0),
      updated_at_ms INTEGER NOT NULL CHECK (updated_at_ms >= 0),
      CONSTRAINT sync_cursors_conversation_fk
        FOREIGN KEY (conversation_id) REFERENCES conversations(id)
        ON UPDATE RESTRICT ON DELETE RESTRICT
    );`,
  ],
};
