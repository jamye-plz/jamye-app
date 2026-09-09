type SqliteValue = string | number | null;
type SqliteRow = Record<string, SqliteValue>;

type FileSystemModule = Readonly<{
  readFileSync: (path: string, encoding: "utf8") => string;
}>;

type AccountPrincipal = Readonly<{
  epoch: number;
  origin: string;
  userId: string;
}>;

type AccountDatabaseHandle = Readonly<{
  close: () => Promise<void>;
  database: unknown;
}>;

type OpenAccountDatabaseModule = {
  openAccountDatabase?: unknown;
};

type OpenAccountDatabase = (
  principal: AccountPrincipal,
) => Promise<AccountDatabaseHandle>;

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

function loadOpenAccountDatabaseContract(): {
  openAccountDatabase: OpenAccountDatabase;
} {
  let module: OpenAccountDatabaseModule;
  try {
    module = jest.requireActual<OpenAccountDatabaseModule>(
      "../../../../src/core/database/account/open-account-database",
    );
  } catch (error) {
    if (isMissingModuleError(error)) {
      throw new Error(
        "M6-03 implementation missing: src/core/database/account/open-account-database.ts must export openAccountDatabase().",
      );
    }
    throw error;
  }
  if (typeof module.openAccountDatabase !== "function") {
    throw new Error(
      "M6-03 open-account-database contract is incomplete: openAccountDatabase() must be exported.",
    );
  }
  return {
    openAccountDatabase: module.openAccountDatabase as OpenAccountDatabase,
  };
}

function mockCrypto(): void {
  jest.doMock("expo-crypto", () => ({
    CryptoDigestAlgorithm: { SHA256: "SHA-256" },
    CryptoEncoding: { HEX: "hex" },
    digestStringAsync: jest.fn(async (_algorithm: unknown, data: string) => {
      let hash = 0;
      for (let index = 0; index < data.length; index += 1) {
        hash = (Math.imul(hash, 31) + data.charCodeAt(index)) >>> 0;
      }
      return hash.toString(16).padStart(64, "0").slice(0, 64);
    }),
  }));
}

class FakeAccountSqliteDatabase {
  userVersion = 0;
  hasScopeMetadataTable = false;
  scopeMetadataRow: SqliteRow | null = null;
  execCalls: string[] = [];
  runCalls: Readonly<{ statement: string; values: SqliteValue[] }>[] = [];
  closeAsync = jest.fn(async (): Promise<void> => undefined);

  async execAsync(statement: string): Promise<void> {
    this.execCalls.push(statement);
    const versionMatch = statement.match(/PRAGMA user_version\s*=\s*(\d+)/i);
    if (versionMatch) {
      this.userVersion = Number(versionMatch[1]);
      return;
    }
    if (/CREATE TABLE scope_metadata/i.test(statement)) {
      this.hasScopeMetadataTable = true;
      return;
    }
    // PRAGMA journal_mode / foreign_keys are accepted no-ops.
  }

  async getAllAsync<Row extends SqliteRow>(statement: string): Promise<Row[]> {
    if (/foreign_key_check/i.test(statement)) return [];
    throw new Error(`Unexpected getAllAsync statement: ${statement}`);
  }

  async getFirstAsync<Row extends SqliteRow>(
    statement: string,
  ): Promise<Row | null> {
    if (/PRAGMA user_version/i.test(statement)) {
      return { user_version: this.userVersion } as unknown as Row;
    }
    if (/scope_metadata/i.test(statement)) {
      return this.scopeMetadataRow as Row | null;
    }
    throw new Error(`Unexpected getFirstAsync statement: ${statement}`);
  }

  async runAsync(
    statement: string,
    ...values: SqliteValue[]
  ): Promise<Readonly<{ changes: number; lastInsertRowId: number }>> {
    this.runCalls.push({ statement, values });
    if (/INSERT INTO scope_metadata/i.test(statement)) {
      const [origin, userId, schemaVersion] = values;
      this.scopeMetadataRow = {
        origin: origin as string,
        schema_version: schemaVersion as number,
        singleton: 1,
        user_id: userId as string,
      };
      return { changes: 1, lastInsertRowId: 1 };
    }
    throw new Error(`Unexpected runAsync statement: ${statement}`);
  }

  async withExclusiveTransactionAsync(
    operation: (transaction: FakeAccountSqliteDatabase) => Promise<void>,
  ): Promise<void> {
    await operation(this);
  }
}

function mockSqlite(database: FakeAccountSqliteDatabase): jest.Mock {
  const openDatabaseAsync = jest.fn(async () => database);
  jest.doMock("expo-sqlite", () => ({ openDatabaseAsync }));
  return openDatabaseAsync;
}

const PRINCIPAL: AccountPrincipal = Object.freeze({
  epoch: 1,
  origin: "https://api.jamye.example",
  userId: "a1b2c3d4-e5f6-47a8-99b0-1234567890ab",
});

describe("M6-03 native account database open glue", () => {
  test("composes real expo-sqlite open, shared runMigrations, the account v1 registry, and identity validation on every open", () => {
    const filesystem = jest.requireActual<FileSystemModule>("node:fs");
    const source = filesystem.readFileSync(
      `${process.cwd()}/src/core/database/account/open-account-database.ts`,
      "utf8",
    );

    expect(source).toMatch(
      /import\s*\{\s*openDatabaseAsync[^}]*\}\s*from\s*["']expo-sqlite["']/,
    );
    expect(source).toMatch(
      /import\s*\{\s*runMigrations\s*\}\s*from\s*["'][^"']*migrate["']/,
    );
    expect(source).toMatch(
      /import\s*\{\s*accountMigrations\s*\}\s*from\s*["'][^"']*migrations["']/,
    );
    expect(source).toMatch(
      /import\s*\{\s*resolveAccountDatabaseFilename\s*\}\s*from\s*["'][^"']*namespace["']/,
    );
    expect(source).toMatch(
      /import\s*\{\s*validateScopeMetadata\s*\}\s*from\s*["'][^"']*validate-scope-metadata["']/,
    );
    expect(source).toMatch(
      /await\s+resolveAccountDatabaseFilename\s*\(\s*principal\s*\)/,
    );
    expect(source).toMatch(/await\s+openDatabaseAsync\s*\(/);
    expect(source).toMatch(
      /await\s+runMigrations\s*\(\s*database\s*,\s*accountMigrations\s*\)/,
    );
    expect(source).toMatch(
      /await\s+validateScopeMetadata\s*\(\s*database\s*,\s*principal\s*\)/,
    );
    expect(source).toMatch(/database\.closeAsync\s*\(\s*\)/);
  });

  describe("behavioral: mocked expo-sqlite/expo-crypto, no real user database", () => {
    afterEach(() => {
      jest.resetModules();
      jest.dontMock("expo-sqlite");
      jest.dontMock("expo-crypto");
    });

    test("opens by the resolved namespace filename, runs migrations, and inserts scope metadata identity on first open", async () => {
      mockCrypto();
      const database = new FakeAccountSqliteDatabase();
      const openDatabaseAsync = mockSqlite(database);
      const { openAccountDatabase } = loadOpenAccountDatabaseContract();

      const handle = await openAccountDatabase(PRINCIPAL);

      expect(openDatabaseAsync).toHaveBeenCalledTimes(1);
      const [filename] = openDatabaseAsync.mock.calls[0] as [string];
      expect(filename).toMatch(/^jamye-account-v1-[0-9a-f]{64}\.db$/);
      expect(database.hasScopeMetadataTable).toBe(true);
      expect(database.userVersion).toBe(1);
      expect(database.scopeMetadataRow).toEqual({
        origin: PRINCIPAL.origin,
        schema_version: 1,
        singleton: 1,
        user_id: PRINCIPAL.userId,
      });
      expect(handle.database).toBe(database);

      await handle.close();
      expect(database.closeAsync).toHaveBeenCalledTimes(1);
    });

    test("closes the database and rethrows when a migration fails", async () => {
      mockCrypto();
      const database = new FakeAccountSqliteDatabase();
      const migrationFailure = new Error("simulated migration failure");
      const originalExecAsync = database.execAsync.bind(database);
      database.execAsync = async (statement: string) => {
        if (/CREATE TABLE scope_metadata/i.test(statement)) {
          throw migrationFailure;
        }
        return originalExecAsync(statement);
      };
      mockSqlite(database);
      const { openAccountDatabase } = loadOpenAccountDatabaseContract();

      await expect(openAccountDatabase(PRINCIPAL)).rejects.toThrow(
        "simulated migration failure",
      );
      expect(database.closeAsync).toHaveBeenCalledTimes(1);
    });

    test("closes the database and rethrows when persisted metadata identity does not match the requested principal", async () => {
      mockCrypto();
      const database = new FakeAccountSqliteDatabase();
      database.userVersion = 1;
      database.hasScopeMetadataTable = true;
      database.scopeMetadataRow = {
        origin: "https://other.jamye.example",
        schema_version: 1,
        singleton: 1,
        user_id: PRINCIPAL.userId,
      };
      mockSqlite(database);
      const { openAccountDatabase } = loadOpenAccountDatabaseContract();

      await expect(openAccountDatabase(PRINCIPAL)).rejects.toThrow(
        /mismatch|identity/i,
      );
      expect(database.closeAsync).toHaveBeenCalledTimes(1);
      // Identity failure must not delete or reset the persisted row.
      expect(database.runCalls).toHaveLength(0);
    });

    test("rejects a non-canonical origin before ever opening the database", async () => {
      mockCrypto();
      const database = new FakeAccountSqliteDatabase();
      const openDatabaseAsync = mockSqlite(database);
      const { openAccountDatabase } = loadOpenAccountDatabaseContract();

      await expect(
        openAccountDatabase({
          ...PRINCIPAL,
          origin: "https://api.jamye.example/v1",
        }),
      ).rejects.toThrow(/origin/i);
      expect(openDatabaseAsync).not.toHaveBeenCalled();
    });
  });
});
