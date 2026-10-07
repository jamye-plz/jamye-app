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
  runMigrations?: unknown;
};

type RunMigrations = (
  database: SqliteDatabase,
  migrations: readonly Migration[],
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
        "M4-DB-1 implementation missing: src/core/database/migrate.ts must export runMigrations().",
      );
    }
    throw error;
  }

  if (typeof loaded.runMigrations !== "function") {
    throw new Error(
      "M4-DB-1 implementation incomplete: migrate.ts must expose runMigrations(database, migrations).",
    );
  }

  return { runMigrations: loaded.runMigrations as RunMigrations };
}

/** `runMigrations` takes its registry as an argument, so the runner contract is
 * pinned against synthetic registries instead of a production schema. */
const syntheticMigrations: readonly Migration[] = [
  {
    version: 1,
    name: "synthetic-items",
    statements: [
      "CREATE TABLE synthetic_items (id TEXT PRIMARY KEY NOT NULL)",
      "CREATE INDEX synthetic_items_id_idx ON synthetic_items (id)",
    ],
  },
];

const twoStepMigrations: readonly Migration[] = [
  ...syntheticMigrations,
  {
    version: 2,
    name: "synthetic-labels",
    statements: ["CREATE TABLE synthetic_labels (id TEXT PRIMARY KEY)"],
  },
];

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
    const { runMigrations } = loadMigrationModule();
    const database = new RecordingSqliteDatabase();

    await runMigrations(database, syntheticMigrations);

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
    const { runMigrations } = loadMigrationModule();
    const database = new RecordingSqliteDatabase();

    await runMigrations(database, syntheticMigrations);
    const beforeRetry = database.committedStatements.length;
    const transactionsBeforeRetry = database.transactions.length;

    await runMigrations(database, syntheticMigrations);

    const retryStatements = database.committedStatements.slice(beforeRetry);
    expect(database.userVersion).toBe(1);
    expect(database.transactions).toHaveLength(transactionsBeforeRetry);
    expect(retryStatements.join("\n")).not.toMatch(/CREATE\s+(?:TABLE|INDEX)/i);
    expect(retryStatements.join("\n")).not.toMatch(
      /PRAGMA\s+user_version\s*=/i,
    );
  });

  test("applies only the migrations newer than the stored version, one transaction each", async () => {
    const { runMigrations } = loadMigrationModule();
    const database = new RecordingSqliteDatabase();

    await runMigrations(database, syntheticMigrations);
    const beforeUpgrade = database.committedStatements.length;
    expect(database.transactions).toEqual(["commit"]);

    await runMigrations(database, twoStepMigrations);

    const upgradeStatements = database.committedStatements
      .slice(beforeUpgrade)
      .join("\n");
    expect(database.userVersion).toBe(2);
    expect(database.transactions).toEqual(["commit", "commit"]);
    expect(upgradeStatements).toMatch(/CREATE\s+TABLE\s+synthetic_labels/i);
    expect(upgradeStatements).not.toMatch(/CREATE\s+TABLE\s+synthetic_items/i);
    expect(upgradeStatements).toMatch(/PRAGMA\s+user_version\s*=\s*2/i);
    expect(upgradeStatements).not.toMatch(/PRAGMA\s+user_version\s*=\s*1/i);
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
    const { runMigrations } = loadMigrationModule();
    const database = new RecordingSqliteDatabase();
    database.userVersion = 2;
    const statementsBeforeAttempt = database.committedStatements.length;

    await expect(runMigrations(database, syntheticMigrations)).rejects.toThrow(
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
