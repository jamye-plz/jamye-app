type SqliteValue = string | number | null;
type SqliteRow = Record<string, SqliteValue>;

type SqliteRepositoryDatabase = {
  getAllAsync: <Row extends SqliteRow>(
    statement: string,
    ...values: SqliteValue[]
  ) => Promise<Row[]>;
  getFirstAsync: <Row extends SqliteRow>(
    statement: string,
    ...values: SqliteValue[]
  ) => Promise<Row | null>;
  runAsync: (
    statement: string,
    ...values: SqliteValue[]
  ) => Promise<Readonly<{ changes: number; lastInsertRowId: number }>>;
  withExclusiveTransactionAsync: (
    operation: (transaction: SqliteRepositoryDatabase) => Promise<void>,
  ) => Promise<void>;
};

type ValidateScopeMetadataModule = {
  ACCOUNT_SCHEMA_VERSION?: unknown;
  validateScopeMetadata?: unknown;
};

type AccountMigrationsModule = Readonly<{
  accountMigrations: readonly Readonly<{ version: number }>[];
}>;

type ValidateScopeMetadata = (
  database: SqliteRepositoryDatabase,
  principal: Readonly<{ origin: string; userId: string }>,
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

function loadValidateScopeMetadataContract(): {
  ACCOUNT_SCHEMA_VERSION: number;
  validateScopeMetadata: ValidateScopeMetadata;
} {
  let module: ValidateScopeMetadataModule;
  try {
    module = jest.requireActual<ValidateScopeMetadataModule>(
      "../../../../src/core/database/account/validate-scope-metadata",
    );
  } catch (error) {
    if (isMissingModuleError(error)) {
      throw new Error(
        "M6-03 implementation missing: src/core/database/account/validate-scope-metadata.ts must export validateScopeMetadata() and ACCOUNT_SCHEMA_VERSION.",
      );
    }
    throw error;
  }

  if (
    typeof module.validateScopeMetadata !== "function" ||
    typeof module.ACCOUNT_SCHEMA_VERSION !== "number"
  ) {
    throw new Error(
      "M6-03 validate-scope-metadata contract is incomplete: export validateScopeMetadata() and a numeric ACCOUNT_SCHEMA_VERSION.",
    );
  }

  return {
    ACCOUNT_SCHEMA_VERSION: module.ACCOUNT_SCHEMA_VERSION,
    validateScopeMetadata:
      module.validateScopeMetadata as ValidateScopeMetadata,
  };
}

class FakeScopeMetadataDatabase implements SqliteRepositoryDatabase {
  readonly runCalls: Readonly<{ statement: string; values: SqliteValue[] }>[] =
    [];
  row: SqliteRow | null = null;

  async getAllAsync<Row extends SqliteRow>(): Promise<Row[]> {
    throw new Error("getAllAsync is not used by scope metadata validation.");
  }

  async getFirstAsync<Row extends SqliteRow>(
    statement: string,
  ): Promise<Row | null> {
    if (!/scope_metadata/i.test(statement)) {
      throw new Error(`Unexpected getFirstAsync statement: ${statement}`);
    }
    return this.row as Row | null;
  }

  async runAsync(
    statement: string,
    ...values: SqliteValue[]
  ): Promise<Readonly<{ changes: number; lastInsertRowId: number }>> {
    this.runCalls.push({ statement, values });
    return { changes: 1, lastInsertRowId: 1 };
  }

  async withExclusiveTransactionAsync(
    operation: (transaction: SqliteRepositoryDatabase) => Promise<void>,
  ): Promise<void> {
    await operation(this);
  }
}

const PRINCIPAL = Object.freeze({
  origin: "https://api.jamye.example",
  userId: "a1b2c3d4-e5f6-47a8-99b0-1234567890ab",
});

describe("M6-03 scope metadata identity validation on every open", () => {
  test("derives its supported version from the latest account migration", () => {
    const { ACCOUNT_SCHEMA_VERSION } = loadValidateScopeMetadataContract();
    const { accountMigrations } = jest.requireActual<AccountMigrationsModule>(
      "../../../../src/core/database/account/migrations",
    );

    expect(ACCOUNT_SCHEMA_VERSION).toBe(accountMigrations.at(-1)?.version);
  });

  test("creates the sole singleton metadata row when none exists yet", async () => {
    const { validateScopeMetadata, ACCOUNT_SCHEMA_VERSION } =
      loadValidateScopeMetadataContract();
    const database = new FakeScopeMetadataDatabase();

    await validateScopeMetadata(database, PRINCIPAL);

    expect(database.runCalls).toHaveLength(1);
    expect(database.runCalls[0]?.statement).toMatch(
      /INSERT INTO scope_metadata/i,
    );
    expect(database.runCalls[0]?.values).toEqual([
      PRINCIPAL.origin,
      PRINCIPAL.userId,
      ACCOUNT_SCHEMA_VERSION,
    ]);
  });

  test("passes silently without any write when the persisted identity matches", async () => {
    const { validateScopeMetadata, ACCOUNT_SCHEMA_VERSION } =
      loadValidateScopeMetadataContract();
    const database = new FakeScopeMetadataDatabase();
    database.row = {
      origin: PRINCIPAL.origin,
      schema_version: ACCOUNT_SCHEMA_VERSION,
      singleton: 1,
      user_id: PRINCIPAL.userId,
    };

    await expect(
      validateScopeMetadata(database, PRINCIPAL),
    ).resolves.toBeUndefined();
    expect(database.runCalls).toHaveLength(0);
  });

  test("fails visibly on an origin mismatch without deleting or resetting the row", async () => {
    const { validateScopeMetadata, ACCOUNT_SCHEMA_VERSION } =
      loadValidateScopeMetadataContract();
    const database = new FakeScopeMetadataDatabase();
    database.row = {
      origin: "https://other.jamye.example",
      schema_version: ACCOUNT_SCHEMA_VERSION,
      singleton: 1,
      user_id: PRINCIPAL.userId,
    };

    await expect(validateScopeMetadata(database, PRINCIPAL)).rejects.toThrow(
      /mismatch|identity/i,
    );
    expect(database.runCalls).toHaveLength(0);
  });

  test("fails visibly on a user id mismatch without deleting or resetting the row", async () => {
    const { validateScopeMetadata, ACCOUNT_SCHEMA_VERSION } =
      loadValidateScopeMetadataContract();
    const database = new FakeScopeMetadataDatabase();
    database.row = {
      origin: PRINCIPAL.origin,
      schema_version: ACCOUNT_SCHEMA_VERSION,
      singleton: 1,
      user_id: "ffffffff-eeee-4ddd-8ccc-bbbbbbbbbbbb",
    };

    await expect(validateScopeMetadata(database, PRINCIPAL)).rejects.toThrow(
      /mismatch|identity/i,
    );
    expect(database.runCalls).toHaveLength(0);
  });

  test("fails visibly on a newer-than-supported schema version without deleting or resetting the row", async () => {
    const { validateScopeMetadata, ACCOUNT_SCHEMA_VERSION } =
      loadValidateScopeMetadataContract();
    const database = new FakeScopeMetadataDatabase();
    database.row = {
      origin: PRINCIPAL.origin,
      schema_version: ACCOUNT_SCHEMA_VERSION + 1,
      singleton: 1,
      user_id: PRINCIPAL.userId,
    };

    await expect(validateScopeMetadata(database, PRINCIPAL)).rejects.toThrow(
      /newer|unsupported|version/i,
    );
    expect(database.runCalls).toHaveLength(0);
  });
});
