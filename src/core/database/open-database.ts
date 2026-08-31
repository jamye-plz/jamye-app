import { openDatabaseAsync, type SQLiteDatabase } from "expo-sqlite";

import { runMigrations } from "./migrate";

export const DATABASE_FILENAME = "jamye.db";

export async function openDatabase(): Promise<SQLiteDatabase> {
  const database = await openDatabaseAsync(DATABASE_FILENAME);

  try {
    await runMigrations(database);
    return database;
  } catch (error) {
    await database.closeAsync();
    throw error;
  }
}
