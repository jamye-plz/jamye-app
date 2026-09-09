import { openDatabaseAsync, type SQLiteDatabase } from "expo-sqlite";

import { runMigrations } from "../migrate";
import { accountMigrations } from "./migrations";
import { resolveAccountDatabaseFilename } from "./namespace";
import type { AccountPrincipal } from "./types";
import { validateScopeMetadata } from "./validate-scope-metadata";

export type AccountDatabaseHandle = Readonly<{
  close: () => Promise<void>;
  database: SQLiteDatabase;
}>;

export async function openAccountDatabase(
  principal: AccountPrincipal,
): Promise<AccountDatabaseHandle> {
  const filename = await resolveAccountDatabaseFilename(principal);
  const database = await openDatabaseAsync(filename);

  try {
    await runMigrations(database, accountMigrations);
    await validateScopeMetadata(database, principal);
    return { close: () => database.closeAsync(), database };
  } catch (error) {
    await database.closeAsync();
    throw error;
  }
}
