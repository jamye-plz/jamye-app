export type SqliteValue = string | number | null;

export type SqliteRow = Record<string, SqliteValue>;

export type SqliteRunResult = Readonly<{
  changes: number;
  lastInsertRowId: number;
}>;

export type SqliteMigrationTransaction = {
  execAsync(statement: string): Promise<void>;
  getAllAsync<Row extends SqliteRow>(statement: string): Promise<Row[]>;
};

export type SqliteMigrationDatabase = {
  execAsync: (statement: string) => Promise<void>;
  getFirstAsync: <Row extends SqliteRow>(
    statement: string,
    ...values: SqliteValue[]
  ) => Promise<Row | null>;
  withExclusiveTransactionAsync: (
    operation: (transaction: SqliteMigrationTransaction) => Promise<void>,
  ) => Promise<void>;
};

export type SqliteRepositoryDatabase = {
  getFirstAsync: <Row extends SqliteRow>(
    statement: string,
    ...values: SqliteValue[]
  ) => Promise<Row | null>;
  runAsync: (
    statement: string,
    ...values: SqliteValue[]
  ) => Promise<SqliteRunResult>;
  withExclusiveTransactionAsync: (
    operation: (transaction: SqliteRepositoryDatabase) => Promise<void>,
  ) => Promise<void>;
};
