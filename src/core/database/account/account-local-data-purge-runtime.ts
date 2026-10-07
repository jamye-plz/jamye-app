import { consoleLoggerSink, createLogger } from "../../logging/logger";
import { createAccountDatabaseFiles } from "./account-database-files";
import { createAccountLocalDataPurge } from "./account-local-data-purge";
import type { AccountLocalDataPurge } from "./account-local-data-purge";
import { createAccountPurgeRegistry } from "./account-purge-registry";
import { createAccountPurgeRegistryFile } from "./account-purge-registry-file";
import { resolveAccountDatabaseFilename } from "./namespace";

/** Production composition: documents-directory registry, expo-sqlite files, device clock. */
export function createDefaultAccountLocalDataPurge(): AccountLocalDataPurge {
  return createAccountLocalDataPurge({
    registry: createAccountPurgeRegistry(createAccountPurgeRegistryFile()),
    files: createAccountDatabaseFiles(),
    clock: { nowMs: () => Date.now() },
    resolveDatabaseName: resolveAccountDatabaseFilename,
    logger: createLogger(consoleLoggerSink),
  });
}
