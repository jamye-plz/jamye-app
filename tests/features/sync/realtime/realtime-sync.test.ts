import type { RealtimeTicketWire } from "@/core/contracts/server";
import type {
  ConnectedCanonicalMessageUpsert,
  ConnectedChatSyncRepository,
  ConnectedRealtimeMessageCreatedInput,
} from "@/core/database/account/connected-chat-types";
import type {
  RealtimeSocket,
  RealtimeSocketFactory,
  RealtimeSocketHandlers,
} from "@/features/sync/realtime/realtime-socket";
import { createRealtimeSync } from "@/features/sync/realtime/realtime-sync";

const ROOM_A = "10000000-0000-4000-8000-000000000001";
const ROOM_B = "10000000-0000-4000-8000-000000000002";
const ROOM_C = "10000000-0000-4000-8000-000000000003";
const ROOM_UNREGISTERED = "10000000-0000-4000-8000-000000000004";
const REQUEST_A = "20000000-0000-4000-8000-000000000001";
const REQUEST_B = "20000000-0000-4000-8000-000000000002";
const MESSAGE_ID = "30000000-0000-4000-8000-000000000001";
const EVENT_ID = "40000000-0000-4000-8000-000000000001";
const SENDER_ID = "50000000-0000-4000-8000-000000000001";

async function flush(): Promise<void> {
  await jest.advanceTimersByTimeAsync(0);
}

function structuralError(status: number): Error {
  return Object.assign(new Error("structural_" + status), { status });
}

function ticket(value: string): RealtimeTicketWire {
  return {
    contract_version: "1",
    expires_at: "2026-09-10T01:00:00Z",
    ticket: value,
  };
}

function mapMessage(): ConnectedCanonicalMessageUpsert {
  return {
    body: "hi",
    chatroomId: ROOM_A,
    clientMsgId: null,
    createdAtRaw: "2026-09-10T00:00:00Z",
    kind: "user",
    localId: MESSAGE_ID,
    media: [],
    senderId: SENDER_ID,
    serverMessageId: MESSAGE_ID,
  };
}

function messageCreatedFrame(conversationId = ROOM_A): string {
  return JSON.stringify({
    conversation_id: conversationId,
    cursor: "5",
    data: {
      body: "hi",
      chatroom_id: conversationId,
      client_msg_id: null,
      created_at: "2026-09-10T00:00:00Z",
      id: MESSAGE_ID,
      media: [],
      sender_id: SENDER_ID,
      type: "user",
    },
    event_id: EVENT_ID,
    occurred_at: "2026-09-10T00:00:00Z",
    type: "message.created",
    version: 1,
  });
}

function topicCreatedFrame(conversationId = ROOM_A): string {
  return JSON.stringify({
    conversation_id: conversationId,
    cursor: "6",
    data: {
      author_id: SENDER_ID,
      chatroom_id: conversationId,
      group_id: "60000000-0000-4000-8000-000000000001",
      title: "New topic",
      topic_id: "60000000-0000-4000-8000-000000000002",
    },
    event_id: "40000000-0000-4000-8000-000000000002",
    occurred_at: "2026-09-10T00:00:00Z",
    type: "topic.created",
    version: 1,
  });
}

function createFakeRepository() {
  const applied: ConnectedRealtimeMessageCreatedInput[] = [];
  const repository: ConnectedChatSyncRepository = {
    async applyOrderedMessageCreated() {
      throw new Error("not used by realtime-sync tests");
    },
    async applyOrderedUnsupportedEvent() {
      throw new Error("not used by realtime-sync tests");
    },
    async applyRealtimeMessageCreated(input) {
      applied.push(input);
      return { status: "applied" as const };
    },
    async claimDueOutboxCommands() {
      return [];
    },
    async failClaimedOutboxCommand() {
      return false;
    },
    async getEventCheckpoint() {
      return null;
    },
    async listDirtyReconciliationScopes() {
      return [];
    },
    async reconcileChatHistory() {
      /* unused */
    },
    async releaseOutboxClaims() {
      return 0;
    },
    async rescheduleClaimedOutboxCommand() {
      return false;
    },
  };
  return { applied, repository };
}

function createFakeSocketFactory() {
  type Instance = Readonly<{
    url: string;
    handlers: RealtimeSocketHandlers;
    sent: string[];
    closed: number[];
  }>;
  const instances: Instance[] = [];
  const factory: RealtimeSocketFactory = (url, handlers) => {
    const sent: string[] = [];
    const closed: number[] = [];
    instances.push({ closed, handlers, sent, url });
    const socket: RealtimeSocket = {
      close: (code = 1000) => {
        closed.push(code);
      },
      send: (frame: string) => {
        sent.push(frame);
        return true;
      },
    };
    return socket;
  };
  return { factory, instances };
}

function ackAllPending(instance: {
  sent: string[];
  handlers: RealtimeSocketHandlers;
}): void {
  const frames = instance.sent
    .map((raw) => JSON.parse(raw) as Record<string, unknown>)
    .filter((frame) => frame.type === "subscribe");
  for (const frame of frames) {
    instance.handlers.message(
      JSON.stringify({
        conversation_id: frame.conversation_id,
        request_id: frame.request_id,
        type: "subscribed",
      }),
    );
  }
}

describe("createRealtimeSync", () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it("connects following phase1 -> R1 ticket -> socket -> subscribe ack barrier -> phase2 -> connected", async () => {
    const order: string[] = [];
    const drain = jest.fn(async (conversationId: string) => {
      order.push("drain:" + conversationId);
      return { exhausted: true };
    });
    const issueTicket = jest.fn(async () => {
      order.push("ticket");
      return ticket("t1");
    });
    const socketUrl = jest.fn(() => "wss://example.test/ws");
    const { factory: createSocket, instances } = createFakeSocketFactory();
    const onState = jest.fn();
    let seq = 0;

    const sync = createRealtimeSync({
      createRequestId: () => [REQUEST_A, REQUEST_B][seq++]!,
      createSocket,
      drain,
      isActive: () => true,
      issueTicket,
      mapMessage,
      nowMs: () => Date.now(),
      onChanged: jest.fn(),
      onState,
      random: () => 0,
      repository: createFakeRepository().repository,
      socketUrl,
    });

    sync.setConversations([ROOM_A, ROOM_B]);
    sync.start();
    await flush();

    expect(order).toEqual(["drain:" + ROOM_A, "drain:" + ROOM_B, "ticket"]);
    expect(instances).toHaveLength(1);

    instances[0].handlers.open();
    await flush();
    expect(instances[0].sent).toHaveLength(2);

    ackAllPending(instances[0]);
    await flush();

    expect(order).toEqual([
      "drain:" + ROOM_A,
      "drain:" + ROOM_B,
      "ticket",
      "drain:" + ROOM_A,
      "drain:" + ROOM_B,
    ]);
    expect(onState.mock.calls.map((call) => call[0])).toEqual([
      "connecting",
      "connected",
    ]);
  });

  it("forwards realtime message.created for a registered room without touching the checkpoint, including duplicates", async () => {
    const drain = jest.fn(async () => ({ exhausted: true }));
    const { factory: createSocket, instances } = createFakeSocketFactory();
    const { applied, repository } = createFakeRepository();

    const sync = createRealtimeSync({
      createRequestId: () => REQUEST_A,
      createSocket,
      drain,
      isActive: () => true,
      issueTicket: jest.fn(async () => ticket("t1")),
      mapMessage,
      nowMs: () => Date.now(),
      onChanged: jest.fn(),
      onState: jest.fn(),
      random: () => 0,
      repository,
      socketUrl: () => "wss://example.test/ws",
    });
    sync.setConversations([ROOM_A]);
    sync.start();
    await flush();
    instances[0].handlers.open();
    await flush();
    ackAllPending(instances[0]);
    await flush();

    const frame = messageCreatedFrame();
    instances[0].handlers.message(frame);
    instances[0].handlers.message(frame);
    await flush();

    expect(applied).toHaveLength(2);
    expect(applied[0].eventId).toBe(EVENT_ID);
  });

  it("ignores realtime message.created for a room that is not registered", async () => {
    const drain = jest.fn(async () => ({ exhausted: true }));
    const { factory: createSocket, instances } = createFakeSocketFactory();
    const { applied, repository } = createFakeRepository();

    const sync = createRealtimeSync({
      createRequestId: () => REQUEST_A,
      createSocket,
      drain,
      isActive: () => true,
      issueTicket: jest.fn(async () => ticket("t1")),
      mapMessage,
      nowMs: () => Date.now(),
      onChanged: jest.fn(),
      onState: jest.fn(),
      random: () => 0,
      repository,
      socketUrl: () => "wss://example.test/ws",
    });
    sync.setConversations([ROOM_A]);
    sync.start();
    await flush();
    instances[0].handlers.open();
    await flush();
    ackAllPending(instances[0]);
    await flush();

    instances[0].handlers.message(messageCreatedFrame(ROOM_UNREGISTERED));
    await flush();

    expect(applied).toHaveLength(0);
  });

  it("triggers only a bounded S1 drain for a valid topic.created event", async () => {
    const drainCalls: string[] = [];
    const drain = jest.fn(async (conversationId: string) => {
      drainCalls.push(conversationId);
      return { exhausted: true };
    });
    const { factory: createSocket, instances } = createFakeSocketFactory();
    const { applied, repository } = createFakeRepository();

    const sync = createRealtimeSync({
      createRequestId: () => REQUEST_A,
      createSocket,
      drain,
      isActive: () => true,
      issueTicket: jest.fn(async () => ticket("t1")),
      mapMessage,
      nowMs: () => Date.now(),
      onChanged: jest.fn(),
      onState: jest.fn(),
      random: () => 0,
      repository,
      socketUrl: () => "wss://example.test/ws",
    });
    sync.setConversations([ROOM_A]);
    sync.start();
    await flush();
    instances[0].handlers.open();
    await flush();
    ackAllPending(instances[0]);
    await flush();
    const drainCountAfterConnect = drainCalls.length;

    instances[0].handlers.message(topicCreatedFrame());
    await flush();

    expect(applied).toHaveLength(0);
    expect(drainCalls.length).toBe(drainCountAfterConnect + 1);
    expect(drainCalls[drainCalls.length - 1]).toBe(ROOM_A);
  });

  it("triggers a bounded coalesced drain and persists nothing for an unknown or invalid WS frame", async () => {
    const drainCalls: string[] = [];
    const drain = jest.fn(async (conversationId: string) => {
      drainCalls.push(conversationId);
      return { exhausted: true };
    });
    const { factory: createSocket, instances } = createFakeSocketFactory();
    const { applied, repository } = createFakeRepository();
    let requestIndex = 0;

    const sync = createRealtimeSync({
      createRequestId: () => [REQUEST_A, REQUEST_B][requestIndex++]!,
      createSocket,
      drain,
      isActive: () => true,
      issueTicket: jest.fn(async () => ticket("t1")),
      mapMessage,
      nowMs: () => Date.now(),
      onChanged: jest.fn(),
      onState: jest.fn(),
      random: () => 0,
      repository,
      socketUrl: () => "wss://example.test/ws",
    });
    sync.setConversations([ROOM_A, ROOM_B]);
    sync.start();
    await flush();
    instances[0].handlers.open();
    await flush();
    ackAllPending(instances[0]);
    await flush();
    const before = drainCalls.length;

    instances[0].handlers.message(
      JSON.stringify({
        cursor: "201",
        event_id: "evt-x",
        type: "future.event",
      }),
    );
    instances[0].handlers.message("not-json{");
    await flush();

    expect(applied).toHaveLength(0);
    const triggered = drainCalls.slice(before);
    expect(triggered).toEqual(expect.arrayContaining([ROOM_A, ROOM_B]));
  });

  it("sends a heartbeat ping every 25s and reconnects delta-first with bounded backoff on a missed pong", async () => {
    const drain = jest.fn(async () => ({ exhausted: true }));
    const issueTicket = jest.fn(async () => ticket("t1"));
    const { factory: createSocket, instances } = createFakeSocketFactory();
    const { repository } = createFakeRepository();

    const sync = createRealtimeSync({
      createRequestId: () => REQUEST_A,
      createSocket,
      drain,
      isActive: () => true,
      issueTicket,
      mapMessage,
      nowMs: () => Date.now(),
      onChanged: jest.fn(),
      onState: jest.fn(),
      random: () => 0,
      repository,
      socketUrl: () => "wss://example.test/ws",
    });
    sync.setConversations([ROOM_A]);
    sync.start();
    await flush();
    instances[0].handlers.open();
    await flush();
    ackAllPending(instances[0]);
    await flush();

    await jest.advanceTimersByTimeAsync(25000);
    const pingFrames = instances[0].sent
      .map((raw) => JSON.parse(raw) as Record<string, unknown>)
      .filter((frame) => frame.type === "ping");
    expect(pingFrames).toHaveLength(1);
    instances[0].handlers.message(
      JSON.stringify({ nonce: pingFrames[0].nonce, type: "pong" }),
    );
    await flush();
    expect(instances[0].closed).toHaveLength(0);

    await jest.advanceTimersByTimeAsync(25000);
    await jest.advanceTimersByTimeAsync(10000);
    expect(instances[0].closed.length).toBeGreaterThan(0);

    await jest.advanceTimersByTimeAsync(5000);
    expect(issueTicket.mock.calls.length).toBeGreaterThan(1);
  });

  it("keeps heartbeat recovery active while phase2 delta is still pending", async () => {
    let phase2Signal: AbortSignal | undefined;
    const drain = jest.fn((_room: string, signal: AbortSignal) => {
      if (drain.mock.calls.length === 2) {
        phase2Signal = signal;
        return new Promise<Readonly<{ exhausted: boolean }>>(() => undefined);
      }
      return Promise.resolve({ exhausted: true });
    });
    const issueTicket = jest.fn(async () => ticket("t1"));
    const { factory: createSocket, instances } = createFakeSocketFactory();
    const { repository } = createFakeRepository();
    const sync = createRealtimeSync({
      createRequestId: () => REQUEST_A,
      createSocket,
      drain,
      isActive: () => true,
      issueTicket,
      mapMessage,
      nowMs: () => Date.now(),
      onChanged: jest.fn(),
      onState: jest.fn(),
      random: () => 0,
      repository,
      socketUrl: () => "wss://example.test/ws",
    });
    try {
      sync.setConversations([ROOM_A]);
      sync.start();
      await flush();
      instances[0].handlers.open();
      await flush();
      ackAllPending(instances[0]);
      await flush();
      expect(drain).toHaveBeenCalledTimes(2);

      await jest.advanceTimersByTimeAsync(25000);
      const pings = instances[0].sent
        .map((raw) => JSON.parse(raw) as Record<string, unknown>)
        .filter((frame) => frame.type === "ping");
      expect(pings).toHaveLength(1);

      await jest.advanceTimersByTimeAsync(10000);
      expect(phase2Signal?.aborted).toBe(true);
      expect(instances[0].closed).toEqual([1000]);
      await jest.advanceTimersByTimeAsync(1000);
      expect(issueTicket).toHaveBeenCalledTimes(2);
    } finally {
      sync.dispose();
    }
  });

  it("4001 clears every registry entry and enters a non-retrying membership-evicted state", async () => {
    const drain = jest.fn(async () => ({ exhausted: true }));
    const issueTicket = jest.fn(async () => ticket("t1"));
    const { factory: createSocket, instances } = createFakeSocketFactory();
    const { repository } = createFakeRepository();
    const onState = jest.fn();

    const options = {
      createRequestId: () => REQUEST_A,
      createSocket,
      drain,
      isActive: () => true,
      issueTicket,
      mapMessage,
      nowMs: () => Date.now(),
      onChanged: jest.fn(),
      onState,
      random: () => 0,
      repository,
      socketUrl: () => "wss://example.test/ws",
    };
    const sync = createRealtimeSync(options);
    sync.setConversations([ROOM_A]);
    sync.start();
    await flush();
    instances[0].handlers.open();
    await flush();
    ackAllPending(instances[0]);
    await flush();

    instances[0].handlers.close(4001);
    await flush();
    expect(onState).toHaveBeenLastCalledWith("membership-evicted");

    await jest.advanceTimersByTimeAsync(60000);
    expect(instances).toHaveLength(1);
  });

  it("4401 clears the registry then performs a fresh delta-first reconnect with a new ticket", async () => {
    const drain = jest.fn(async () => ({ exhausted: true }));
    const issueTicket = jest.fn(async () => ticket("t1"));
    const { factory: createSocket, instances } = createFakeSocketFactory();
    const { repository } = createFakeRepository();

    const sync = createRealtimeSync({
      createRequestId: () => REQUEST_A,
      createSocket,
      drain,
      isActive: () => true,
      issueTicket,
      mapMessage,
      nowMs: () => Date.now(),
      onChanged: jest.fn(),
      onState: jest.fn(),
      random: () => 0,
      repository,
      socketUrl: () => "wss://example.test/ws",
    });
    sync.setConversations([ROOM_A]);
    sync.start();
    await flush();
    instances[0].handlers.open();
    await flush();
    ackAllPending(instances[0]);
    await flush();
    expect(issueTicket).toHaveBeenCalledTimes(1);

    instances[0].handlers.close(4401);
    await flush();
    await jest.advanceTimersByTimeAsync(5000);
    await flush();

    expect(issueTicket.mock.calls.length).toBeGreaterThan(1);
    expect(instances.length).toBeGreaterThan(1);
  });

  it("enters a non-retrying upgrade-required state on a structural 426 during ticket issuance", async () => {
    const drain = jest.fn(async () => ({ exhausted: true }));
    const issueTicket = jest.fn(async () => {
      throw structuralError(426);
    });
    const { factory: createSocket, instances } = createFakeSocketFactory();
    const { repository } = createFakeRepository();
    const onState = jest.fn();

    const options = {
      createRequestId: () => REQUEST_A,
      createSocket,
      drain,
      isActive: () => true,
      issueTicket,
      mapMessage,
      nowMs: () => Date.now(),
      onChanged: jest.fn(),
      onState,
      random: () => 0,
      repository,
      socketUrl: () => "wss://example.test/ws",
    };
    const sync = createRealtimeSync(options);
    sync.setConversations([ROOM_A]);
    sync.start();
    await flush();

    expect(onState).toHaveBeenLastCalledWith("upgrade-required");
    await jest.advanceTimersByTimeAsync(60000);
    expect(instances).toHaveLength(0);
    expect(issueTicket).toHaveBeenCalledTimes(1);
  });

  it("pauses into an unauthorized state on a structural 401 and only retries after resume", async () => {
    let call = 0;
    const drain = jest.fn(async () => {
      call += 1;
      if (call === 1) throw structuralError(401);
      return { exhausted: true };
    });
    const issueTicket = jest.fn(async () => ticket("t1"));
    const { factory: createSocket, instances } = createFakeSocketFactory();
    const { repository } = createFakeRepository();
    const onState = jest.fn();

    const sync = createRealtimeSync({
      createRequestId: () => REQUEST_A,
      createSocket,
      drain,
      isActive: () => true,
      issueTicket,
      mapMessage,
      nowMs: () => Date.now(),
      onChanged: jest.fn(),
      onState,
      random: () => 0,
      repository,
      socketUrl: () => "wss://example.test/ws",
    });
    sync.setConversations([ROOM_A]);
    sync.start();
    await flush();

    expect(onState).toHaveBeenLastCalledWith("unauthorized");
    await jest.advanceTimersByTimeAsync(60000);
    expect(issueTicket).not.toHaveBeenCalled();

    sync.resume();
    await flush();
    instances[0]?.handlers.open();
    await flush();
    if (instances[0]) ackAllPending(instances[0]);
    await flush();

    expect(issueTicket).toHaveBeenCalledTimes(1);
  });

  it("evicts only the conversation rejected with a structural 403/404 and still connects the rest", async () => {
    const drain = jest.fn(async (conversationId: string) => {
      if (conversationId === ROOM_A) throw structuralError(403);
      return { exhausted: true };
    });
    const issueTicket = jest.fn(async () => ticket("t1"));
    const { factory: createSocket, instances } = createFakeSocketFactory();
    const { repository } = createFakeRepository();
    const onState = jest.fn();
    const onConversationEvicted = jest.fn();

    const options = {
      createRequestId: () => REQUEST_A,
      createSocket,
      drain,
      isActive: () => true,
      issueTicket,
      mapMessage,
      nowMs: () => Date.now(),
      onChanged: jest.fn(),
      onConversationEvicted,
      onState,
      random: () => 0,
      repository,
      socketUrl: () => "wss://example.test/ws",
    };
    const sync = createRealtimeSync(options);
    sync.setConversations([ROOM_A, ROOM_B]);
    sync.start();
    await flush();
    instances[0].handlers.open();
    await flush();
    ackAllPending(instances[0]);
    await flush();

    const subscribeFrames = instances[0].sent
      .map((raw) => JSON.parse(raw) as Record<string, unknown>)
      .filter((frame) => frame.type === "subscribe");
    expect(subscribeFrames).toHaveLength(1);
    expect(subscribeFrames[0].conversation_id).toBe(ROOM_B);
    expect(onConversationEvicted).toHaveBeenCalledWith(ROOM_A);
    expect(onState).toHaveBeenLastCalledWith("connected");
  });

  it("cancels timers and aborts the in-flight ticket on pause so a late resolution cannot publish", async () => {
    const drain = jest.fn(async () => ({ exhausted: true }));
    let resolveTicket!: (value: RealtimeTicketWire) => void;
    const issueTicket = jest.fn(
      () =>
        new Promise<RealtimeTicketWire>((resolve) => {
          resolveTicket = resolve;
        }),
    );
    const { factory: createSocket, instances } = createFakeSocketFactory();
    const { repository } = createFakeRepository();
    const onState = jest.fn();

    const sync = createRealtimeSync({
      createRequestId: () => REQUEST_A,
      createSocket,
      drain,
      isActive: () => true,
      issueTicket,
      mapMessage,
      nowMs: () => Date.now(),
      onChanged: jest.fn(),
      onState,
      random: () => 0,
      repository,
      socketUrl: () => "wss://example.test/ws",
    });
    sync.setConversations([ROOM_A]);
    sync.start();
    await flush();
    sync.pause();
    resolveTicket(ticket("late"));
    await flush();
    await jest.advanceTimersByTimeAsync(60000);

    expect(instances).toHaveLength(0);
    expect(onState.mock.calls.map((call) => call[0])).not.toContain(
      "connected",
    );
  });

  it("invalidates an in-flight phase1 and restarts safely when the room set changes mid-flight", async () => {
    const drainCalls: string[] = [];
    let releaseFirstDrain!: () => void;
    const drain = jest.fn((conversationId: string) => {
      drainCalls.push(conversationId);
      if (
        conversationId === ROOM_A &&
        drainCalls.filter((id) => id === ROOM_A).length === 1
      ) {
        return new Promise<{ exhausted: boolean }>((resolve) => {
          releaseFirstDrain = () => resolve({ exhausted: true });
        });
      }
      return Promise.resolve({ exhausted: true });
    });
    const issueTicket = jest.fn(async () => ticket("t1"));
    const { factory: createSocket } = createFakeSocketFactory();
    const { repository } = createFakeRepository();

    const sync = createRealtimeSync({
      createRequestId: () => REQUEST_A,
      createSocket,
      drain,
      isActive: () => true,
      issueTicket,
      mapMessage,
      nowMs: () => Date.now(),
      onChanged: jest.fn(),
      onState: jest.fn(),
      random: () => 0,
      repository,
      socketUrl: () => "wss://example.test/ws",
    });
    sync.setConversations([ROOM_A]);
    sync.start();
    await flush();
    expect(drainCalls).toEqual([ROOM_A]);

    sync.setConversations([ROOM_C]);
    await flush();

    expect(drainCalls).toContain(ROOM_C);

    releaseFirstDrain();
    await flush();
    await flush();

    expect(drainCalls.filter((id) => id === ROOM_A)).toHaveLength(1);
  });

  it("does not overlap connections when start is called twice in a row", async () => {
    const drain = jest.fn(async () => ({ exhausted: true }));
    const issueTicket = jest.fn(async () => ticket("t1"));
    const { factory: createSocket, instances } = createFakeSocketFactory();
    const { repository } = createFakeRepository();

    const sync = createRealtimeSync({
      createRequestId: () => REQUEST_A,
      createSocket,
      drain,
      isActive: () => true,
      issueTicket,
      mapMessage,
      nowMs: () => Date.now(),
      onChanged: jest.fn(),
      onState: jest.fn(),
      random: () => 0,
      repository,
      socketUrl: () => "wss://example.test/ws",
    });
    sync.setConversations([ROOM_A]);
    sync.start();
    sync.start();
    await flush();
    instances[0]?.handlers.open();
    await flush();
    if (instances[0]) ackAllPending(instances[0]);
    await flush();

    expect(instances).toHaveLength(1);
    expect(issueTicket).toHaveBeenCalledTimes(1);
  });

  it("yields before retrying a non-exhausted S1 phase and does not issue a ticket early", async () => {
    const drain = jest
      .fn()
      .mockResolvedValueOnce({ exhausted: false })
      .mockResolvedValueOnce({ exhausted: true });
    const issueTicket = jest.fn(async () => ticket("t1"));
    const { factory: createSocket } = createFakeSocketFactory();
    const sync = createRealtimeSync({
      createRequestId: () => REQUEST_A,
      createSocket,
      drain,
      isActive: () => true,
      issueTicket,
      mapMessage,
      nowMs: () => Date.now(),
      onChanged: jest.fn(),
      onState: jest.fn(),
      random: () => 0,
      repository: createFakeRepository().repository,
      socketUrl: () => "wss://example.test/ws",
    });

    sync.setConversations([ROOM_A]);
    sync.start();
    await flush();
    expect(drain).toHaveBeenCalledTimes(1);
    expect(issueTicket).not.toHaveBeenCalled();
    await jest.advanceTimersByTimeAsync(999);
    expect(drain).toHaveBeenCalledTimes(1);
    await jest.advanceTimersByTimeAsync(1);
    expect(drain).toHaveBeenCalledTimes(2);
    expect(issueTicket).toHaveBeenCalledTimes(1);
  });

  it("bounds an unopened socket and tears it down instead of retaining the connection flight", async () => {
    const { factory: createSocket, instances } = createFakeSocketFactory();
    const onState = jest.fn();
    const sync = createRealtimeSync({
      createRequestId: () => REQUEST_A,
      createSocket,
      drain: jest.fn(async () => ({ exhausted: true })),
      isActive: () => true,
      issueTicket: jest.fn(async () => ticket("t1")),
      mapMessage,
      nowMs: () => Date.now(),
      onChanged: jest.fn(),
      onState,
      random: () => 0,
      repository: createFakeRepository().repository,
      socketUrl: () => "wss://example.test/ws",
    });

    sync.setConversations([ROOM_A]);
    sync.start();
    await flush();
    expect(instances).toHaveLength(1);
    await jest.advanceTimersByTimeAsync(10_000);
    expect(instances[0].closed).toHaveLength(1);
    expect(onState).toHaveBeenLastCalledWith("offline");
  });

  it("does not persist a known WS event when its mapped room differs from the registered room", async () => {
    const { factory: createSocket, instances } = createFakeSocketFactory();
    const { repository } = createFakeRepository();
    const apply = jest.spyOn(repository, "applyRealtimeMessageCreated");
    const sync = createRealtimeSync({
      createRequestId: () => REQUEST_A,
      createSocket,
      drain: jest.fn(async () => ({ exhausted: true })),
      isActive: () => true,
      issueTicket: jest.fn(async () => ticket("t1")),
      mapMessage: () => ({ ...mapMessage(), chatroomId: ROOM_B }),
      nowMs: () => Date.now(),
      onChanged: jest.fn(),
      onState: jest.fn(),
      random: () => 0,
      repository,
      socketUrl: () => "wss://example.test/ws",
    });

    sync.setConversations([ROOM_A]);
    sync.start();
    await flush();
    instances[0].handlers.open();
    await flush();
    ackAllPending(instances[0]);
    await flush();
    instances[0].handlers.message(messageCreatedFrame());
    await flush();

    expect(apply).not.toHaveBeenCalled();
  });

  it("fences a late realtime apply completion so it cannot publish after pause", async () => {
    const { factory: createSocket, instances } = createFakeSocketFactory();
    const { repository } = createFakeRepository();
    let resolveApply!: () => void;
    const apply = jest
      .spyOn(repository, "applyRealtimeMessageCreated")
      .mockImplementation(
        () =>
          new Promise((resolve) => {
            resolveApply = () => resolve({ status: "applied" as const });
          }),
      );
    const onChanged = jest.fn();
    const sync = createRealtimeSync({
      createRequestId: () => REQUEST_A,
      createSocket,
      drain: jest.fn(async () => ({ exhausted: true })),
      isActive: () => true,
      issueTicket: jest.fn(async () => ticket("t1")),
      mapMessage,
      nowMs: () => Date.now(),
      onChanged,
      onState: jest.fn(),
      random: () => 0,
      repository,
      socketUrl: () => "wss://example.test/ws",
    });

    sync.setConversations([ROOM_A]);
    sync.start();
    await flush();
    instances[0].handlers.open();
    await flush();
    ackAllPending(instances[0]);
    await flush();
    instances[0].handlers.message(messageCreatedFrame());
    await flush();
    expect(apply).toHaveBeenCalledTimes(1);
    sync.pause();
    resolveApply();
    await flush();

    expect(onChanged).not.toHaveBeenCalled();
  });

  it("coalesces repeated unknown frames into one bounded drain per registered room", async () => {
    const drainCalls: string[] = [];
    const { factory: createSocket, instances } = createFakeSocketFactory();
    let requestIndex = 0;
    const sync = createRealtimeSync({
      createRequestId: () => [REQUEST_A, REQUEST_B][requestIndex++]!,
      createSocket,
      drain: jest.fn(async (conversationId: string) => {
        drainCalls.push(conversationId);
        return { exhausted: true };
      }),
      isActive: () => true,
      issueTicket: jest.fn(async () => ticket("t1")),
      mapMessage,
      nowMs: () => Date.now(),
      onChanged: jest.fn(),
      onState: jest.fn(),
      random: () => 0,
      repository: createFakeRepository().repository,
      socketUrl: () => "wss://example.test/ws",
    });

    sync.setConversations([ROOM_A, ROOM_B]);
    sync.start();
    await flush();
    instances[0].handlers.open();
    await flush();
    ackAllPending(instances[0]);
    await flush();
    const before = drainCalls.length;
    instances[0].handlers.message("not-json{");
    instances[0].handlers.message("not-json{");
    await flush();

    expect(drainCalls.slice(before)).toEqual(
      expect.arrayContaining([ROOM_A, ROOM_B]),
    );
    expect(drainCalls).toHaveLength(before + 2);
  });

  it("reconnects after a normal close even when the old phase2 drain never settles", async () => {
    const drain = jest.fn(() => {
      if (drain.mock.calls.length === 2) {
        return new Promise<Readonly<{ exhausted: boolean }>>(() => undefined);
      }
      return Promise.resolve({ exhausted: true });
    });
    const issueTicket = jest.fn(async () => ticket("t1"));
    const { factory: createSocket, instances } = createFakeSocketFactory();
    const sync = createRealtimeSync({
      createRequestId: () => REQUEST_A,
      createSocket,
      drain,
      isActive: () => true,
      issueTicket,
      mapMessage,
      nowMs: () => Date.now(),
      onChanged: jest.fn(),
      onState: jest.fn(),
      random: () => 0,
      repository: createFakeRepository().repository,
      socketUrl: () => "wss://example.test/ws",
    });

    sync.setConversations([ROOM_A]);
    sync.start();
    await flush();
    instances[0].handlers.open();
    await flush();
    ackAllPending(instances[0]);
    await flush();
    expect(drain).toHaveBeenCalledTimes(2);
    instances[0].handlers.close(1006);
    await jest.advanceTimersByTimeAsync(1_000);
    await flush();

    expect(issueTicket).toHaveBeenCalledTimes(2);
  });

  it("continues a bounded S1 recovery until exhaustion after a topic event", async () => {
    const drain = jest.fn(async () => {
      if (drain.mock.calls.length === 3) return { exhausted: false };
      return { exhausted: true };
    });
    const { factory: createSocket, instances } = createFakeSocketFactory();
    const sync = createRealtimeSync({
      createRequestId: () => REQUEST_A,
      createSocket,
      drain,
      isActive: () => true,
      issueTicket: jest.fn(async () => ticket("t1")),
      mapMessage,
      nowMs: () => Date.now(),
      onChanged: jest.fn(),
      onState: jest.fn(),
      random: () => 0,
      repository: createFakeRepository().repository,
      socketUrl: () => "wss://example.test/ws",
    });

    sync.setConversations([ROOM_A]);
    sync.start();
    await flush();
    instances[0].handlers.open();
    await flush();
    ackAllPending(instances[0]);
    await flush();
    expect(drain).toHaveBeenCalledTimes(2);

    instances[0].handlers.message(topicCreatedFrame());
    await flush();
    expect(drain).toHaveBeenCalledTimes(3);
    await jest.advanceTimersByTimeAsync(999);
    expect(drain).toHaveBeenCalledTimes(3);
    await jest.advanceTimersByTimeAsync(1);
    expect(drain).toHaveBeenCalledTimes(4);
  });

  it("requests bounded S1 recovery when realtime message persistence fails", async () => {
    const drain = jest.fn(async () => ({ exhausted: true }));
    const { factory: createSocket, instances } = createFakeSocketFactory();
    const { repository } = createFakeRepository();
    const apply = jest
      .spyOn(repository, "applyRealtimeMessageCreated")
      .mockRejectedValueOnce(new Error("sqlite_write_failed"));
    const sync = createRealtimeSync({
      createRequestId: () => REQUEST_A,
      createSocket,
      drain,
      isActive: () => true,
      issueTicket: jest.fn(async () => ticket("t1")),
      mapMessage,
      nowMs: () => Date.now(),
      onChanged: jest.fn(),
      onState: jest.fn(),
      random: () => 0,
      repository,
      socketUrl: () => "wss://example.test/ws",
    });

    sync.setConversations([ROOM_A]);
    sync.start();
    await flush();
    instances[0].handlers.open();
    await flush();
    ackAllPending(instances[0]);
    await flush();
    const before = drain.mock.calls.length;

    instances[0].handlers.message(messageCreatedFrame());
    await flush();
    await flush();

    expect(apply).toHaveBeenCalledTimes(1);
    expect(drain).toHaveBeenCalledTimes(before + 1);
  });

  it("reconnects on a fresh generation when recovery fails while old phase2 ignores abort", async () => {
    const drain = jest.fn(() => {
      if (drain.mock.calls.length === 2) {
        return new Promise<Readonly<{ exhausted: boolean }>>(() => undefined);
      }
      if (drain.mock.calls.length === 3)
        return Promise.reject(structuralError(503));
      return Promise.resolve({ exhausted: true });
    });
    const issueTicket = jest.fn(async () => ticket("t1"));
    const { factory: createSocket, instances } = createFakeSocketFactory();
    const { repository } = createFakeRepository();
    jest
      .spyOn(repository, "applyRealtimeMessageCreated")
      .mockRejectedValueOnce(new Error("sqlite_write_failed"));
    const sync = createRealtimeSync({
      createRequestId: () => REQUEST_A,
      createSocket,
      drain,
      isActive: () => true,
      issueTicket,
      mapMessage,
      nowMs: () => Date.now(),
      onChanged: jest.fn(),
      onState: jest.fn(),
      random: () => 0,
      repository,
      socketUrl: () => "wss://example.test/ws",
    });

    sync.setConversations([ROOM_A]);
    sync.start();
    await flush();
    instances[0].handlers.open();
    await flush();
    ackAllPending(instances[0]);
    await flush();
    expect(drain).toHaveBeenCalledTimes(2);

    instances[0].handlers.message(messageCreatedFrame());
    await flush();
    await flush();
    await jest.advanceTimersByTimeAsync(1_000);
    await flush();

    expect(issueTicket).toHaveBeenCalledTimes(2);
  });
});
