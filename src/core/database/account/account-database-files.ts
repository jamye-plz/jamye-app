import { File } from "expo-file-system";
import { defaultDatabaseDirectory, deleteDatabaseAsync } from "expo-sqlite";

import { isAccountDatabaseFilename } from "./account-database-name";

/**
 * Deletion of one account database's on-disk files. `deleteDatabaseAsync`
 * only removes the main file (and throws while the database is open), so the
 * `-wal`, `-shm` and `-journal` files are removed explicitly afterwards.
 */
export type AccountDatabaseFilesPort = Readonly<{
  deleteFiles: (databaseName: string) => Promise<void>;
  anyExist: (databaseName: string) => Promise<boolean>;
}>;

const SIDECAR_SUFFIXES = ["-wal", "-shm", "-journal"] as const;

function directoryUri(): string {
  const directory = String(defaultDatabaseDirectory);
  return directory.startsWith("file://") ? directory : `file://${directory}`;
}

function fileFor(name: string): File {
  return new File(directoryUri(), name);
}

export function createAccountDatabaseFiles(): AccountDatabaseFilesPort {
  return {
    async deleteFiles(databaseName) {
      // Defense in depth: the only names this module ever deletes are the
      // account-scoped database files (`isAccountDatabaseFilename`). The purge
      // registry validates names too, but a wrong name here would delete an
      // arbitrary file in the SQLite directory, so the adapter guards on its own.
      if (!isAccountDatabaseFilename(databaseName)) return;
      if (fileFor(databaseName).exists) {
        // Throws when the database is still open; sidecars stay untouched.
        await deleteDatabaseAsync(databaseName);
      }
      for (const suffix of SIDECAR_SUFFIXES) {
        const sidecar = fileFor(`${databaseName}${suffix}`);
        if (sidecar.exists) sidecar.delete();
      }
    },
    async anyExist(databaseName) {
      return [databaseName, ...SIDECAR_SUFFIXES.map((s) => databaseName + s)]
        .map(fileFor)
        .some((file) => file.exists);
    },
  };
}
