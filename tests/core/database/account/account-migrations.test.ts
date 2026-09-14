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

type MigrateModule = { runMigrations?: unknown };
type AccountMigrationsModule = { accountMigrations?: unknown };
type FixtureMigrationsModule = { migrations?: unknown };

type RunMigrations = (
  database: SqliteDatabase,
  migrations?: readonly Migration[],
) => Promise<void>;

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

function loadRunMigrations(): RunMigrations {
  let module: MigrateModule;
  try {
    module = jest.requireActual<MigrateModule>(
      "../../../../src/core/database/migrate",
    );
  } catch (error) {
    if (isMissingModuleError(error)) {
      throw new Error("Existing runMigrations() is unexpectedly missing.");
    }
    throw error;
  }
  if (typeof module.runMigrations !== "function") {
    throw new Error("Existing runMigrations() export is unexpectedly missing.");
  }
  return module.runMigrations as RunMigrations;
}

function loadAccountMigrations(): readonly Migration[] {
  let module: AccountMigrationsModule;
  try {
    module = jest.requireActual<AccountMigrationsModule>(
      "../../../../src/core/database/account/migrations",
    );
  } catch (error) {
    if (isMissingModuleError(error)) {
      throw new Error(
        "M6-03 implementation missing: src/core/database/account/migrations/index.ts must export accountMigrations.",
      );
    }
    throw error;
  }
  if (!Array.isArray(module.accountMigrations)) {
    throw new Error(
      "M6-03 account migrations contract is incomplete: accountMigrations must be an ordered registry array.",
    );
  }
  return module.accountMigrations as readonly Migration[];
}

function loadFixtureMigrations(): readonly Migration[] {
  const module = jest.requireActual<FixtureMigrationsModule>(
    "../../../../src/core/database/migrations",
  );
  return module.migrations as readonly Migration[];
}

class RecordingSqliteDatabase implements SqliteDatabase {
  readonly committedStatements: string[] = [];
  private pendingStatements?: string[];
  userVersion = 0;

  async execAsync(statement: string): Promise<void> {
    const target = this.pendingStatements ?? this.committedStatements;
    target.push(statement);
    const versionMatch = statement.match(/PRAGMA\s+user_version\s*=\s*(\d+)/i);
    if (versionMatch?.[1]) {
      this.userVersion = Number(versionMatch[1]);
    }
  }

  async getAllAsync<Row extends Record<string, SqliteValue>>(
    statement: string,
  ): Promise<Row[]> {
    if (/PRAGMA\s+foreign_key_check/i.test(statement)) return [];
    throw new Error(`Unexpected getAllAsync statement: ${statement}`);
  }

  async getFirstAsync<Row extends Record<string, SqliteValue>>(
    statement: string,
  ): Promise<Row | null> {
    if (/PRAGMA\s+user_version/i.test(statement)) {
      return { user_version: this.userVersion } as unknown as Row;
    }
    throw new Error(`Unexpected getFirstAsync statement: ${statement}`);
  }

  async withExclusiveTransactionAsync(
    operation: (transaction: SqliteDatabase) => Promise<void>,
  ): Promise<void> {
    this.pendingStatements = [];
    await operation(this);
    this.committedStatements.push(...this.pendingStatements);
    this.pendingStatements = undefined;
  }
}

function schemaOf(database: RecordingSqliteDatabase): string {
  return database.committedStatements
    .filter((statement) =>
      /CREATE\s+(?:TABLE|INDEX|TRIGGER)|ALTER\s+TABLE/i.test(statement),
    )
    .join("\n");
}

function tableNames(schema: string): string[] {
  return [
    ...new Set(
      [...schema.matchAll(/CREATE\s+TABLE\s+([a-z_]+)/gi)].map(
        (match) => match[1] as string,
      ),
    ),
  ].sort();
}

describe("M11 account v5 migration registry", () => {
  test("retains scope_metadata and adds only account-scoped connected chat tables", async () => {
    const runMigrations = loadRunMigrations();
    const accountMigrations = loadAccountMigrations();
    const database = new RecordingSqliteDatabase();

    await runMigrations(database, accountMigrations);

    expect(database.userVersion).toBe(5);
    const schema = schemaOf(database);
    expect(tableNames(schema)).toEqual([
      "connected_chat_applied_events",
      "connected_chat_event_checkpoints",
      "connected_chat_messages",
      "connected_chat_outbox_commands",
      "connected_chat_reconciliation_scopes",
      "connected_chatrooms",
      "connected_topic_queries",
      "connected_topics",
      "scope_metadata",
    ]);
    expect(schema).toMatch(
      /singleton\s+INTEGER\s+PRIMARY\s+KEY\s+NOT\s+NULL\s+CHECK\s*\(\s*singleton\s*=\s*1\s*\)/i,
    );
    expect(schema).toMatch(
      /origin\s+TEXT\s+NOT\s+NULL\s+CHECK\s*\(\s*length\s*\(\s*origin\s*\)\s*>\s*0\s*\)/i,
    );
    expect(schema).toMatch(
      /user_id\s+TEXT\s+NOT\s+NULL\s+CHECK\s*\(\s*length\s*\(\s*user_id\s*\)\s*>\s*0\s*\)/i,
    );
    expect(schema).toMatch(
      /schema_version\s+INTEGER\s+NOT\s+NULL\s+CHECK\s*\(\s*schema_version\s*>=\s*1\s*\)/i,
    );
    expect(schema).not.toMatch(
      /CREATE\s+TABLE\s+(?:applied_events|sync_cursors)\b/i,
    );
    expect(schema).toMatch(/server_message_id\s+TEXT\s+UNIQUE/i);
    expect(schema).toMatch(/connected_chat_messages_room_window_idx/i);
    expect(schema).toMatch(/connected_chatrooms_group_window_idx/i);
    expect(schema).toMatch(/pending_media_json\s+TEXT\s+NOT\s+NULL/i);
    expect(schema).toMatch(/media_upload_ids_json\s+TEXT\s+NOT\s+NULL/i);
    expect(schema).toMatch(/connected_chat_outbox_immutable_intent/i);
  });

  test("is a no-op after version 5 instead of replaying DDL", async () => {
    const runMigrations = loadRunMigrations();
    const accountMigrations = loadAccountMigrations();
    const database = new RecordingSqliteDatabase();

    await runMigrations(database, accountMigrations);
    const beforeRetry = database.committedStatements.length;
    await runMigrations(database, accountMigrations);

    const retryStatements = database.committedStatements.slice(beforeRetry);
    expect(retryStatements.join("\n")).not.toMatch(/CREATE\s+(?:TABLE|INDEX)/i);
    expect(retryStatements.join("\n")).not.toMatch(
      /PRAGMA\s+user_version\s*=/i,
    );
    expect(database.userVersion).toBe(5);
  });

  test("does not modify the preserved fixture migration registry or its five-table schema", async () => {
    const runMigrations = loadRunMigrations();
    const fixtureMigrations = loadFixtureMigrations();

    expect(fixtureMigrations).toHaveLength(1);
    expect(fixtureMigrations[0]?.version).toBe(1);
    expect(fixtureMigrations[0]?.name).toBe("initial-schema");

    const fixtureDatabase = new RecordingSqliteDatabase();
    await runMigrations(fixtureDatabase, fixtureMigrations);
    const fixtureSchema = schemaOf(fixtureDatabase);

    expect(tableNames(fixtureSchema)).toEqual([
      "applied_events",
      "conversations",
      "messages",
      "outbox_commands",
      "sync_cursors",
    ]);
    expect(fixtureSchema).not.toMatch(/scope_metadata/i);
  });

  test("runs the fixture and account registries against independent databases without any cross-writes", async () => {
    const runMigrations = loadRunMigrations();
    const accountMigrations = loadAccountMigrations();
    const fixtureMigrations = loadFixtureMigrations();

    const fixtureDatabase = new RecordingSqliteDatabase();
    const accountDatabase = new RecordingSqliteDatabase();

    await runMigrations(fixtureDatabase, fixtureMigrations);
    await runMigrations(accountDatabase, accountMigrations);

    expect(schemaOf(fixtureDatabase)).not.toMatch(/scope_metadata/i);
    expect(schemaOf(accountDatabase)).not.toMatch(
      /CREATE\s+TABLE\s+(?:applied_events|sync_cursors)\b/i,
    );
    expect(fixtureDatabase.committedStatements).not.toEqual(
      accountDatabase.committedStatements,
    );
  });
});
