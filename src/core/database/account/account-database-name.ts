/**
 * The one definition of an account database file name:
 * `jamye-account-v1-<sha256 hex>.db`. `namespace.ts` builds names from it and
 * both purge guards (`account-purge-registry.ts`, `account-database-files.ts`)
 * validate against it, so bumping the version prefix cannot leave one of them
 * rejecting the new names. Kept free of imports so the file adapters do not
 * pull in `expo-crypto`.
 */
const ACCOUNT_DATABASE_FILENAME_PREFIX = "jamye-account-v1-";

const ACCOUNT_DATABASE_FILENAME_PATTERN = new RegExp(
  `^${ACCOUNT_DATABASE_FILENAME_PREFIX}[0-9a-f]{64}\\.db$`,
);

export function accountDatabaseFilename(digest: string): string {
  return `${ACCOUNT_DATABASE_FILENAME_PREFIX}${digest}.db`;
}

export function isAccountDatabaseFilename(name: string): boolean {
  return ACCOUNT_DATABASE_FILENAME_PATTERN.test(name);
}
