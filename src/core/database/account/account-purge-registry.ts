import { isAccountDatabaseFilename } from "./account-database-name";

export const ACCOUNT_PURGE_REGISTRY_VERSION = 1;

/**
 * One scheduled local-data purge. `databaseName` is the origin+userId hashed
 * account database file name (never a raw user id or e-mail) and `deletedAt`
 * is the device clock time (epoch ms) at which the account deletion succeeded.
 */
export type AccountPurgeEntry = Readonly<{
  databaseName: string;
  deletedAt: number;
}>;

/** Byte-level storage of the registry. `read` resolves null when absent. */
export type AccountPurgeRegistryFile = Readonly<{
  read: () => Promise<string | null>;
  write: (contents: string) => Promise<void>;
}>;

export type AccountPurgeRegistry = Readonly<{
  list: () => Promise<readonly AccountPurgeEntry[]>;
  upsert: (entry: AccountPurgeEntry) => Promise<void>;
  remove: (databaseName: string) => Promise<void>;
}>;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function toEntry(value: unknown): AccountPurgeEntry | null {
  if (!isRecord(value)) return null;
  const { databaseName, deletedAt } = value;
  if (typeof databaseName !== "string") return null;
  // A tampered or foreign file must never be able to name an arbitrary path
  // for deletion: only canonical account database file names are accepted.
  if (!isAccountDatabaseFilename(databaseName)) return null;
  if (typeof deletedAt !== "number") return null;
  if (!Number.isFinite(deletedAt) || deletedAt < 0) return null;
  return { databaseName, deletedAt };
}

/** Corrupt, unknown-version or malformed content reads as an empty registry. */
function parseEntries(text: string | null): AccountPurgeEntry[] {
  if (text === null) return [];
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return [];
  }
  if (!isRecord(parsed)) return [];
  if (parsed.version !== ACCOUNT_PURGE_REGISTRY_VERSION) return [];
  if (!Array.isArray(parsed.entries)) return [];
  const entries: AccountPurgeEntry[] = [];
  for (const raw of parsed.entries) {
    const entry = toEntry(raw);
    if (entry) entries.push(entry);
  }
  return entries;
}

function serialize(entries: readonly AccountPurgeEntry[]): string {
  return JSON.stringify({
    version: ACCOUNT_PURGE_REGISTRY_VERSION,
    entries: entries.map(({ databaseName, deletedAt }) => ({
      databaseName,
      deletedAt,
    })),
  });
}

export function createAccountPurgeRegistry(
  file: AccountPurgeRegistryFile,
): AccountPurgeRegistry {
  // Every read-modify-write runs one after another; a failed step never
  // wedges the queue.
  let tail: Promise<unknown> = Promise.resolve();
  function enqueue<T>(run: () => Promise<T>): Promise<T> {
    const result = tail.then(run);
    tail = result.catch(() => undefined);
    return result;
  }

  async function readEntries(): Promise<AccountPurgeEntry[]> {
    return parseEntries(await file.read());
  }

  return {
    list: () => enqueue(readEntries),
    upsert: (entry) =>
      enqueue(async () => {
        const kept = (await readEntries()).filter(
          (existing) => existing.databaseName !== entry.databaseName,
        );
        await file.write(
          serialize([
            ...kept,
            { databaseName: entry.databaseName, deletedAt: entry.deletedAt },
          ]),
        );
      }),
    remove: (databaseName) =>
      enqueue(async () => {
        const entries = await readEntries();
        const kept = entries.filter(
          (existing) => existing.databaseName !== databaseName,
        );
        if (kept.length === entries.length) return;
        await file.write(serialize(kept));
      }),
  };
}
