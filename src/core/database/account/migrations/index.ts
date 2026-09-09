import { accountSchemaMigration } from "./001-account-schema";
import type { Migration } from "../../migrations";

export const accountMigrations: readonly Migration[] = [accountSchemaMigration];
