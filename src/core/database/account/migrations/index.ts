import { accountSchemaMigration } from "./001-account-schema";
import { connectedChatSchemaMigration } from "./002-connected-chat-schema";
import { durableOutboxEventsMigration } from "./003-durable-outbox-events";
import { topicsCacheMigration } from "./004-topics-cache";
import { connectedChatMediaMigration } from "./005-connected-chat-media";
import { connectedChatDeletionsMigration } from "./006-connected-chat-deletions";
import { mediaExpiredErrorCodeMigration } from "./007-media-expired-error-code";
import type { Migration } from "../../migrations";

// M17 (U10): account writes still run with foreign keys OFF (see 007), so
// orphan rows can pile up between releases and runMigrations'
// foreign_key_check would reject them. Until writes enforce foreign keys,
// a new migration must first delete orphans the way 007 does.
export const accountMigrations: readonly Migration[] = [
  accountSchemaMigration,
  connectedChatSchemaMigration,
  durableOutboxEventsMigration,
  topicsCacheMigration,
  connectedChatMediaMigration,
  connectedChatDeletionsMigration,
  mediaExpiredErrorCodeMigration,
];

export const ACCOUNT_SCHEMA_VERSION = accountMigrations.at(-1)?.version ?? 0;
