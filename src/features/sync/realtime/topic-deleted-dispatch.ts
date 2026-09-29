import type { TopicDeletedEvent } from "@/core/contracts/server";

/**
 * Narrow S1/WebSocket -> task-app-topics dispatch seam (plan
 * `api_contracts.app_sync_apply.interface`). The sync engine (delta-sync.ts's
 * `applyItem`) owns classifying and durably applying a `topic.deleted` item --
 * ordered checkpoint advance and the `group_topics` dirty-marker fallback
 * stay task-app-chat-owned in delta-sync.ts / connected-chat-sync-repository.ts.
 * This module only fans the already-classified event out to whichever
 * handler(s) task-app-topics registers; it never touches topics cache/list
 * state itself. Both delta-sync.ts's ordered S1 apply and realtime-sync.ts's
 * WebSocket-triggered bounded catch-up drain converge on the same
 * `applyItem` call, so a single `dispatchTopicDeleted` call there covers
 * "S1 and WebSocket" per the plan's `app_sync_apply.topic_deleted` note.
 *
 * Plain module-level `Set`-based pub/sub, no queueing: a handler registered
 * after a dispatch already fired simply misses it, same as every other
 * in-memory listener in this codebase. Multiple listeners are supported
 * (unlike the one-shot `pending-invite-store.ts` precedent) since more than
 * one screen/store may care that a topic was deleted.
 */
export type TopicDeletedHandler = (event: TopicDeletedEvent) => void;

let handlers = new Set<TopicDeletedHandler>();

/** Registers `handler`; returns an unsubscribe function (React effect-cleanup shaped). */
export function registerTopicDeletedHandler(
  handler: TopicDeletedHandler,
): () => void {
  handlers.add(handler);
  return () => {
    handlers.delete(handler);
  };
}

/** Called by the sync engine only (delta-sync.ts's `applyItem`) once a `topic.deleted` item is durably applied. */
export function dispatchTopicDeleted(event: TopicDeletedEvent): void {
  for (const handler of handlers) {
    handler(event);
  }
}

/** Test-only reset so suites don't leak handlers across cases (module-level `Set`). */
export function __resetTopicDeletedHandlersForTests(): void {
  handlers = new Set();
}
