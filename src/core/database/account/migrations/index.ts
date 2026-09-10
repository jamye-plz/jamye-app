import { accountSchemaMigration } from "./001-account-schema";
import { connectedChatSchemaMigration } from "./002-connected-chat-schema";
import { durableOutboxEventsMigration } from "./003-durable-outbox-events";
import { topicsCacheMigration } from "./004-topics-cache";
import type { Migration } from "../../migrations";

export const accountMigrations: readonly Migration[] = [
  accountSchemaMigration,
  connectedChatSchemaMigration,
  durableOutboxEventsMigration,
  topicsCacheMigration,
];
