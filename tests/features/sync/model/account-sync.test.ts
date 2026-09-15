import {
  createAccountSync,
  toOutboxSendFailure,
} from "@/features/sync/model/account-sync";
import {
  CHATROOM_ID,
  PRINCIPAL,
  SERVER_MESSAGE_ID,
  deferred,
  fakeConnectedChatRepository,
  repositoryCanonicalRow,
} from "../../chat/model/connected-chat-fixtures";
import type {
  CanonicalMessageWire,
  EventPageWire,
} from "@/core/contracts/server";
import type { RealtimeSocketHandlers } from "@/features/sync/realtime/realtime-socket";

jest.mock("@/features/sync/outbox/outbox-dispatcher", () => ({
  createOutboxDispatcher: jest.fn(() => ({
    start: jest.fn(),
    wake: jest.fn(),
    pause: jest.fn(),
    resume: jest.fn(),
    dispose: jest.fn(),
  })),
}));
jest.mock("@/features/sync/realtime/delta-sync", () => ({
  createDeltaSync: jest.fn(() => ({ drain: jest.fn() })),
}));
jest.mock("@/features/sync/realtime/realtime-sync", () => ({
  createRealtimeSync: jest.fn(() => ({
    start: jest.fn(),
    setConversations: jest.fn(),
    pause: jest.fn(),
    resume: jest.fn(),
    dispose: jest.fn(),
  })),
}));

function setup() {
  const options = {
    principal: PRINCIPAL,
    repository: fakeConnectedChatRepository(),
    isActive: jest.fn(() => true),
    send: jest.fn(),
    listEvents: jest.fn(),
    issueTicket: jest.fn(),
    refreshHistory: jest.fn(),
    mapMessage: () => ({
      ...repositoryCanonicalRow(),
      createdAtRaw: "2026-09-10T00:00:00Z",
      serverMessageId: "server",
    }),
    socketUrl: () => "wss://example.test",
    createSocket: jest.fn(),
    createRequestId: () => "request",
    createLeaseToken: () => "lease",
    nowMs: () => 0,
    random: () => 0,
    onChanged: jest.fn(),
    onState: jest.fn(),
  };
  const runtime = createAccountSync(options);
  const outboxFactory = jest.requireMock(
    "@/features/sync/outbox/outbox-dispatcher",
  ).createOutboxDispatcher;
  const realtimeFactory = jest.requireMock(
    "@/features/sync/realtime/realtime-sync",
  ).createRealtimeSync;
  return {
    options,
    runtime,
    outbox: outboxFactory.mock.results.at(-1).value,
    realtime: realtimeFactory.mock.results.at(-1).value,
    outboxOptions: outboxFactory.mock.calls.at(-1)[0],
    realtimeOptions: realtimeFactory.mock.calls.at(-1)[0],
  };
}

beforeEach(() => jest.clearAllMocks());

test("construction has no IO and foreground owns one shared lifecycle", () => {
  const f = setup();
  expect(f.outbox.start).not.toHaveBeenCalled();
  expect(f.realtime.start).not.toHaveBeenCalled();
  f.runtime.start();
  f.runtime.start();
  expect(f.outbox.start).toHaveBeenCalledTimes(1);
  expect(f.realtime.start).toHaveBeenCalledTimes(1);
  f.runtime.setConversations(["room"]);
  expect(f.realtime.setConversations).toHaveBeenCalledWith(["room"]);
  f.runtime.wake();
  expect(f.outbox.wake).toHaveBeenCalledTimes(1);
  f.runtime.pause();
  expect(f.outbox.pause).toHaveBeenCalledTimes(1);
  expect(f.realtime.pause).toHaveBeenCalledTimes(1);
  f.runtime.resume();
  expect(f.outbox.resume).toHaveBeenCalledTimes(1);
  expect(f.realtime.resume).toHaveBeenCalledTimes(1);
  f.runtime.dispose();
  f.runtime.dispose();
  expect(f.outbox.dispose).toHaveBeenCalledTimes(1);
  expect(f.realtime.dispose).toHaveBeenCalledTimes(1);
});

test.each(["unauthorized", "upgrade-required"])(
  "outbox %s pauses both sides and cannot be restarted by foreground",
  (reason) => {
    const f = setup();
    f.runtime.start();
    f.outboxOptions.onPaused(reason);
    expect(f.options.onState).toHaveBeenLastCalledWith(reason);
    expect(f.realtime.pause).toHaveBeenCalledTimes(1);
    f.runtime.resume();
    f.runtime.wake();
    f.runtime.start();
    expect(f.outbox.resume).not.toHaveBeenCalled();
    expect(f.outbox.wake).not.toHaveBeenCalled();
    f.runtime.dispose();
  },
);

test("realtime upgrade/auth state also stops the sender and stale callbacks cannot publish", async () => {
  const f = setup();
  f.runtime.start();
  f.realtimeOptions.onState("upgrade-required");
  expect(f.outbox.pause).toHaveBeenCalledTimes(1);
  f.options.isActive.mockReturnValue(false);
  f.realtimeOptions.onState("connected");
  f.outboxOptions.onChanged();
  await Promise.resolve();
  expect(f.options.onState).toHaveBeenLastCalledWith("upgrade-required");
  expect(f.options.onChanged).not.toHaveBeenCalled();
  f.runtime.dispose();
});

test("a fresh room inventory resumes both coordinators after membership eviction", () => {
  const f = setup();
  f.runtime.setConversations(["old-room"]);
  f.runtime.start();
  f.realtimeOptions.onState("membership-evicted");
  f.runtime.resume();
  f.runtime.setConversations(["old-room"]);
  expect(f.outbox.resume).not.toHaveBeenCalled();
  expect(f.realtime.resume).not.toHaveBeenCalled();

  f.runtime.setConversations(["authorized-room"]);
  expect(f.realtime.setConversations).toHaveBeenLastCalledWith([
    "authorized-room",
  ]);
  expect(f.outbox.resume).toHaveBeenCalledTimes(1);
  expect(f.realtime.resume).toHaveBeenCalledTimes(1);
  f.runtime.dispose();
});

test("the injected authorized C4 keeps identity/signal and translates only structural failure policy", async () => {
  const f = setup();
  const command = { commandId: "immutable" };
  const signal = new AbortController().signal;
  const message = repositoryCanonicalRow();
  f.options.send.mockResolvedValueOnce(message);
  await expect(f.outboxOptions.send(command, signal)).resolves.toEqual(message);
  expect(f.options.send).toHaveBeenCalledWith(command, signal);
  f.options.send.mockRejectedValueOnce({
    status: 429,
    retryAfterSeconds: 3600,
    detail: "never surface",
  });
  await expect(f.outboxOptions.send(command, signal)).rejects.toEqual({
    kind: "rate_limited",
    retryAfterMs: 3_600_000,
  });
  f.runtime.dispose();
});

test.each([
  [0, "network"],
  [408, "timeout"],
  [401, "unauthorized"],
  [403, "forbidden"],
  [404, "not_found"],
  [409, "conflict"],
  [422, "validation"],
  [426, "upgrade_required"],
  [429, "rate_limited"],
  [503, "server_error"],
] as const)("maps HTTP %i to %s without retaining secrets", (status, kind) => {
  expect(
    toOutboxSendFailure({
      status,
      detail: "private",
      headers: { authorization: "secret" },
    }),
  ).toEqual({ kind });
});

test("callback read failures are handled and disposal invalidates all late callbacks", async () => {
  const f = setup();
  f.options.onChanged.mockRejectedValueOnce(new Error("SQLite unavailable"));
  f.outboxOptions.onChanged();
  await Promise.resolve();
  await Promise.resolve();
  expect(f.options.onState).toHaveBeenLastCalledWith("offline");
  f.runtime.dispose();
  f.realtimeOptions.onState("connected");
  f.outboxOptions.onChanged();
  expect(f.options.onState).toHaveBeenLastCalledWith("offline");
  expect(f.options.onChanged).toHaveBeenCalledTimes(1);
});

test("real coordinators bridge the subscribed-to-phase2 gap without letting WS advance the checkpoint", async () => {
  jest.useFakeTimers();
  const outboxModule = "@/features/sync/outbox/outbox-dispatcher";
  const deltaModule = "@/features/sync/realtime/delta-sync";
  const realtimeModule = "@/features/sync/realtime/realtime-sync";
  jest
    .requireMock(outboxModule)
    .createOutboxDispatcher.mockImplementationOnce(
      jest.requireActual(outboxModule).createOutboxDispatcher,
    );
  jest
    .requireMock(deltaModule)
    .createDeltaSync.mockImplementationOnce(
      jest.requireActual(deltaModule).createDeltaSync,
    );
  jest
    .requireMock(realtimeModule)
    .createRealtimeSync.mockImplementationOnce(
      jest.requireActual(realtimeModule).createRealtimeSync,
    );
  const repository = fakeConnectedChatRepository();
  const eventId = "77777777-7777-4777-8777-777777777777";
  const requestId = "88888888-8888-4888-8888-888888888888";
  let checkpoint: string | null = null;
  const events = new Set<string>();
  repository.getEventCheckpoint.mockImplementation(async () => checkpoint);
  repository.applyRealtimeMessageCreated.mockImplementation(async (input) => {
    const status = events.has(input.eventId) ? "duplicate" : "applied";
    events.add(input.eventId);
    return { status };
  });
  repository.applyOrderedMessageCreated.mockImplementation(async (input) => {
    expect(input.expectedCursor).toBe(checkpoint);
    const status = events.has(input.eventId) ? "duplicate" : "applied";
    events.add(input.eventId);
    checkpoint = input.cursor;
    return { checkpoint, status };
  });
  const phase2 = deferred<EventPageWire>();
  const order: string[] = [];
  let requests = 0;
  const listEvents = jest.fn(async (_room: string, after: string | null) => {
    order.push(`delta:${after}`);
    requests += 1;
    return requests === 2 ? phase2.promise : { items: [], next_cursor: null };
  });
  const handlers: RealtimeSocketHandlers[] = [];
  const sent: string[] = [];
  const onState = jest.fn();
  const onChanged = jest.fn();
  const message: CanonicalMessageWire = {
    id: SERVER_MESSAGE_ID,
    chatroom_id: CHATROOM_ID,
    client_msg_id: null,
    sender_id: PRINCIPAL.userId,
    body: "구독 직후 도착한 메시지",
    created_at: "2026-09-10T00:00:00Z",
    type: "user",
    media: [],
  };
  const event = {
    conversation_id: CHATROOM_ID,
    cursor: "opaque-next",
    data: message,
    event_id: eventId,
    occurred_at: "2026-09-10T00:00:00Z",
    type: "message.created" as const,
    version: 1,
  };
  const runtime = createAccountSync({
    principal: PRINCIPAL,
    repository,
    isActive: () => true,
    send: jest.fn(),
    listEvents,
    async issueTicket() {
      order.push("ticket");
      return {
        contract_version: "1",
        expires_at: "2026-09-10T00:00:30Z",
        ticket: "single-use-ticket",
      };
    },
    refreshHistory: jest.fn(),
    mapMessage: (wire) => ({
      body: wire.body ?? null,
      chatroomId: wire.chatroom_id,
      clientMsgId: wire.client_msg_id ?? null,
      createdAtRaw: wire.created_at,
      kind: wire.type,
      localId: wire.id,
      media: [],
      senderAvatarUrl: wire.sender_avatar_url ?? null,
      senderId: wire.sender_id ?? null,
      senderNickname: wire.sender_nickname ?? null,
      serverMessageId: wire.id,
    }),
    socketUrl: () => "wss://example.test/ws",
    createSocket: (_url, callbacks) => {
      order.push("socket");
      handlers.push(callbacks);
      return {
        send: (frame) => {
          sent.push(frame);
          return true;
        },
        close: jest.fn(),
      };
    },
    createRequestId: () => requestId,
    createLeaseToken: () => "lease",
    nowMs: Date.now,
    random: () => 0,
    onChanged,
    onState,
  });
  try {
    runtime.setConversations([CHATROOM_ID]);
    runtime.start();
    await jest.advanceTimersByTimeAsync(0);
    expect(order).toEqual(["delta:null", "ticket", "socket"]);
    handlers[0].open();
    await jest.advanceTimersByTimeAsync(0);
    expect(JSON.parse(sent[0])).toEqual({
      type: "subscribe",
      conversation_id: CHATROOM_ID,
      request_id: requestId,
    });
    handlers[0].message(
      JSON.stringify({
        type: "subscribed",
        conversation_id: CHATROOM_ID,
        request_id: requestId,
      }),
    );
    await jest.advanceTimersByTimeAsync(0);
    expect(requests).toBe(2);
    handlers[0].message(JSON.stringify(event));
    await jest.advanceTimersByTimeAsync(0);
    expect(repository.applyRealtimeMessageCreated).toHaveBeenCalledTimes(1);
    expect(checkpoint).toBeNull();
    expect(onChanged).toHaveBeenCalledTimes(1);

    phase2.resolve({ items: [event], next_cursor: "opaque-next" });
    await jest.advanceTimersByTimeAsync(0);
    expect(repository.applyOrderedMessageCreated).toHaveBeenCalledTimes(1);
    expect(checkpoint).toBe("opaque-next");
    expect(events.size).toBe(1);
    expect(onState).toHaveBeenLastCalledWith("connected");
  } finally {
    runtime.dispose();
    jest.useRealTimers();
  }
});
