import { openDatabaseAsync, type SQLiteDatabase } from "expo-sqlite";

import { runMigrations } from "../migrate";
import type {
  SqliteRepositoryDatabase,
  SqliteRow,
  SqliteValue,
} from "../types";
import { createConnectedChatRepository } from "./connected-chat-repository";
import type { ConnectedChatRepository } from "./connected-chat-types";
import { createTopicsRepository } from "./topics-repository";
import type { TopicsRepository } from "./topics-types";
import { accountMigrations } from "./migrations";
import { resolveAccountDatabaseFilename } from "./namespace";
import type { AccountPrincipal } from "./types";
import { validateScopeMetadata } from "./validate-scope-metadata";

export type AccountDatabaseHandle = Readonly<{
  close: () => Promise<void>;
  connectedChatRepository: ConnectedChatRepository;
  topicsRepository: TopicsRepository;
  database: SQLiteDatabase;
}>;

/**
 * expo-sqlite runs every exclusive transaction on its own connection and does
 * not wait on a busy database: once one of them is writing, any other write
 * aborts with "database is locked". The account database is written by chat
 * history, realtime sync, the outbox and the topics cache at the same time, so
 * its repositories share this FIFO write queue; reads stay concurrent (WAL).
 * Code inside a transaction must keep using the transaction handle it is
 * given -- a queued method of the outer handle would wait on itself.
 */
export function serializeWrites(
  database: SqliteRepositoryDatabase,
): SqliteRepositoryDatabase {
  let tail: Promise<unknown> = Promise.resolve();
  function enqueue<T>(write: () => Promise<T>): Promise<T> {
    const result = tail.then(write);
    tail = result.catch(() => undefined);
    return result;
  }
  return {
    getAllAsync: <Row extends SqliteRow>(
      statement: string,
      ...values: SqliteValue[]
    ) => database.getAllAsync<Row>(statement, ...values),
    getFirstAsync: <Row extends SqliteRow>(
      statement: string,
      ...values: SqliteValue[]
    ) => database.getFirstAsync<Row>(statement, ...values),
    runAsync: (statement, ...values) =>
      enqueue(() => database.runAsync(statement, ...values)),
    withExclusiveTransactionAsync: (operation) =>
      enqueue(() => database.withExclusiveTransactionAsync(operation)),
  };
}

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
    // One write queue for every repository sharing this file.
    const writes = serializeWrites(database);
    const connectedChatRepository = createConnectedChatRepository(
      writes,
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
      topicsRepository: createTopicsRepository(writes, principal, assertActive),
      database,
    };
  } catch (error) {
    await database.closeAsync();
    throw error;
  }
}
