import {
  migrations as registeredMigrations,
  type Migration,
} from "./migrations";
import type { SqliteMigrationDatabase } from "./types";

export { migrations } from "./migrations";

function validateMigrationRegistry(migrations: readonly Migration[]): void {
  migrations.forEach((migration, index) => {
    const expectedVersion = index + 1;
    if (
      migration.version !== expectedVersion ||
      !Number.isInteger(migration.version) ||
      migration.version < 1
    ) {
      throw new Error(
        "SQLite migration registry must use unique contiguous versions starting at 1.",
      );
    }
    if (!migration.name || migration.statements.length === 0) {
      throw new Error(
        "SQLite migration registry contains an invalid migration.",
      );
    }
  });
}

function readUserVersion(
  row: Record<string, number | string | null> | null,
): number {
  const value = row?.user_version;
  if (typeof value !== "number" || !Number.isInteger(value) || value < 0) {
    throw new Error(
      "SQLite PRAGMA user_version must be a non-negative integer.",
    );
  }
  return value;
}

export async function runMigrations(
  database: SqliteMigrationDatabase,
  migrations: readonly Migration[] = registeredMigrations,
): Promise<void> {
  validateMigrationRegistry(migrations);

  await database.execAsync("PRAGMA journal_mode = WAL");
  await database.execAsync("PRAGMA foreign_keys = ON");

  const versionRow = await database.getFirstAsync<{ user_version: number }>(
    "PRAGMA user_version",
  );
  const currentVersion = readUserVersion(versionRow);
  const latestVersion = migrations.length;

  if (currentVersion > latestVersion) {
    throw new Error(
      `SQLite database version ${currentVersion} is newer than supported version ${latestVersion}.`,
    );
  }

  for (const migration of migrations) {
    if (migration.version <= currentVersion) continue;

    await database.withExclusiveTransactionAsync(async (transaction) => {
      for (const statement of migration.statements) {
        await transaction.execAsync(statement);
      }

      const foreignKeyViolations = await transaction.getAllAsync(
        "PRAGMA foreign_key_check",
      );
      if (foreignKeyViolations.length > 0) {
        throw new Error("SQLite migration violated a foreign-key constraint.");
      }

      await transaction.execAsync(`PRAGMA user_version = ${migration.version}`);
    });
  }
}
