import {
  realtimeProtocol,
  validateRealtimeServerFrame,
} from "@/core/contracts/server";
import type { RealtimeTicketWire } from "@/core/contracts/server";
import type { ConnectedChatSyncRepository } from "@/core/database/account/connected-chat-types";

import type { DeltaSyncMapMessage } from "./delta-sync";
import type {
  RealtimeSocket,
  RealtimeSocketFactory,
  RealtimeSocketHandlers,
} from "./realtime-socket";

export type RealtimeSyncDrain = (
  conversationId: string,
  signal: AbortSignal,
) => Promise<Readonly<{ exhausted: boolean }>>;

export type RealtimeSyncState =
  | "idle"
  | "connecting"
  | "connected"
  | "offline"
  | "unauthorized"
  | "upgrade-required"
  | "membership-evicted";

export type RealtimeSyncOnState = (state: RealtimeSyncState) => void;
export type RealtimeSyncOnChanged = (conversationId: string) => void;
export type RealtimeSyncIssueTicket = (
  signal: AbortSignal,
) => Promise<RealtimeTicketWire>;
export type RealtimeSyncSocketUrl = (ticket: RealtimeTicketWire) => string;

export type RealtimeSyncDependencies = Readonly<{
  repository: ConnectedChatSyncRepository;
  isActive: () => boolean;
  drain: RealtimeSyncDrain;
  issueTicket: RealtimeSyncIssueTicket;
  socketUrl: RealtimeSyncSocketUrl;
  createSocket: RealtimeSocketFactory;
  mapMessage: DeltaSyncMapMessage;
  createRequestId: () => string;
  nowMs: () => number;
  random: () => number;
  onChanged: RealtimeSyncOnChanged;
  onConversationEvicted?: (conversationId: string) => void;
  onState: RealtimeSyncOnState;
}>;

export type RealtimeSync = Readonly<{
  start: () => void;
  setConversations: (conversationIds: readonly string[]) => void;
  pause: () => void;
  resume: () => void;
  dispose: () => void;
}>;

const TICKET_WAIT_MS = 10000;
const ACK_WAIT_MS = 10000;
const DELTA_RETRY_WAIT_MS = 1000;
const RECONNECT_BASE_MS = 1000;
const RECONNECT_MAX_MS = 30000;
const MEMBERSHIP_EVICTED_CLOSE_CODE =
  realtimeProtocol.denied_subscribe.close_code;
// realtimeProtocol.selected_D13_A.deadline_close_code (4401) is handled by the
// same reconnect branch as every other retryable close below, not a distinct one.
const HEARTBEAT_INTERVAL_MS =
  realtimeProtocol.heartbeat.client_ping_interval_seconds * 1000;
const PONG_DEADLINE_MS =
  realtimeProtocol.heartbeat.pong_deadline_seconds * 1000;

function structuralStatus(error: unknown): number | null {
  if (typeof error !== "object" || error === null) return null;
  const status = (error as Readonly<{ status?: unknown }>).status;
  return typeof status === "number" ? status : null;
}

type AckWaiter = Readonly<{ conversationId: string; resolve: () => void }>;

type Session = {
  readonly gen: number;
  socket: RealtimeSocket | null;
  openResolve: ((opened: boolean) => void) | null;
  openController: AbortController | null;
  ackController: AbortController | null;
  ackWaiters: Map<string, AckWaiter>;
  pendingPingNonce: string | null;
  heartbeatTimer: ReturnType<typeof setTimeout> | null;
  pongTimer: ReturnType<typeof setTimeout> | null;
};

export function createRealtimeSync(
  deps: RealtimeSyncDependencies,
): RealtimeSync {
  let generation = 0;
  let desired: string[] = [];
  let registered = new Set<string>();
  let paused = true;
  let disposed = false;
  let connectingGeneration: number | null = null;
  let reconnectAttempts = 0;
  let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  let session: Session | null = null;
  let activeTicketController: AbortController | null = null;
  let activeDrainController: AbortController | null = null;
  const recoveryControllers = new Set<AbortController>();
  const recoveryFlights = new Map<
    string,
    Readonly<{ flight: Promise<void>; gen: number }>
  >();
  const realtimeApplyFlights = new Map<
    string,
    Readonly<{ flight: Promise<void>; gen: number }>
  >();
  let unknownRecoveryFlight: Readonly<{
    flight: Promise<void>;
    gen: number;
  }> | null = null;

  function active(gen: number): boolean {
    return !disposed && gen === generation && deps.isActive();
  }

  function clearReconnectTimer(): void {
    if (reconnectTimer !== null) clearTimeout(reconnectTimer);
    reconnectTimer = null;
  }

  function clearHeartbeat(target: Session): void {
    if (target.heartbeatTimer !== null) clearTimeout(target.heartbeatTimer);
    if (target.pongTimer !== null) clearTimeout(target.pongTimer);
    target.heartbeatTimer = null;
    target.pongTimer = null;
  }

  function abortInFlight(): void {
    activeTicketController?.abort();
    activeTicketController = null;
    activeDrainController?.abort();
    activeDrainController = null;
    for (const controller of recoveryControllers) controller.abort();
    recoveryControllers.clear();
    recoveryFlights.clear();
    realtimeApplyFlights.clear();
    unknownRecoveryFlight = null;
  }

  function teardownSession(): void {
    clearReconnectTimer();
    abortInFlight();
    if (session) {
      const target = session;
      session = null;
      clearHeartbeat(target);
      target.openController?.abort();
      target.openController = null;
      target.ackController?.abort();
      target.ackController = null;
      target.openResolve?.(false);
      target.openResolve = null;
      target.ackWaiters.clear();
      target.socket?.close(1000);
      target.socket = null;
    }
    registered = new Set();
  }

  function bumpGeneration(): number {
    teardownSession();
    generation += 1;
    reconnectAttempts = 0;
    return generation;
  }

  function scheduleReconnect(gen: number): void {
    if (!active(gen) || paused) return;
    clearReconnectTimer();
    const attempt = reconnectAttempts;
    reconnectAttempts += 1;
    const base = Math.min(RECONNECT_MAX_MS, RECONNECT_BASE_MS * 2 ** attempt);
    const jitter = Math.floor(base * deps.random());
    const delay = Math.min(RECONNECT_MAX_MS, base + jitter);
    reconnectTimer = setTimeout(() => {
      reconnectTimer = null;
      void connect(gen);
    }, delay);
  }

  function reportState(state: RealtimeSyncState): void {
    try {
      deps.onState(state);
    } catch {
      // Consumer notifications cannot retain a stale connection flight.
    }
  }

  function reportChanged(
    gen: number,
    target: Session,
    conversationId: string,
  ): void {
    if (!active(gen) || session !== target || !registered.has(conversationId))
      return;
    try {
      deps.onChanged(conversationId);
    } catch {
      // Consumer notifications cannot retain a stale connection flight.
    }
  }

  function evictConversation(gen: number, conversationId: string): void {
    desired = desired.filter((id) => id !== conversationId);
    registered.delete(conversationId);
    if (!active(gen)) return;
    try {
      deps.onConversationEvicted?.(conversationId);
    } catch {
      // UI eviction notification cannot retain a stale connection flight.
    }
  }

  function handleFailure(gen: number, error: unknown): void {
    if (!active(gen)) return;
    teardownSession();
    generation += 1;
    const recoveryGeneration = generation;
    const status = structuralStatus(error);
    if (status === 401) {
      reportState("unauthorized");
      return;
    }
    if (status === 426) {
      reportState("upgrade-required");
      return;
    }
    reportState("offline");
    scheduleReconnect(recoveryGeneration);
  }

  function withDeadline<T>(
    promise: Promise<T>,
    ms: number,
    controller: AbortController,
  ): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      let settled = false;
      const settle = (callback: () => void) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        controller.signal.removeEventListener("abort", onAbort);
        callback();
      };
      const onAbort = () =>
        settle(() =>
          reject(
            Object.assign(new Error("bounded_wait_aborted"), { status: 0 }),
          ),
        );
      const timer = setTimeout(() => {
        controller.abort();
        settle(() =>
          reject(
            Object.assign(new Error("bounded_wait_timeout"), { status: 0 }),
          ),
        );
      }, ms);
      controller.signal.addEventListener("abort", onAbort, { once: true });
      if (controller.signal.aborted) {
        onAbort();
        return;
      }
      promise.then(
        (value) => {
          settle(() => resolve(value));
        },
        (error) => {
          settle(() => reject(error));
        },
      );
    });
  }

  function waitForRetry(
    gen: number,
    controller: AbortController,
  ): Promise<boolean> {
    return new Promise((resolve) => {
      let settled = false;
      const settle = (value: boolean) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        controller.signal.removeEventListener("abort", onAbort);
        resolve(value);
      };
      const onAbort = () => settle(false);
      const timer = setTimeout(
        () => settle(active(gen) && !controller.signal.aborted),
        DELTA_RETRY_WAIT_MS,
      );
      controller.signal.addEventListener("abort", onAbort, { once: true });
      if (controller.signal.aborted) onAbort();
    });
  }

  async function drainAllToExhaustion(gen: number): Promise<boolean> {
    for (const conversationId of [...desired]) {
      for (;;) {
        if (!active(gen)) return false;
        const controller = new AbortController();
        activeDrainController = controller;
        let result: Readonly<{ exhausted: boolean }>;
        try {
          result = await deps.drain(conversationId, controller.signal);
        } catch (error) {
          if (!active(gen)) return false;
          const status = structuralStatus(error);
          if (status === 403 || status === 404) {
            evictConversation(gen, conversationId);
            break;
          }
          throw error;
        } finally {
          if (activeDrainController === controller)
            activeDrainController = null;
        }
        if (!active(gen)) return false;
        if (result.exhausted) break;
        const retryController = new AbortController();
        activeDrainController = retryController;
        const retry = await waitForRetry(gen, retryController);
        if (activeDrainController === retryController)
          activeDrainController = null;
        if (!retry || !active(gen)) return false;
      }
    }
    return active(gen);
  }

  function sendPing(gen: number, target: Session): void {
    if (!target.socket) return;
    const nonce = String(deps.random());
    target.pendingPingNonce = nonce;
    target.socket.send(JSON.stringify({ nonce, type: "ping" }));
    target.pongTimer = setTimeout(() => {
      if (!active(gen) || session !== target) return;
      teardownSession();
      handleFailure(
        gen,
        Object.assign(new Error("heartbeat_timeout"), { status: 0 }),
      );
    }, PONG_DEADLINE_MS);
  }

  function startHeartbeat(gen: number, target: Session): void {
    target.heartbeatTimer = setTimeout(() => {
      if (!active(gen) || session !== target) return;
      sendPing(gen, target);
      startHeartbeat(gen, target);
    }, HEARTBEAT_INTERVAL_MS);
  }

  function onPong(target: Session, nonce: string): void {
    if (target.pendingPingNonce === null || nonce !== target.pendingPingNonce)
      return;
    target.pendingPingNonce = null;
    if (target.pongTimer !== null) clearTimeout(target.pongTimer);
    target.pongTimer = null;
  }

  function onSubscribed(
    target: Session,
    requestId: string,
    conversationId: string,
  ): void {
    const waiter = target.ackWaiters.get(requestId);
    if (!waiter || waiter.conversationId !== conversationId) return;
    target.ackWaiters.delete(requestId);
    waiter.resolve();
  }

  function handleRecoveryFailure(
    gen: number,
    conversationId: string,
    error: unknown,
  ): void {
    if (!active(gen)) return;
    const status = structuralStatus(error);
    if (status === 403 || status === 404) {
      evictConversation(gen, conversationId);
      return;
    }
    handleFailure(gen, error);
  }

  function recoverConversation(
    gen: number,
    target: Session,
    conversationId: string,
  ): Promise<void> {
    const existing = recoveryFlights.get(conversationId);
    if (existing?.gen === gen) return existing.flight;
    const controller = new AbortController();
    recoveryControllers.add(controller);
    const flight = (async () => {
      try {
        for (;;) {
          if (!active(gen) || session !== target || controller.signal.aborted)
            return;
          const result = await deps.drain(conversationId, controller.signal);
          if (!active(gen) || session !== target || controller.signal.aborted)
            return;
          if (result.exhausted) return;
          if (!(await waitForRetry(gen, controller))) return;
        }
      } catch (error) {
        if (session === target)
          handleRecoveryFailure(gen, conversationId, error);
      } finally {
        recoveryControllers.delete(controller);
      }
    })();
    recoveryFlights.set(conversationId, { flight, gen });
    void flight.then(() => {
      if (recoveryFlights.get(conversationId)?.flight === flight)
        recoveryFlights.delete(conversationId);
    });
    return flight;
  }

  function startCoalescedDrain(gen: number, target: Session): void {
    if (unknownRecoveryFlight?.gen === gen) return;
    const flight = (async () => {
      for (const conversationId of [...registered]) {
        if (!active(gen) || session !== target) return;
        await recoverConversation(gen, target, conversationId);
      }
    })();
    unknownRecoveryFlight = { flight, gen };
    void flight.then(() => {
      if (unknownRecoveryFlight?.flight === flight)
        unknownRecoveryFlight = null;
    });
  }

  function applyRealtimeMessage(
    gen: number,
    target: Session,
    conversationId: string,
    eventId: string,
    message: ReturnType<DeltaSyncMapMessage>,
  ): void {
    const existing = realtimeApplyFlights.get(conversationId);
    const previous =
      existing?.gen === gen ? existing.flight : Promise.resolve();
    const flight = previous
      .catch(() => undefined)
      .then(async () => {
        if (
          !active(gen) ||
          session !== target ||
          !registered.has(conversationId)
        )
          return;
        try {
          await deps.repository.applyRealtimeMessageCreated({
            eventId,
            message,
          });
        } catch {
          if (
            active(gen) &&
            session === target &&
            registered.has(conversationId)
          ) {
            void recoverConversation(gen, target, conversationId);
          }
          return;
        }
        reportChanged(gen, target, conversationId);
      });
    realtimeApplyFlights.set(conversationId, { flight, gen });
    void flight.then(() => {
      if (realtimeApplyFlights.get(conversationId)?.flight === flight)
        realtimeApplyFlights.delete(conversationId);
    });
  }

  function onMessage(gen: number, target: Session, data: unknown): void {
    if (!active(gen) || session !== target) return;
    let parsed: unknown;
    try {
      parsed = typeof data === "string" ? JSON.parse(data) : null;
    } catch {
      parsed = null;
    }
    if (!validateRealtimeServerFrame(parsed)) {
      startCoalescedDrain(gen, target);
      return;
    }
    switch (parsed.type) {
      case "pong":
        onPong(target, parsed.nonce);
        return;
      case "subscribed":
        onSubscribed(target, parsed.request_id, parsed.conversation_id);
        return;
      case "unsubscribed":
      case "error":
        return;
      case "message.created": {
        const conversationId = parsed.conversation_id;
        if (!registered.has(conversationId)) return;
        let message: ReturnType<DeltaSyncMapMessage>;
        try {
          message = deps.mapMessage(parsed.data);
        } catch {
          return;
        }
        if (message.chatroomId !== conversationId) return;
        applyRealtimeMessage(
          gen,
          target,
          conversationId,
          parsed.event_id,
          message,
        );
        return;
      }
      case "topic.created": {
        const conversationId = parsed.conversation_id;
        if (!registered.has(conversationId)) return;
        void recoverConversation(gen, target, conversationId);
        return;
      }
      default:
        return;
    }
  }

  function onClose(gen: number, target: Session, code: number): void {
    if (session !== target) return;
    session = null;
    clearHeartbeat(target);
    target.openController?.abort();
    target.openController = null;
    target.ackController?.abort();
    target.ackController = null;
    target.openResolve?.(false);
    target.openResolve = null;
    target.ackWaiters.clear();
    if (!active(gen)) return;
    abortInFlight();
    registered = new Set();
    generation += 1;
    const reconnectGeneration = generation;
    if (code === MEMBERSHIP_EVICTED_CLOSE_CODE) {
      reportState("membership-evicted");
      return;
    }
    // AUTH_EXPIRED_CLOSE_CODE (4401) and every other close reconnect the same
    // way: delta-first through connect(), whose fresh issueTicket() call is
    // itself wrapped in the composition layer's authorizedRequest, so a
    // reauthentication happens there rather than a second refresh loop here.
    reportState("offline");
    scheduleReconnect(reconnectGeneration);
  }

  async function subscribeAndWaitAcks(
    gen: number,
    target: Session,
    rooms: readonly string[],
  ): Promise<boolean> {
    if (rooms.length === 0) return true;
    const controller = new AbortController();
    target.ackController = controller;
    const waits = rooms.map(
      (conversationId) =>
        new Promise<void>((resolve) => {
          const requestId = deps.createRequestId();
          target.ackWaiters.set(requestId, { conversationId, resolve });
          target.socket?.send(
            JSON.stringify({
              conversation_id: conversationId,
              request_id: requestId,
              type: "subscribe",
            }),
          );
        }),
    );
    try {
      await withDeadline(Promise.all(waits), ACK_WAIT_MS, controller);
      return true;
    } catch {
      return false;
    } finally {
      if (target.ackController === controller) target.ackController = null;
      target.ackWaiters.clear();
    }
  }

  async function connect(gen: number): Promise<void> {
    if (!active(gen) || paused || connectingGeneration === gen) return;
    connectingGeneration = gen;
    reportState("connecting");
    try {
      const phase1Ok = await drainAllToExhaustion(gen);
      if (!phase1Ok || !active(gen)) return;

      const ticketController = new AbortController();
      activeTicketController = ticketController;
      let ticket: RealtimeTicketWire;
      try {
        ticket = await withDeadline(
          deps.issueTicket(ticketController.signal),
          TICKET_WAIT_MS,
          ticketController,
        );
      } catch (error) {
        if (activeTicketController === ticketController)
          activeTicketController = null;
        if (!active(gen)) return;
        handleFailure(gen, error);
        return;
      }
      if (activeTicketController === ticketController)
        activeTicketController = null;
      if (!active(gen)) return;

      const target: Session = {
        ackWaiters: new Map(),
        ackController: null,
        gen,
        heartbeatTimer: null,
        openController: null,
        openResolve: null,
        pendingPingNonce: null,
        pongTimer: null,
        socket: null,
      };
      session = target;
      const handlers: RealtimeSocketHandlers = {
        close: (code) => onClose(gen, target, code),
        error: () => {
          /* every real disconnect also fires close, which drives recovery */
        },
        message: (data) => onMessage(gen, target, data),
        open: () => target.openResolve?.(true),
      };
      const openedPromise = new Promise<boolean>((resolve) => {
        target.openResolve = resolve;
      });
      const openController = new AbortController();
      target.openController = openController;
      target.socket = deps.createSocket(deps.socketUrl(ticket), handlers);
      let opened: boolean;
      try {
        opened = await withDeadline(
          openedPromise,
          TICKET_WAIT_MS,
          openController,
        );
      } catch (error) {
        if (!active(gen) || session !== target) return;
        handleFailure(gen, error);
        return;
      } finally {
        if (target.openController === openController)
          target.openController = null;
        target.openResolve = null;
      }
      if (!opened || !active(gen) || session !== target) return;

      // Socket liveness is independent of subscription/delta catch-up. A slow
      // phase 2 must not postpone heartbeat or disconnect recovery indefinitely.
      startHeartbeat(gen, target);

      const rooms = [...desired];
      const acked = await subscribeAndWaitAcks(gen, target, rooms);
      if (!active(gen) || session !== target) return;
      if (!acked) {
        teardownSession();
        scheduleReconnect(gen);
        return;
      }

      // ACKed rooms can safely receive real-time events while phase 2 catches
      // the durable event cursor up. A later duplicate in S1 only advances
      // the checkpoint, whereas delaying this registration would lose the
      // post-ACK/pre-phase2 delivery window.
      registered = new Set(rooms.filter((id) => desired.includes(id)));

      const phase2Ok = await drainAllToExhaustion(gen);
      if (!phase2Ok || !active(gen) || session !== target) return;

      reconnectAttempts = 0;
      reportState("connected");
    } catch (error) {
      if (active(gen)) handleFailure(gen, error);
    } finally {
      if (connectingGeneration === gen) connectingGeneration = null;
    }
  }

  function restart(): void {
    if (disposed || paused) return;
    const gen = bumpGeneration();
    void connect(gen);
  }

  return {
    dispose() {
      disposed = true;
      teardownSession();
    },
    pause() {
      if (disposed || paused) return;
      paused = true;
      teardownSession();
      generation += 1;
      reportState("idle");
    },
    resume() {
      if (disposed) return;
      paused = false;
      restart();
    },
    setConversations(conversationIds) {
      const next = [...new Set(conversationIds)];
      const unchanged =
        next.length === desired.length &&
        next.every((id, index) => id === desired[index]);
      if (unchanged) return;
      desired = next;
      if (!paused && !disposed) restart();
    },
    start() {
      if (disposed) return;
      paused = false;
      if (connectingGeneration === generation || session) return;
      restart();
    },
  };
}
