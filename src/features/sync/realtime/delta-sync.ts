import type {
  CanonicalMessageWire,
  DeltaItemWire,
  EventPageWire,
} from "@/core/contracts/server";
import type {
  ConnectedCanonicalMessageUpsert,
  ConnectedChatSyncRepository,
  ConnectedHistoryMessageUpsert,
  ConnectedOrderedEventApplyResult,
} from "@/core/database/account/connected-chat-types";

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

function isMessageCreatedItem(
  item: DeltaItemWire,
): item is Extract<DeltaItemWire, Readonly<{ data: CanonicalMessageWire }>> {
  return "data" in item;
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
    item: DeltaItemWire,
    expectedCursor: string | null,
    signal: AbortSignal,
  ): Promise<ConnectedOrderedEventApplyResult | "rejected"> {
    if (isMessageCreatedItem(item)) {
      if (item.type !== "message.created" || item.version !== 1)
        return "rejected";
      if (item.conversation_id !== conversationId) return "rejected";
      const message = deps.mapMessage(item.data);
      if (message.chatroomId !== conversationId) return "rejected";
      const result = await deps.repository.applyOrderedMessageCreated({
        chatroomId: conversationId,
        cursor: item.cursor,
        eventId: item.event_id,
        expectedCursor,
        message,
      });
      if (result.status === "applied" || result.status === "duplicate") {
        reportChanged(conversationId, signal);
      }
      return result;
    }
    const result = await deps.repository.applyOrderedUnsupportedEvent({
      chatroomId: conversationId,
      cursor: item.cursor,
      eventId: item.event_id,
      expectedCursor,
      reconcileScope: item.reconcile_scope,
    });
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
        const result = await applyItem(conversationId, item, expected, signal);
        if (cancelled(signal)) return stopped();
        if (result === "rejected") return stopped();
        if (result.status === "checkpoint_mismatch") {
          mismatch = true;
          break;
        }
        if (result.status === "no_progress") return stopped();
        if (
          result.status === "applied" &&
          !isMessageCreatedItem(item) &&
          item.reconcile_scope === "chat_history"
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
