import { accountSchemaMigration } from "./001-account-schema";
import { connectedChatSchemaMigration } from "./002-connected-chat-schema";
import type { Migration } from "../../migrations";

export const accountMigrations: readonly Migration[] = [
  accountSchemaMigration,
  connectedChatSchemaMigration,
];
