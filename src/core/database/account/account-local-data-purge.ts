import type {
  LogMetadata,
  LogSeverity,
  StructuredLogger,
} from "../../logging/logger";
import type { AccountDatabaseFilesPort } from "./account-database-files";
import type { AccountPurgeRegistry } from "./account-purge-registry";

/** Local SQLite data of a deleted account is kept for the 30-day recovery window. */
export const ACCOUNT_LOCAL_DATA_RETENTION_MS = 30 * 24 * 60 * 60 * 1000;

export type AccountPurgePrincipal = Readonly<{
  origin: string;
  userId: string;
}>;

/** Same shape as the chat store's ClockPort; declared here so core never imports a feature. */
export type AccountPurgeClock = Readonly<{ nowMs: () => number }>;

export type AccountPurgeLogger = Readonly<Pick<StructuredLogger, "log">>;

export type AccountPurgeSweepResult = Readonly<{
  due: number;
  removed: number;
  skipped: number;
  failed: number;
}>;

export type AccountLocalDataPurge = Readonly<{
  /** Schedules the purge. Rejects on failure; the caller treats it as best effort. */
  recordAccountDeletion: (principal: AccountPurgePrincipal) => Promise<void>;
  /**
   * Announces which principal's scope is (about to be) open, synchronously, so
   * a concurrent sweep skips that database; then cancels the principal's
   * schedule (a same-user_id login is a recovery). Never rejects. `null`
   * means no scope is open.
   */
  setActivePrincipal: (
    principal: AccountPurgePrincipal | null,
  ) => Promise<void>;
  /** Runs a database open in the same serialization section as cancel and sweep. */
  gateAccountOpen: <T>(open: () => Promise<T>) => Promise<T>;
  /** Removes the due entries' databases. Never rejects. */
  sweep: () => Promise<AccountPurgeSweepResult>;
}>;

export type AccountLocalDataPurgeDeps = Readonly<{
  registry: AccountPurgeRegistry;
  files: AccountDatabaseFilesPort;
  clock: AccountPurgeClock;
  resolveDatabaseName: (principal: AccountPurgePrincipal) => Promise<string>;
  logger: AccountPurgeLogger;
}>;

type Outcome = "removed" | "skipped" | "failed";

const EMPTY_RESULT: AccountPurgeSweepResult = {
  due: 0,
  removed: 0,
  skipped: 0,
  failed: 0,
};

export function createAccountLocalDataPurge(
  deps: AccountLocalDataPurgeDeps,
): AccountLocalDataPurge {
  const { registry, files, clock, resolveDatabaseName } = deps;

  // One section for every registry/file mutation and for account database
  // opens, so cancel, sweep and open never interleave on the same files.
  let tail: Promise<unknown> = Promise.resolve();
  function exclusive<T>(run: () => Promise<T>): Promise<T> {
    const result = tail.then(run);
    tail = result.catch(() => undefined);
    return result;
  }

  // Set synchronously (outside the section) by setActivePrincipal; read by the
  // sweep immediately before it deletes. Holds the hashed name only.
  let activeName: Promise<string | null> | null = null;

  function log(
    event: string,
    severity: Extract<LogSeverity, "info" | "warn">,
    metadata: LogMetadata,
  ): void {
    try {
      deps.logger.log(event, severity, metadata);
    } catch {
      // Logging is best effort and must never affect the purge.
    }
  }

  function isDue(entry: { deletedAt: number }): boolean {
    return clock.nowMs() - entry.deletedAt >= ACCOUNT_LOCAL_DATA_RETENTION_MS;
  }

  async function isActiveDatabase(databaseName: string): Promise<boolean> {
    for (;;) {
      const snapshot = activeName;
      if (snapshot === null) return false;
      const resolved = await snapshot;
      // The active principal may change while its name resolves; re-check.
      if (snapshot === activeName) return resolved === databaseName;
    }
  }

  async function sweepEntry(databaseName: string): Promise<Outcome> {
    return exclusive<Outcome>(async () => {
      // Re-check right before deleting: the entry may have been cancelled or
      // restarted since the due list was built, or its scope may have opened.
      const fresh = (await registry.list()).find(
        (entry) => entry.databaseName === databaseName,
      );
      if (!fresh || !isDue(fresh)) return "skipped";
      if (await isActiveDatabase(databaseName)) return "skipped";
      try {
        await files.deleteFiles(databaseName);
        // The entry is dropped only once every file is confirmed gone.
        if (await files.anyExist(databaseName)) return "failed";
        await registry.remove(databaseName);
      } catch {
        return "failed";
      }
      return "removed";
    });
  }

  async function runSweep(): Promise<AccountPurgeSweepResult> {
    let dueNames: string[];
    try {
      const entries = await exclusive(() => registry.list());
      dueNames = entries.filter(isDue).map((entry) => entry.databaseName);
    } catch {
      log("account.local-data-purge.registry-unreadable", "warn", {});
      return EMPTY_RESULT;
    }
    if (dueNames.length === 0) return EMPTY_RESULT;

    const counts = { removed: 0, skipped: 0, failed: 0 };
    for (const databaseName of dueNames) {
      let outcome: Outcome;
      try {
        outcome = await sweepEntry(databaseName);
      } catch {
        outcome = "failed";
      }
      counts[outcome] += 1;
    }
    const result: AccountPurgeSweepResult = {
      due: dueNames.length,
      ...counts,
    };
    log("account.local-data-purge.sweep", result.failed > 0 ? "warn" : "info", {
      ...result,
    });
    return result;
  }

  let sweepInFlight: Promise<AccountPurgeSweepResult> | null = null;

  return {
    async recordAccountDeletion(principal) {
      const databaseName = await resolveDatabaseName(principal);
      const deletedAt = clock.nowMs();
      await exclusive(() => registry.upsert({ databaseName, deletedAt }));
    },

    setActivePrincipal(principal) {
      if (!principal) {
        activeName = null;
        return Promise.resolve();
      }
      const name = resolveDatabaseName(principal).catch(() => {
        // The cancel cannot happen without the hashed name; record that it was
        // skipped (fixed event, no identifiers) instead of swallowing it.
        log("account.local-data-purge.cancel-name-failed", "warn", {});
        return null;
      });
      activeName = name;
      return exclusive(async () => {
        const databaseName = await name;
        if (databaseName) await registry.remove(databaseName);
      }).catch(() => {
        log("account.local-data-purge.cancel-failed", "warn", {});
      });
    },

    gateAccountOpen: (open) => exclusive(open),

    sweep() {
      if (!sweepInFlight) {
        const run = runSweep().finally(() => {
          if (sweepInFlight === run) sweepInFlight = null;
        });
        sweepInFlight = run;
      }
      return sweepInFlight;
    },
  };
}
