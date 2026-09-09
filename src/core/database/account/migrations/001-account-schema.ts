import type { Migration } from "../../migrations";

export const accountSchemaMigration: Migration = {
  version: 1,
  name: "account-scope-metadata",
  statements: [
    `CREATE TABLE scope_metadata (
      singleton INTEGER PRIMARY KEY NOT NULL CHECK (singleton = 1),
      origin TEXT NOT NULL CHECK (length(origin) > 0),
      user_id TEXT NOT NULL CHECK (length(user_id) > 0),
      schema_version INTEGER NOT NULL CHECK (schema_version >= 1)
    );`,
  ],
};
