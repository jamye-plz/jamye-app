import { initialSchemaMigration, type Migration } from "./001-initial-schema";

export type { Migration } from "./001-initial-schema";

export const migrations: readonly Migration[] = [initialSchemaMigration];
