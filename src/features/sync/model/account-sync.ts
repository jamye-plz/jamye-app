import type { AccountPrincipal } from "@/core/database/account/types";
import type { ConnectedChatRepository } from "@/core/database/account/connected-chat-types";
import { createOutboxDispatcher } from "../outbox/outbox-dispatcher";
import type { OutboxSendFailure } from "../outbox/outbox-dispatcher";
import { createDeltaSync } from "../realtime/delta-sync";
import type { DeltaSyncDependencies } from "../realtime/delta-sync";
import { createRealtimeSync } from "../realtime/realtime-sync";
import type {
  RealtimeSyncDependencies,
  RealtimeSyncState,
} from "../realtime/realtime-sync";

type DispatcherDependencies = Parameters<typeof createOutboxDispatcher>[0];
export type AccountSyncDependencies = Readonly<{
  principal: AccountPrincipal;
  repository: ConnectedChatRepository;
  isActive: () => boolean;
  send: DispatcherDependencies["send"];
  createLeaseToken: () => string;
  onChanged: () => void | Promise<void>;
  onState: (state: RealtimeSyncState) => void;
  onConversationEvicted?: (conversationId: string) => void;
}> &
  Pick<DeltaSyncDependencies, "listEvents" | "mapMessage" | "refreshHistory"> &
  Pick<
    RealtimeSyncDependencies,
    | "issueTicket"
    | "socketUrl"
    | "createSocket"
    | "createRequestId"
    | "nowMs"
    | "random"
  >;

/** Keep transport diagnostics and credentials out of durable failure records. */
export function toOutboxSendFailure(error: unknown): OutboxSendFailure {
  const record = error !== null && typeof error === "object" ? error : {};
  const status = "status" in record ? record.status : 0;
  if (status === 408) return { kind: "timeout" };
  if (status === 401) return { kind: "unauthorized" };
  if (status === 403) return { kind: "forbidden" };
  if (status === 404) return { kind: "not_found" };
  if (status === 409) return { kind: "conflict" };
  if (status === 422) return { kind: "validation" };
  if (status === 426) return { kind: "upgrade_required" };
  if (status === 429) {
    const seconds =
      "retryAfterSeconds" in record ? record.retryAfterSeconds : null;
    const milliseconds = typeof seconds === "number" ? seconds * 1000 : NaN;
    return Number.isSafeInteger(milliseconds) && milliseconds >= 0
      ? { kind: "rate_limited", retryAfterMs: milliseconds }
      : { kind: "rate_limited" };
  }
  if (typeof status === "number" && status >= 500)
    return { kind: "server_error" };
  return { kind: "network" };
}

/** One foreground lifecycle per verified account/DB scope; constructing it does no IO. */
export function createAccountSync(deps: AccountSyncDependencies) {
  let disposed = false;
  let started = false;
  let paused = false;
  let terminal: RealtimeSyncState | null = null;
  let conversations: readonly string[] = [];
  const current = () => !disposed && deps.isActive();
  const runnable = () => current() && !terminal;

  function notifyChanged() {
    if (!current()) return;
    const failed = () => {
      if (current() && !terminal) deps.onState("offline");
    };
    try {
      void Promise.resolve(deps.onChanged()).catch(failed);
    } catch {
      failed();
    }
  }

  function onState(state: RealtimeSyncState) {
    if (!current() || terminal) return;
    if (
      state === "unauthorized" ||
      state === "upgrade-required" ||
      state === "membership-evicted"
    ) {
      terminal = state;
      outbox.pause();
      realtime.pause();
    }
    deps.onState(state);
  }

  const delta = createDeltaSync({
    ...deps,
    isActive: current,
    onChanged: notifyChanged,
  });
  const outbox = createOutboxDispatcher({
    ...deps,
    // The dispatcher owns disposal fencing and must still release its live lease.
    isActive: deps.isActive,
    onChanged: notifyChanged,
    onPaused: onState,
    async send(command, signal) {
      try {
        return await deps.send(command, signal);
      } catch (error) {
        throw toOutboxSendFailure(error);
      }
    },
  });
  const realtime = createRealtimeSync({
    ...deps,
    isActive: current,
    drain: delta.drain,
    onChanged: notifyChanged,
    onState,
    onConversationEvicted: (roomId) => {
      if (current()) deps.onConversationEvicted?.(roomId);
    },
  });

  return {
    start() {
      if (!runnable() || started) return;
      started = true;
      paused = false;
      outbox.start();
      realtime.start();
    },
    wake() {
      if (runnable() && started && !paused) outbox.wake();
    },
    setConversations(ids: readonly string[]) {
      if (!current()) return;
      const next = [...new Set(ids)].sort();
      const changed =
        next.length !== conversations.length ||
        next.some((id, index) => id !== conversations[index]);
      conversations = next;
      // Membership eviction requires a fresh authorized room inventory, never a timer retry.
      const recovered =
        terminal === "membership-evicted" && changed && next.length > 0;
      if (recovered) terminal = null;
      if (terminal) return;
      realtime.setConversations(next);
      if (recovered && started && !paused) {
        outbox.resume();
        realtime.resume();
      }
    },
    pause() {
      if (disposed || paused) return;
      paused = true;
      outbox.pause();
      realtime.pause();
    },
    resume() {
      if (!runnable() || !started || !paused) return;
      paused = false;
      outbox.resume();
      realtime.resume();
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      outbox.dispose();
      realtime.dispose();
    },
  };
}
