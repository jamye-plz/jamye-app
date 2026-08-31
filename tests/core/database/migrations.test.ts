type SqliteValue = string | number | null;

type SqliteDatabase = {
  execAsync: (statement: string) => Promise<void>;
  getAllAsync: <Row extends Record<string, SqliteValue>>(
    statement: string,
  ) => Promise<Row[]>;
  getFirstAsync: <Row extends Record<string, SqliteValue>>(
    statement: string,
  ) => Promise<Row | null>;
  withExclusiveTransactionAsync: (
    operation: (transaction: SqliteDatabase) => Promise<void>,
  ) => Promise<void>;
};

type Migration = Readonly<{
  name: string;
  statements: readonly string[];
  version: number;
}>;

type MigrationModule = {
  migrations?: unknown;
  runMigrations?: unknown;
};

type RunMigrations = (
  database: SqliteDatabase,
  migrations?: readonly Migration[],
) => Promise<void>;

type MigrationEvent = Readonly<{
  kind:
    | "exec"
    | "query"
    | "transaction-begin"
    | "transaction-commit"
    | "transaction-rollback";
  statement?: string;
}>;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isMissingModuleError(error: unknown): boolean {
  return (
    isRecord(error) &&
    (error.code === "MODULE_NOT_FOUND" ||
      (typeof error.message === "string" &&
        error.message.includes("Cannot find module")))
  );
}

function loadMigrationModule(): {
  migrations: readonly Migration[];
  runMigrations: RunMigrations;
} {
  let loaded: MigrationModule;
  try {
    loaded = jest.requireActual<MigrationModule>(
      "../../../src/core/database/migrate",
    );
  } catch (error) {
    if (isMissingModuleError(error)) {
      throw new Error(
        "M4-DB-1 implementation missing: src/core/database/migrate.ts must export migrations and runMigrations().",
      );
    }
    throw error;
  }

  if (
    !Array.isArray(loaded.migrations) ||
    typeof loaded.runMigrations !== "function"
  ) {
    throw new Error(
      "M4-DB-1 implementation incomplete: migrate.ts must expose the ordered migration registry and runMigrations(database, migrations?).",
    );
  }

  return {
    migrations: loaded.migrations as readonly Migration[],
    runMigrations: loaded.runMigrations as RunMigrations,
  };
}

class RecordingSqliteDatabase implements SqliteDatabase {
  readonly committedStatements: string[] = [];
  readonly events: MigrationEvent[] = [];
  readonly queriedStatements: string[] = [];
  readonly transactions: ("commit" | "rollback")[] = [];
  private failWhen?: (statement: string) => boolean;
  private pendingStatements?: string[];
  userVersion = 0;

  failOn(predicate: (statement: string) => boolean): void {
    this.failWhen = predicate;
  }

  async execAsync(statement: string): Promise<void> {
    if (this.failWhen?.(statement)) {
      throw new Error("synthetic migration failure");
    }

    const target = this.pendingStatements ?? this.committedStatements;
    target.push(statement);
    this.events.push({ kind: "exec", statement });

    const versionMatch = statement.match(/PRAGMA\s+user_version\s*=\s*(\d+)/i);
    if (versionMatch?.[1]) {
      this.userVersion = Number(versionMatch[1]);
    }
  }

  async getAllAsync<Row extends Record<string, SqliteValue>>(
    statement: string,
  ): Promise<Row[]> {
    this.queriedStatements.push(statement);
    this.events.push({ kind: "query", statement });
    if (/PRAGMA\s+foreign_key_check/i.test(statement)) {
      return [];
    }
    throw new Error(`Unexpected getAllAsync statement: ${statement}`);
  }

  async getFirstAsync<Row extends Record<string, SqliteValue>>(
    statement: string,
  ): Promise<Row | null> {
    this.queriedStatements.push(statement);
    this.events.push({ kind: "query", statement });
    if (/PRAGMA\s+user_version/i.test(statement)) {
      return { user_version: this.userVersion } as unknown as Row;
    }
    throw new Error(`Unexpected getFirstAsync statement: ${statement}`);
  }

  async withExclusiveTransactionAsync(
    operation: (transaction: SqliteDatabase) => Promise<void>,
  ): Promise<void> {
    const versionBefore = this.userVersion;
    this.pendingStatements = [];
    this.events.push({ kind: "transaction-begin" });

    try {
      await operation(this);
      const pendingStatements = this.pendingStatements;
      if (!pendingStatements) {
        throw new Error(
          "Migration transaction did not retain its statement log.",
        );
      }
      this.committedStatements.push(...pendingStatements);
      this.transactions.push("commit");
      this.events.push({ kind: "transaction-commit" });
    } catch (error) {
      this.userVersion = versionBefore;
      this.transactions.push("rollback");
      this.events.push({ kind: "transaction-rollback" });
      throw error;
    } finally {
      this.pendingStatements = undefined;
    }
  }
}

function schemaStatements(database: RecordingSqliteDatabase): string {
  return database.committedStatements
    .filter((statement) => /CREATE\s+(?:TABLE|INDEX)/i.test(statement))
    .join("\n");
}

function tableBody(schema: string, tableName: string): string {
  const match = schema.match(
    new RegExp(`CREATE\\s+TABLE\\s+${tableName}\\s*\\((.*?)\\);`, "is"),
  );
  if (!match?.[1]) {
    throw new Error(`Expected CREATE TABLE body for ${tableName}.`);
  }
  return match[1];
}

function eventIndex(
  events: readonly MigrationEvent[],
  predicate: (event: MigrationEvent) => boolean,
): number {
  const index = events.findIndex(predicate);
  if (index < 0) {
    throw new Error("Expected migration event was not recorded.");
  }
  return index;
}

describe("M4-DB-1 deterministic SQLite migration contract", () => {
  test("configures WAL and foreign keys, then advances native user_version from 0 to 1", async () => {
    const { migrations, runMigrations } = loadMigrationModule();
    const database = new RecordingSqliteDatabase();

    await runMigrations(database, migrations);

    expect(database.userVersion).toBe(1);
    expect(database.transactions).toEqual(["commit"]);
    expect(database.committedStatements.join("\n")).toMatch(
      /PRAGMA\s+journal_mode\s*=\s*WAL/i,
    );
    expect(database.committedStatements.join("\n")).toMatch(
      /PRAGMA\s+foreign_keys\s*=\s*ON/i,
    );
    expect(database.queriedStatements.join("\n")).toMatch(
      /PRAGMA\s+foreign_key_check/i,
    );

    const transactionBegin = eventIndex(
      database.events,
      (event) => event.kind === "transaction-begin",
    );
    const transactionCommit = eventIndex(
      database.events,
      (event) => event.kind === "transaction-commit",
    );
    const wal = eventIndex(
      database.events,
      (event) =>
        event.kind === "exec" &&
        /PRAGMA\s+journal_mode\s*=\s*WAL/i.test(event.statement ?? ""),
    );
    const foreignKeys = eventIndex(
      database.events,
      (event) =>
        event.kind === "exec" &&
        /PRAGMA\s+foreign_keys\s*=\s*ON/i.test(event.statement ?? ""),
    );
    const foreignKeyCheck = eventIndex(
      database.events,
      (event) =>
        event.kind === "query" &&
        /PRAGMA\s+foreign_key_check/i.test(event.statement ?? ""),
    );
    const userVersion = eventIndex(
      database.events,
      (event) =>
        event.kind === "exec" &&
        /PRAGMA\s+user_version\s*=\s*1/i.test(event.statement ?? ""),
    );
    const transactionSqlMutations = database.events
      .slice(transactionBegin + 1, transactionCommit)
      .filter((event) => event.kind === "exec");

    expect(wal).toBeLessThan(transactionBegin);
    expect(foreignKeys).toBeLessThan(transactionBegin);
    expect(foreignKeyCheck).toBeGreaterThan(transactionBegin);
    expect(foreignKeyCheck).toBeLessThan(userVersion);
    expect(transactionSqlMutations.at(-1)?.statement).toMatch(
      /PRAGMA\s+user_version\s*=\s*1/i,
    );
    expect(database.events[transactionCommit - 1]?.kind).toBe("exec");
    expect(database.events[transactionCommit - 1]?.statement).toMatch(
      /PRAGMA\s+user_version\s*=\s*1/i,
    );
  });

  test("is a no-op after version 1 instead of replaying DDL or advancing the version again", async () => {
    const { migrations, runMigrations } = loadMigrationModule();
    const database = new RecordingSqliteDatabase();

    await runMigrations(database, migrations);
    const beforeRetry = database.committedStatements.length;
    const transactionsBeforeRetry = database.transactions.length;

    await runMigrations(database, migrations);

    const retryStatements = database.committedStatements.slice(beforeRetry);
    expect(database.userVersion).toBe(1);
    expect(database.transactions).toHaveLength(transactionsBeforeRetry);
    expect(retryStatements.join("\n")).not.toMatch(/CREATE\s+(?:TABLE|INDEX)/i);
    expect(retryStatements.join("\n")).not.toMatch(
      /PRAGMA\s+user_version\s*=/i,
    );
  });

  test("creates exactly the five approved tables with their relational and domain constraints", async () => {
    const { migrations, runMigrations } = loadMigrationModule();
    const database = new RecordingSqliteDatabase();

    await runMigrations(database, migrations);

    const schema = schemaStatements(database);
    const conversations = tableBody(schema, "conversations");
    const messages = tableBody(schema, "messages");
    const outboxCommands = tableBody(schema, "outbox_commands");
    const appliedEvents = tableBody(schema, "applied_events");
    const syncCursors = tableBody(schema, "sync_cursors");
    const tables = [...schema.matchAll(/CREATE\s+TABLE\s+([a-z_]+)/gi)]
      .map((match) => match[1])
      .sort();

    expect(tables).toEqual([
      "applied_events",
      "conversations",
      "messages",
      "outbox_commands",
      "sync_cursors",
    ]);
    expect(schema).not.toMatch(/CREATE\s+TABLE\s+schema_version/i);
    expect(schema).toMatch(
      /CREATE\s+TABLE\s+conversations[\s\S]*id\s+TEXT\s+PRIMARY\s+KEY\s+NOT\s+NULL/i,
    );
    expect(schema).toMatch(
      /CREATE\s+TABLE\s+messages[\s\S]*local_id\s+TEXT\s+PRIMARY\s+KEY\s+NOT\s+NULL/i,
    );
    expect(schema).toMatch(
      /CREATE\s+TABLE\s+outbox_commands[\s\S]*command_id\s+TEXT\s+PRIMARY\s+KEY\s+NOT\s+NULL/i,
    );
    expect(schema).toMatch(
      /CREATE\s+TABLE\s+applied_events[\s\S]*event_id\s+TEXT\s+PRIMARY\s+KEY\s+NOT\s+NULL/i,
    );
    expect(schema).toMatch(
      /CREATE\s+TABLE\s+sync_cursors[\s\S]*conversation_id\s+TEXT\s+PRIMARY\s+KEY\s+NOT\s+NULL/i,
    );
    expect(schema).toMatch(
      /conversations[\s\S]*kind\s+TEXT\s+NOT\s+NULL\s+CHECK\s*\(\s*kind\s*=\s*'fixture'\s*\)/i,
    );
    expect(schema).toMatch(
      /conversations[\s\S]*title\s+TEXT\s+NOT\s+NULL\s+CHECK\s*\(\s*length\s*\(\s*title\s*\)\s*>\s*0\s*\)/i,
    );
    expect(schema).toMatch(
      /conversations[\s\S]*updated_at_ms\s+INTEGER\s+NOT\s+NULL\s+CHECK\s*\(\s*updated_at_ms\s*>=\s*0\s*\)/i,
    );
    expect(schema).toMatch(
      /messages[\s\S]*conversation_id\s+TEXT\s+NOT\s+NULL[\s\S]*client_msg_id\s+TEXT\s+CHECK\s*\(\s*client_msg_id\s+IS\s+NULL\s+OR\s+length\s*\(\s*client_msg_id\s*\)\s*>\s*0\s*\)/i,
    );
    expect(schema).toMatch(
      /messages[\s\S]*event_id\s+TEXT\s+CHECK\s*\(\s*event_id\s+IS\s+NULL\s+OR\s+length\s*\(\s*event_id\s*\)\s*>\s*0\s*\)/i,
    );
    expect(schema).toMatch(
      /messages[\s\S]*sender_id\s+TEXT\s+NOT\s+NULL\s+CHECK\s*\(\s*length\s*\(\s*sender_id\s*\)\s*>\s*0\s*\)[\s\S]*body\s+TEXT\s+NOT\s+NULL\s+CHECK\s*\(\s*length\s*\(\s*body\s*\)\s*>\s*0\s*\)/i,
    );
    expect(schema).toMatch(
      /messages[\s\S]*created_at_ms\s+INTEGER\s+NOT\s+NULL\s+CHECK\s*\(\s*created_at_ms\s*>=\s*0\s*\)[\s\S]*server_sequence\s+INTEGER\s+CHECK\s*\(\s*server_sequence\s+IS\s+NULL\s+OR\s+server_sequence\s*>=\s*1\s*\)/i,
    );
    expect(schema).toMatch(
      /CONSTRAINT\s+messages_conversation_fk\s+FOREIGN\s+KEY\s*\(\s*conversation_id\s*\)[\s\S]*REFERENCES\s+conversations\s*\(\s*id\s*\)/i,
    );
    expect(schema).toMatch(
      /messages[\s\S]*FOREIGN\s+KEY\s*\(\s*conversation_id\s*\)[\s\S]*ON\s+UPDATE\s+RESTRICT\s+ON\s+DELETE\s+RESTRICT/i,
    );
    expect(schema).toMatch(
      /outbox_commands[\s\S]*FOREIGN\s+KEY\s*\(\s*conversation_id\s*,\s*client_msg_id\s*\)[\s\S]*REFERENCES\s+messages\s*\(\s*conversation_id\s*,\s*client_msg_id\s*\)/i,
    );
    expect(schema).toMatch(
      /CONSTRAINT\s+applied_events_conversation_fk\s+FOREIGN\s+KEY\s*\(\s*conversation_id\s*\)[\s\S]*REFERENCES\s+conversations\s*\(\s*id\s*\)[\s\S]*ON\s+UPDATE\s+RESTRICT\s+ON\s+DELETE\s+RESTRICT/i,
    );
    expect(schema).toMatch(
      /CONSTRAINT\s+sync_cursors_conversation_fk\s+FOREIGN\s+KEY\s*\(\s*conversation_id\s*\)[\s\S]*REFERENCES\s+conversations\s*\(\s*id\s*\)[\s\S]*ON\s+UPDATE\s+RESTRICT\s+ON\s+DELETE\s+RESTRICT/i,
    );
    expect(schema).toMatch(
      /CONSTRAINT\s+messages_client_msg_id_unique\s+UNIQUE\s*\(\s*client_msg_id\s*\)/i,
    );
    expect(schema).toMatch(
      /CONSTRAINT\s+messages_event_id_unique\s+UNIQUE\s*\(\s*event_id\s*\)/i,
    );
    expect(schema).toMatch(
      /CONSTRAINT\s+messages_conversation_client_unique\s+UNIQUE\s*\(\s*conversation_id\s*,\s*client_msg_id\s*\)/i,
    );
    expect(schema).toMatch(
      /CONSTRAINT\s+applied_events_sequence_unique\s+UNIQUE\s*\(\s*conversation_id\s*,\s*server_sequence\s*\)/i,
    );
    expect(schema).toMatch(
      /outbox_commands[\s\S]*conversation_id\s+TEXT\s+NOT\s+NULL[\s\S]*client_msg_id\s+TEXT\s+NOT\s+NULL\s+CHECK\s*\(\s*length\s*\(\s*client_msg_id\s*\)\s*>\s*0\s*\)/i,
    );
    expect(schema).toMatch(
      /outbox_commands[\s\S]*command_type\s+TEXT\s+NOT\s+NULL\s+CHECK\s*\(\s*command_type\s*=\s*'message\.create'\s*\)/i,
    );
    expect(schema).toMatch(
      /outbox_commands[\s\S]*body\s+TEXT\s+NOT\s+NULL\s+CHECK\s*\(\s*length\s*\(\s*body\s*\)\s*>\s*0\s*\)[\s\S]*created_at_ms\s+INTEGER\s+NOT\s+NULL\s+CHECK\s*\(\s*created_at_ms\s*>=\s*0\s*\)/i,
    );
    expect(schema).toMatch(
      /CONSTRAINT\s+outbox_client_msg_id_unique\s+UNIQUE\s*\(\s*client_msg_id\s*\)/i,
    );
    expect(schema).toMatch(
      /CONSTRAINT\s+outbox_message_fk\s+FOREIGN\s+KEY\s*\(\s*conversation_id\s*,\s*client_msg_id\s*\)[\s\S]*ON\s+UPDATE\s+RESTRICT\s+ON\s+DELETE\s+RESTRICT/i,
    );
    expect(schema).toMatch(
      /CHECK\s*\(\s*status\s+IN\s*\(\s*'pending'\s*,\s*'sent'\s*,\s*'failed'\s*\)\s*\)/i,
    );
    expect(schema).toMatch(
      /CHECK\s*\(\s*state\s+IN\s*\(\s*'queued'\s*,\s*'in_flight'\s*,\s*'acked'\s*,\s*'failed'\s*\)\s*\)/i,
    );
    expect(schema).toMatch(
      /CHECK\s*\(\s*status\s*<>\s*'sent'\s+OR\s*\(\s*event_id\s+IS\s+NOT\s+NULL\s+AND\s+server_sequence\s+IS\s+NOT\s+NULL\s*\)\s*\)/i,
    );
    expect(schema).toMatch(
      /CHECK\s*\(\s*outcome\s+IN\s*\(\s*'applied'\s*,\s*'unknown_recorded'\s*\)\s*\)/i,
    );
    expect(schema).toMatch(/CHECK\s*\(\s*server_sequence\s*>=\s*0\s*\)/i);
    expect(schema).toMatch(
      /applied_events[\s\S]*conversation_id\s+TEXT\s+NOT\s+NULL[\s\S]*type\s+TEXT\s+NOT\s+NULL\s+CHECK\s*\(\s*length\s*\(\s*type\s*\)\s*>\s*0\s*\)/i,
    );
    expect(schema).toMatch(
      /applied_events[\s\S]*server_sequence\s+INTEGER\s+NOT\s+NULL\s+CHECK\s*\(\s*server_sequence\s*>=\s*1\s*\)[\s\S]*payload_json\s+TEXT\s+NOT\s+NULL\s+CHECK\s*\(\s*length\s*\(\s*payload_json\s*\)\s*>\s*0\s*\)[\s\S]*recorded_at_ms\s+INTEGER\s+NOT\s+NULL\s+CHECK\s*\(\s*recorded_at_ms\s*>=\s*0\s*\)/i,
    );
    expect(schema).toMatch(
      /sync_cursors[\s\S]*cursor\s+TEXT\s+NOT\s+NULL\s+CHECK\s*\(\s*length\s*\(\s*cursor\s*\)\s*>\s*0\s*\)[\s\S]*server_sequence\s+INTEGER\s+NOT\s+NULL\s+CHECK\s*\(\s*server_sequence\s*>=\s*0\s*\)[\s\S]*updated_at_ms\s+INTEGER\s+NOT\s+NULL\s+CHECK\s*\(\s*updated_at_ms\s*>=\s*0\s*\)/i,
    );
    expect(schema).toMatch(
      /CREATE\s+INDEX\s+messages_conversation_created_idx\s+ON\s+messages\s*\(\s*conversation_id\s*,\s*created_at_ms\s*,\s*local_id\s*\)/i,
    );
    expect(schema).toMatch(
      /CREATE\s+INDEX\s+outbox_state_created_idx\s+ON\s+outbox_commands\s*\(\s*state\s*,\s*created_at_ms\s*,\s*command_id\s*\)/i,
    );
    const explicitIndexes = [
      ...schema.matchAll(/CREATE\s+INDEX\s+([a-z_]+)/gi),
    ].map((match) => match[1]);
    expect(explicitIndexes).toEqual([
      "messages_conversation_created_idx",
      "outbox_state_created_idx",
    ]);

    expect(conversations).toMatch(
      /id\s+TEXT\s+PRIMARY\s+KEY\s+NOT\s+NULL\s+CHECK\s*\(\s*length\s*\(\s*id\s*\)\s*>\s*0\s*\)/i,
    );
    expect(conversations).toMatch(
      /kind\s+TEXT\s+NOT\s+NULL\s+CHECK\s*\(\s*kind\s*=\s*'fixture'\s*\)/i,
    );
    expect(conversations).toMatch(
      /title\s+TEXT\s+NOT\s+NULL\s+CHECK\s*\(\s*length\s*\(\s*title\s*\)\s*>\s*0\s*\)/i,
    );
    expect(conversations).toMatch(
      /updated_at_ms\s+INTEGER\s+NOT\s+NULL\s+CHECK\s*\(\s*updated_at_ms\s*>=\s*0\s*\)/i,
    );

    expect(messages).toMatch(
      /local_id\s+TEXT\s+PRIMARY\s+KEY\s+NOT\s+NULL\s+CHECK\s*\(\s*length\s*\(\s*local_id\s*\)\s*>\s*0\s*\)/i,
    );
    expect(messages).toMatch(
      /conversation_id\s+TEXT\s+NOT\s+NULL[\s\S]*CONSTRAINT\s+messages_conversation_fk\s+FOREIGN\s+KEY\s*\(\s*conversation_id\s*\)[\s\S]*ON\s+UPDATE\s+RESTRICT\s+ON\s+DELETE\s+RESTRICT/i,
    );
    expect(messages).toMatch(
      /client_msg_id\s+TEXT\s+CHECK\s*\(\s*client_msg_id\s+IS\s+NULL\s+OR\s+length\s*\(\s*client_msg_id\s*\)\s*>\s*0\s*\)[\s\S]*event_id\s+TEXT\s+CHECK\s*\(\s*event_id\s+IS\s+NULL\s+OR\s+length\s*\(\s*event_id\s*\)\s*>\s*0\s*\)/i,
    );
    expect(messages).toMatch(
      /sender_id\s+TEXT\s+NOT\s+NULL\s+CHECK\s*\(\s*length\s*\(\s*sender_id\s*\)\s*>\s*0\s*\)[\s\S]*body\s+TEXT\s+NOT\s+NULL\s+CHECK\s*\(\s*length\s*\(\s*body\s*\)\s*>\s*0\s*\)[\s\S]*status\s+TEXT\s+NOT\s+NULL\s+CHECK\s*\(\s*status\s+IN\s*\(\s*'pending'\s*,\s*'sent'\s*,\s*'failed'\s*\)\s*\)/i,
    );
    expect(messages).toMatch(
      /created_at_ms\s+INTEGER\s+NOT\s+NULL\s+CHECK\s*\(\s*created_at_ms\s*>=\s*0\s*\)[\s\S]*server_sequence\s+INTEGER\s+CHECK\s*\(\s*server_sequence\s+IS\s+NULL\s+OR\s+server_sequence\s*>=\s*1\s*\)/i,
    );
    expect(messages).toMatch(
      /CONSTRAINT\s+messages_client_msg_id_unique\s+UNIQUE\s*\(\s*client_msg_id\s*\)[\s\S]*CONSTRAINT\s+messages_event_id_unique\s+UNIQUE\s*\(\s*event_id\s*\)[\s\S]*CONSTRAINT\s+messages_conversation_client_unique\s+UNIQUE\s*\(\s*conversation_id\s*,\s*client_msg_id\s*\)/i,
    );
    expect(messages).toMatch(
      /CONSTRAINT\s+messages_sent_has_canonical_identity\s+CHECK\s*\(\s*status\s*<>\s*'sent'\s+OR\s*\(\s*event_id\s+IS\s+NOT\s+NULL\s+AND\s+server_sequence\s+IS\s+NOT\s+NULL\s*\)\s*\)/i,
    );

    expect(outboxCommands).toMatch(
      /command_id\s+TEXT\s+PRIMARY\s+KEY\s+NOT\s+NULL\s+CHECK\s*\(\s*length\s*\(\s*command_id\s*\)\s*>\s*0\s*\)/i,
    );
    expect(outboxCommands).toMatch(
      /command_type\s+TEXT\s+NOT\s+NULL\s+CHECK\s*\(\s*command_type\s*=\s*'message\.create'\s*\)/i,
    );
    expect(outboxCommands).toMatch(
      /conversation_id\s+TEXT\s+NOT\s+NULL[\s\S]*client_msg_id\s+TEXT\s+NOT\s+NULL\s+CHECK\s*\(\s*length\s*\(\s*client_msg_id\s*\)\s*>\s*0\s*\)[\s\S]*body\s+TEXT\s+NOT\s+NULL\s+CHECK\s*\(\s*length\s*\(\s*body\s*\)\s*>\s*0\s*\)/i,
    );
    expect(outboxCommands).toMatch(
      /state\s+TEXT\s+NOT\s+NULL\s+CHECK\s*\(\s*state\s+IN\s*\(\s*'queued'\s*,\s*'in_flight'\s*,\s*'acked'\s*,\s*'failed'\s*\)\s*\)[\s\S]*created_at_ms\s+INTEGER\s+NOT\s+NULL\s+CHECK\s*\(\s*created_at_ms\s*>=\s*0\s*\)/i,
    );
    expect(outboxCommands).toMatch(
      /CONSTRAINT\s+outbox_client_msg_id_unique\s+UNIQUE\s*\(\s*client_msg_id\s*\)[\s\S]*CONSTRAINT\s+outbox_message_fk\s+FOREIGN\s+KEY\s*\(\s*conversation_id\s*,\s*client_msg_id\s*\)[\s\S]*ON\s+UPDATE\s+RESTRICT\s+ON\s+DELETE\s+RESTRICT/i,
    );

    expect(appliedEvents).toMatch(
      /event_id\s+TEXT\s+PRIMARY\s+KEY\s+NOT\s+NULL\s+CHECK\s*\(\s*length\s*\(\s*event_id\s*\)\s*>\s*0\s*\)/i,
    );
    expect(appliedEvents).toMatch(
      /CONSTRAINT\s+applied_events_conversation_fk\s+FOREIGN\s+KEY\s*\(\s*conversation_id\s*\)[\s\S]*ON\s+UPDATE\s+RESTRICT\s+ON\s+DELETE\s+RESTRICT[\s\S]*CONSTRAINT\s+applied_events_sequence_unique\s+UNIQUE\s*\(\s*conversation_id\s*,\s*server_sequence\s*\)/i,
    );
    expect(appliedEvents).toMatch(
      /outcome\s+TEXT\s+NOT\s+NULL\s+CHECK\s*\(\s*outcome\s+IN\s*\(\s*'applied'\s*,\s*'unknown_recorded'\s*\)\s*\)/i,
    );
    expect(appliedEvents).toMatch(
      /conversation_id\s+TEXT\s+NOT\s+NULL[\s\S]*type\s+TEXT\s+NOT\s+NULL\s+CHECK\s*\(\s*length\s*\(\s*type\s*\)\s*>\s*0\s*\)[\s\S]*server_sequence\s+INTEGER\s+NOT\s+NULL\s+CHECK\s*\(\s*server_sequence\s*>=\s*1\s*\)/i,
    );
    expect(appliedEvents).toMatch(
      /payload_json\s+TEXT\s+NOT\s+NULL\s+CHECK\s*\(\s*length\s*\(\s*payload_json\s*\)\s*>\s*0\s*\)[\s\S]*recorded_at_ms\s+INTEGER\s+NOT\s+NULL\s+CHECK\s*\(\s*recorded_at_ms\s*>=\s*0\s*\)/i,
    );

    expect(syncCursors).toMatch(
      /conversation_id\s+TEXT\s+PRIMARY\s+KEY\s+NOT\s+NULL[\s\S]*CONSTRAINT\s+sync_cursors_conversation_fk\s+FOREIGN\s+KEY\s*\(\s*conversation_id\s*\)[\s\S]*ON\s+UPDATE\s+RESTRICT\s+ON\s+DELETE\s+RESTRICT/i,
    );
    expect(syncCursors).toMatch(
      /cursor\s+TEXT\s+NOT\s+NULL\s+CHECK\s*\(\s*length\s*\(\s*cursor\s*\)\s*>\s*0\s*\)[\s\S]*server_sequence\s+INTEGER\s+NOT\s+NULL\s+CHECK\s*\(\s*server_sequence\s*>=\s*0\s*\)/i,
    );
    expect(syncCursors).toMatch(
      /updated_at_ms\s+INTEGER\s+NOT\s+NULL\s+CHECK\s*\(\s*updated_at_ms\s*>=\s*0\s*\)/i,
    );
  });

  test("rolls back failed migration DDL and leaves user_version at the prior value", async () => {
    const { runMigrations } = loadMigrationModule();
    const database = new RecordingSqliteDatabase();
    database.failOn((statement) =>
      /CREATE\s+TABLE\s+messages/i.test(statement),
    );
    const failingMigration: Migration = {
      version: 1,
      name: "synthetic-failure",
      statements: [
        "CREATE TABLE conversations (id TEXT PRIMARY KEY)",
        "CREATE TABLE messages (local_id TEXT PRIMARY KEY)",
      ],
    };

    await expect(runMigrations(database, [failingMigration])).rejects.toThrow(
      "synthetic migration failure",
    );

    expect(database.userVersion).toBe(0);
    expect(database.transactions).toEqual(["rollback"]);
    expect(database.committedStatements.join("\n")).not.toMatch(
      /CREATE\s+TABLE/i,
    );
    expect(database.committedStatements.join("\n")).not.toMatch(
      /PRAGMA\s+user_version\s*=/i,
    );
  });

  test("rejects a device version newer than the migration registry without schema or version mutation", async () => {
    const { migrations, runMigrations } = loadMigrationModule();
    const database = new RecordingSqliteDatabase();
    database.userVersion = 2;
    const statementsBeforeAttempt = database.committedStatements.length;

    await expect(runMigrations(database, migrations)).rejects.toThrow(
      /unsupported|newer|version/i,
    );

    const attemptStatements = database.committedStatements.slice(
      statementsBeforeAttempt,
    );
    expect(database.userVersion).toBe(2);
    expect(database.transactions).toEqual([]);
    expect(attemptStatements.join("\n")).not.toMatch(
      /CREATE\s+(?:TABLE|INDEX)|PRAGMA\s+user_version\s*=/i,
    );
  });

  test("rejects duplicate and non-contiguous migration registries before any migration transaction", async () => {
    const { runMigrations } = loadMigrationModule();
    const duplicateDatabase = new RecordingSqliteDatabase();
    const nonContiguousDatabase = new RecordingSqliteDatabase();
    const duplicateRegistry: readonly Migration[] = [
      {
        name: "first",
        statements: ["CREATE TABLE first_table (id TEXT)"],
        version: 1,
      },
      {
        name: "duplicate",
        statements: ["CREATE TABLE duplicate_table (id TEXT)"],
        version: 1,
      },
    ];
    const nonContiguousRegistry: readonly Migration[] = [
      {
        name: "skipped-version",
        statements: ["CREATE TABLE skipped_table (id TEXT)"],
        version: 2,
      },
    ];

    await expect(
      runMigrations(duplicateDatabase, duplicateRegistry),
    ).rejects.toThrow(/duplicate|registry|version/i);
    await expect(
      runMigrations(nonContiguousDatabase, nonContiguousRegistry),
    ).rejects.toThrow(/contiguous|registry|version/i);

    expect(duplicateDatabase.transactions).toEqual([]);
    expect(nonContiguousDatabase.transactions).toEqual([]);
    expect(duplicateDatabase.committedStatements.join("\n")).not.toMatch(
      /CREATE\s+(?:TABLE|INDEX)|PRAGMA\s+user_version\s*=/i,
    );
    expect(nonContiguousDatabase.committedStatements.join("\n")).not.toMatch(
      /CREATE\s+(?:TABLE|INDEX)|PRAGMA\s+user_version\s*=/i,
    );
  });
});
