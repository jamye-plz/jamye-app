import type { SqliteRepositoryDatabase } from "../types";

export const ACCOUNT_SCHEMA_VERSION = 2;

type ScopeMetadataRow = Readonly<{
  origin: string;
  schema_version: number;
  singleton: number;
  user_id: string;
}>;

const SELECT_SCOPE_METADATA = `
  SELECT singleton, origin, user_id, schema_version
  FROM scope_metadata
  WHERE singleton = 1
`;

const INSERT_SCOPE_METADATA = `
  INSERT INTO scope_metadata (singleton, origin, user_id, schema_version)
  VALUES (1, ?, ?, ?)
`;

export async function validateScopeMetadata(
  database: SqliteRepositoryDatabase,
  principal: Readonly<{ origin: string; userId: string }>,
): Promise<void> {
  const existing = await database.getFirstAsync<ScopeMetadataRow>(
    SELECT_SCOPE_METADATA,
  );

  if (!existing) {
    await database.runAsync(
      INSERT_SCOPE_METADATA,
      principal.origin,
      principal.userId,
      ACCOUNT_SCHEMA_VERSION,
    );
    return;
  }

  if (existing.schema_version !== ACCOUNT_SCHEMA_VERSION) {
    throw new Error(
      `Account schema version ${existing.schema_version} does not match the supported version ${ACCOUNT_SCHEMA_VERSION}.`,
    );
  }

  if (
    existing.origin !== principal.origin ||
    existing.user_id !== principal.userId
  ) {
    throw new Error(
      "Account namespace identity mismatch: persisted origin/user_id does not match the requested principal.",
    );
  }
}
