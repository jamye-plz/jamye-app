import { openDatabaseAsync, type SQLiteDatabase } from "expo-sqlite";

import { runMigrations } from "../migrate";
import { createConnectedChatRepository } from "./connected-chat-repository";
import type { ConnectedChatRepository } from "./connected-chat-types";
import { accountMigrations } from "./migrations";
import { resolveAccountDatabaseFilename } from "./namespace";
import type { AccountPrincipal } from "./types";
import { validateScopeMetadata } from "./validate-scope-metadata";

export type AccountDatabaseHandle = Readonly<{
  close: () => Promise<void>;
  connectedChatRepository: ConnectedChatRepository;
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
    let active = true;
    const assertActive = () => {
      if (!active) {
        throw new Error("Account database handle is closed or stale.");
      }
    };
    const connectedChatRepository = createConnectedChatRepository(
      database,
      principal,
      assertActive,
    );
    return {
      async close() {
        if (!active) return;
        active = false;
        await database.closeAsync();
      },
      connectedChatRepository,
      database,
    };
  } catch (error) {
    await database.closeAsync();
    throw error;
  }
}
