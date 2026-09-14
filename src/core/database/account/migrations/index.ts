import { accountSchemaMigration } from "./001-account-schema";
import { connectedChatSchemaMigration } from "./002-connected-chat-schema";
import { durableOutboxEventsMigration } from "./003-durable-outbox-events";
import { topicsCacheMigration } from "./004-topics-cache";
import { connectedChatMediaMigration } from "./005-connected-chat-media";
import type { Migration } from "../../migrations";

export const accountMigrations: readonly Migration[] = [
  accountSchemaMigration,
  connectedChatSchemaMigration,
  durableOutboxEventsMigration,
  topicsCacheMigration,
  connectedChatMediaMigration,
];

export const ACCOUNT_SCHEMA_VERSION = accountMigrations.at(-1)?.version ?? 0;
