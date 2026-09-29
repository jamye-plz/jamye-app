import { classifyDeltaItem } from "@/core/contracts/server";
import type {
  CanonicalMessageWire,
  ClassifiedDeltaItem,
  EventPageWire,
  ReconcileScopeWire,
} from "@/core/contracts/server";
import type {
  ConnectedCanonicalMessageUpsert,
  ConnectedChatSyncRepository,
  ConnectedHistoryMessageUpsert,
  ConnectedOrderedEventApplyResult,
} from "@/core/database/account/connected-chat-types";

import { dispatchTopicDeleted } from "./topic-deleted-dispatch";

export const DELTA_SYNC_MAX_PAGES_PER_DRAIN = 10;

export type DeltaSyncListEvents = (
  conversationId: string,
  after: string | null,
  signal: AbortSignal,
) => Promise<EventPageWire>;

export type DeltaSyncMapMessage = (
  data: CanonicalMessageWire,
) => ConnectedCanonicalMessageUpsert;

export type DeltaSyncHistoryRefresh = Readonly<{
  complete: boolean;
  messages: readonly ConnectedHistoryMessageUpsert[];
}>;

export type DeltaSyncRefreshHistory = (
  conversationId: string,
  signal: AbortSignal,
) => Promise<DeltaSyncHistoryRefresh>;

export type DeltaSyncOnChanged = (conversationId: string) => void;

export type DeltaSyncDependencies = Readonly<{
  repository: ConnectedChatSyncRepository;
  isActive: () => boolean;
  listEvents: DeltaSyncListEvents;
  mapMessage: DeltaSyncMapMessage;
  refreshHistory: DeltaSyncRefreshHistory;
  onChanged: DeltaSyncOnChanged;
}>;

export type DeltaSyncDrainResult = Readonly<{ exhausted: boolean }>;

export type DeltaSync = Readonly<{
  drain: (
    conversationId: string,
    signal: AbortSignal,
  ) => Promise<DeltaSyncDrainResult>;
}>;

// M15/task-14 phase 1 (E17 fix): typed v2 delete events (message.deleted/
// topic.deleted) have no reconcile_scope of their own. Only called for a
// classified item that is not "message.created"/"message.deleted" (applyItem
// returns before reaching this for those kinds); "unsupported" v1 fallback
// items still use their own server-provided reconcile_scope, and
// "topic.deleted" keeps routing through the group_topics dirty-marker +
// REST-reconcile fallback below in addition to the narrow callback dispatch,
// since REST already excludes deleted content per contract v2 (E1).
function reconcileScopeOf(classified: ClassifiedDeltaItem): ReconcileScopeWire {
  if (classified.kind === "unsupported")
    return classified.event.reconcile_scope;
  return "group_topics";
}

function stopped(): DeltaSyncDrainResult {
  return { exhausted: false };
}

function isAuthoritativeFailure(error: unknown): boolean {
  if (typeof error !== "object" || error === null) return false;
  const status = (error as Readonly<{ status?: unknown }>).status;
  return status === 401 || status === 403 || status === 404 || status === 426;
}

export function createDeltaSync(deps: DeltaSyncDependencies): DeltaSync {
  const flights = new Map<
    string,
    Readonly<{ flight: Promise<DeltaSyncDrainResult>; signal: AbortSignal }>
  >();

  function cancelled(signal: AbortSignal): boolean {
    return !deps.isActive() || signal.aborted;
  }

  function reportChanged(conversationId: string, signal: AbortSignal): void {
    if (cancelled(signal)) return;
    try {
      deps.onChanged(conversationId);
    } catch {
      // Consumer notification cannot invalidate ordered cursor work.
    }
  }

  async function reconcileDirtyChatHistory(
    conversationId: string,
    signal: AbortSignal,
    attemptedMarkers: Set<string>,
  ): Promise<void> {
    try {
      const scopes =
        await deps.repository.listDirtyReconciliationScopes(conversationId);
      const marker = scopes.find((entry) => entry.scope === "chat_history");
      if (!marker || attemptedMarkers.has(marker.markerEventId)) return;
      attemptedMarkers.add(marker.markerEventId);
      if (cancelled(signal)) return;
      const refreshed = await deps.refreshHistory(conversationId, signal);
      if (cancelled(signal) || !refreshed.complete) return;
      await deps.repository.reconcileChatHistory({
        chatroomId: conversationId,
        expectedMarkerEventId: marker.markerEventId,
        messages: refreshed.messages,
      });
      reportChanged(conversationId, signal);
    } catch (error) {
      if (isAuthoritativeFailure(error)) throw error;
      return;
    }
  }

  async function applyItem(
    conversationId: string,
    classified: ClassifiedDeltaItem,
    expectedCursor: string | null,
    signal: AbortSignal,
  ): Promise<ConnectedOrderedEventApplyResult | "rejected"> {
    if (classified.kind === "message.created") {
      const event = classified.event;
      if (event.version !== 1) return "rejected";
      if (event.conversation_id !== conversationId) return "rejected";
      const message = deps.mapMessage(event.data);
      if (message.chatroomId !== conversationId) return "rejected";
      const result = await deps.repository.applyOrderedMessageCreated({
        chatroomId: conversationId,
        cursor: event.cursor,
        eventId: event.event_id,
        expectedCursor,
        message,
      });
      if (result.status === "applied" || result.status === "duplicate") {
        reportChanged(conversationId, signal);
      }
      return result;
    }
    if (classified.kind === "message.deleted") {
      // AC2: S1-ordered apply records the monotonic tombstone directly (no
      // dirty-marker indirection needed -- unlike topic.deleted, this event
      // fully identifies the row to update). The WebSocket-triggered bounded
      // catch-up drain (realtime-sync.ts's grouped message.deleted case)
      // converges on this exact same applyItem call, so a single tombstone
      // write here covers "S1 순서 적용과 WebSocket 수신 모두" (AC2).
      const event = classified.event;
      if (event.conversation_id !== conversationId) return "rejected";
      const result = await deps.repository.applyOrderedMessageDeleted({
        chatroomId: conversationId,
        cursor: event.cursor,
        deletedAtMs: Date.now(),
        eventId: event.event_id,
        expectedCursor,
        serverMessageId: event.data.message_id,
      });
      if (result.status === "applied" || result.status === "duplicate") {
        reportChanged(conversationId, signal);
      }
      return result;
    }
    const reconcileScope = reconcileScopeOf(classified);
    const result = await deps.repository.applyOrderedUnsupportedEvent({
      chatroomId: conversationId,
      cursor: classified.event.cursor,
      eventId: classified.event.event_id,
      expectedCursor,
      reconcileScope,
    });
    if (result.status === "applied" || result.status === "duplicate") {
      // AC7: the sync engine only fans the already-classified topic.deleted
      // event out through the narrow callback (plan api_contracts.
      // app_sync_apply.interface) -- topics cache/list state stays
      // task-app-topics' own concern, never touched here.
      if (classified.kind === "topic.deleted") {
        dispatchTopicDeleted(classified.event);
      }
      if (reconcileScope === "group_topics") {
        // The topic consumer owns refetch + matching-marker clearance. Notify
        // only after the ordered event and its durable marker have committed.
        reportChanged(conversationId, signal);
      }
    }
    return result;
  }

  async function drainOnce(
    conversationId: string,
    signal: AbortSignal,
  ): Promise<DeltaSyncDrainResult> {
    const seenAfters = new Set<string>();
    const attemptedDirtyMarkers = new Set<string>();
    for (let page = 0; page < DELTA_SYNC_MAX_PAGES_PER_DRAIN; page += 1) {
      if (cancelled(signal)) return stopped();
      const after = await deps.repository.getEventCheckpoint(conversationId);
      if (cancelled(signal)) return stopped();

      const afterKey = after === null ? " null" : after;
      if (seenAfters.has(afterKey)) return stopped();
      seenAfters.add(afterKey);

      let pageResult: EventPageWire;
      try {
        pageResult = await deps.listEvents(conversationId, after, signal);
      } catch (error) {
        if (cancelled(signal)) return stopped();
        throw error;
      }
      if (cancelled(signal)) return stopped();

      if (pageResult.items.length === 0) {
        await reconcileDirtyChatHistory(
          conversationId,
          signal,
          attemptedDirtyMarkers,
        );
        if (cancelled(signal)) return stopped();
        return { exhausted: pageResult.next_cursor === null };
      }

      let expected = after;
      let mismatch = false;
      for (const item of pageResult.items) {
        if (cancelled(signal)) return stopped();
        const classified = classifyDeltaItem(item);
        const result = await applyItem(
          conversationId,
          classified,
          expected,
          signal,
        );
        if (cancelled(signal)) return stopped();
        if (result === "rejected") return stopped();
        if (result.status === "checkpoint_mismatch") {
          mismatch = true;
          break;
        }
        if (result.status === "no_progress") return stopped();
        if (
          result.status === "applied" &&
          classified.kind !== "message.created" &&
          classified.kind !== "message.deleted" &&
          reconcileScopeOf(classified) === "chat_history"
        ) {
          await reconcileDirtyChatHistory(
            conversationId,
            signal,
            attemptedDirtyMarkers,
          );
          if (cancelled(signal)) return stopped();
        }
        expected = result.checkpoint;
      }
      if (mismatch) continue;
      if (pageResult.next_cursor === null) return { exhausted: true };
    }
    return stopped();
  }

  return {
    drain(conversationId, signal) {
      const inFlight = flights.get(conversationId);
      if (inFlight && !inFlight.signal.aborted) return inFlight.flight;
      const flight = drainOnce(conversationId, signal).finally(() => {
        if (flights.get(conversationId)?.flight === flight)
          flights.delete(conversationId);
      });
      flights.set(conversationId, { flight, signal });
      return flight;
    },
  };
}
