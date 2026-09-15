import type {
  CanonicalMessageWire,
  DeltaItemWire,
  EventPageWire,
} from "@/core/contracts/server";
import type {
  ConnectedCanonicalMessageUpsert,
  ConnectedChatSyncRepository,
  ConnectedClaimedOutboxCommand,
  ConnectedDirtyReconciliationScope,
  ConnectedHistoryMessageUpsert,
  ConnectedOrderedEventApplyResult,
  ConnectedOrderedMessageCreatedInput,
  ConnectedOrderedUnsupportedEventInput,
  ConnectedReconciliationScope,
  ConnectedRealtimeMessageCreatedInput,
} from "@/core/database/account/connected-chat-types";
import {
  createDeltaSync,
  DELTA_SYNC_MAX_PAGES_PER_DRAIN,
} from "@/features/sync/realtime/delta-sync";

const ROOM = "10000000-0000-4000-8000-000000000001";

function canonicalWire(
  overrides: Partial<CanonicalMessageWire> = {},
): CanonicalMessageWire {
  return {
    body: "hello",
    chatroom_id: ROOM,
    client_msg_id: null,
    created_at: "2026-09-10T00:00:00Z",
    id: "20000000-0000-4000-8000-000000000001",
    media: [],
    sender_id: "10000000-0000-4000-8000-000000000002",
    type: "user",
    ...overrides,
  };
}

function messageItem(
  overrides: Partial<{
    conversation_id: string;
    cursor: string;
    event_id: string;
    version: number;
    data: CanonicalMessageWire;
  }> = {},
): DeltaItemWire {
  return {
    conversation_id: ROOM,
    cursor: "1",
    data: canonicalWire(),
    event_id: "70000000-0000-4000-8000-000000000001",
    occurred_at: "2026-09-10T00:00:00Z",
    type: "message.created",
    version: 1,
    ...overrides,
  } as DeltaItemWire;
}

function unsupportedItem(
  overrides: Partial<{
    cursor: string;
    event_id: string;
    reconcile_scope: ConnectedReconciliationScope;
  }> = {},
): DeltaItemWire {
  return {
    cursor: "1",
    event_id: "70000000-0000-4000-8000-000000000009",
    reconcile_scope: "chat_history",
    ...overrides,
  } as DeltaItemWire;
}

function mapMessage(
  data: CanonicalMessageWire,
): ConnectedCanonicalMessageUpsert {
  return {
    body: data.body ?? null,
    chatroomId: data.chatroom_id,
    clientMsgId: data.client_msg_id ?? null,
    createdAtRaw: data.created_at,
    kind: data.type,
    localId: data.id,
    media: [],
    senderAvatarUrl: data.sender_avatar_url ?? null,
    senderId: data.sender_id ?? null,
    senderNickname: data.sender_nickname ?? null,
    serverMessageId: data.id,
  };
}

type StoredEvent = Readonly<{
  chatroomId: string;
  kind: "message.created" | "unsupported";
  messageServerId: string | null;
}>;

function createFakeRepository() {
  const checkpoints = new Map<string, string | null>();
  const events = new Map<string, StoredEvent>();
  const dirty = new Map<string, Map<ConnectedReconciliationScope, string>>();
  const mergedMessages: ConnectedCanonicalMessageUpsert[] = [];
  const wsApplied: ConnectedRealtimeMessageCreatedInput[] = [];

  function currentCheckpoint(chatroomId: string): string | null {
    return checkpoints.has(chatroomId)
      ? (checkpoints.get(chatroomId) ?? null)
      : null;
  }

  function prepare(
    chatroomId: string,
    cursor: string,
    expectedCursor: string | null,
  ): ConnectedOrderedEventApplyResult | null {
    const actual = currentCheckpoint(chatroomId);
    if (actual !== expectedCursor) {
      return { actualCheckpoint: actual, status: "checkpoint_mismatch" };
    }
    if (cursor === expectedCursor) {
      return { checkpoint: cursor, status: "no_progress" };
    }
    return null;
  }

  const repository: ConnectedChatSyncRepository = {
    async applyOrderedMessageCreated(
      input: ConnectedOrderedMessageCreatedInput,
    ) {
      const early = prepare(
        input.chatroomId,
        input.cursor,
        input.expectedCursor,
      );
      if (early) return early;
      const existing = events.get(input.eventId);
      const status = existing ? "duplicate" : "applied";
      if (!existing) {
        events.set(input.eventId, {
          chatroomId: input.chatroomId,
          kind: "message.created",
          messageServerId: input.message.serverMessageId,
        });
        mergedMessages.push(input.message);
      }
      checkpoints.set(input.chatroomId, input.cursor);
      return { checkpoint: input.cursor, status };
    },
    async applyOrderedUnsupportedEvent(
      input: ConnectedOrderedUnsupportedEventInput,
    ) {
      const early = prepare(
        input.chatroomId,
        input.cursor,
        input.expectedCursor,
      );
      if (early) return early;
      const existing = events.get(input.eventId);
      const status = existing ? "duplicate" : "applied";
      if (!existing) {
        events.set(input.eventId, {
          chatroomId: input.chatroomId,
          kind: "unsupported",
          messageServerId: null,
        });
        if (!dirty.has(input.chatroomId))
          dirty.set(input.chatroomId, new Map());
        dirty.get(input.chatroomId)!.set(input.reconcileScope, input.eventId);
      }
      checkpoints.set(input.chatroomId, input.cursor);
      return { checkpoint: input.cursor, status };
    },
    async applyRealtimeMessageCreated(
      input: ConnectedRealtimeMessageCreatedInput,
    ) {
      const existing = events.get(input.eventId);
      if (existing) return { status: "duplicate" as const };
      events.set(input.eventId, {
        chatroomId: input.message.chatroomId,
        kind: "message.created",
        messageServerId: input.message.serverMessageId,
      });
      wsApplied.push(input);
      return { status: "applied" as const };
    },
    async claimDueOutboxCommands(): Promise<
      readonly ConnectedClaimedOutboxCommand[]
    > {
      return [];
    },
    async failClaimedOutboxCommand() {
      return false;
    },
    async getEventCheckpoint(chatroomId: string) {
      return currentCheckpoint(chatroomId);
    },
    async listDirtyReconciliationScopes(
      chatroomId: string,
    ): Promise<readonly ConnectedDirtyReconciliationScope[]> {
      const scopes = dirty.get(chatroomId);
      if (!scopes) return [];
      return [...scopes.entries()].map(([scope, markerEventId]) => ({
        markerEventId,
        scope,
      }));
    },
    async reconcileChatHistory({ chatroomId, expectedMarkerEventId }) {
      const scopes = dirty.get(chatroomId);
      if (scopes?.get("chat_history") === expectedMarkerEventId) {
        scopes.delete("chat_history");
      }
    },
    async releaseOutboxClaims() {
      return 0;
    },
    async rescheduleClaimedOutboxCommand() {
      return false;
    },
  };

  return { checkpoints, dirty, events, mergedMessages, repository, wsApplied };
}

function alwaysActive() {
  return true;
}

function neverRefreshHistory(): Promise<
  Readonly<{
    complete: boolean;
    messages: readonly ConnectedHistoryMessageUpsert[];
  }>
> {
  throw new Error("refreshHistory should not be called for this scenario");
}

describe("createDeltaSync", () => {
  it.each([false, true])(
    "notifies the topic consumer after committing group_topics, leaving its marker intact (duplicate=%s)",
    async (duplicate) => {
      const { checkpoints, dirty, repository } = createFakeRepository();
      const eventId = "70000000-0000-4000-8000-000000000009";
      if (duplicate) {
        await repository.applyOrderedUnsupportedEvent({
          chatroomId: ROOM,
          cursor: "0",
          eventId,
          expectedCursor: null,
          reconcileScope: "group_topics",
        });
      }
      const onChanged = jest.fn(() => ({
        checkpoint: checkpoints.get(ROOM),
        marker: dirty.get(ROOM)?.get("group_topics"),
      }));
      const deltaSync = createDeltaSync({
        isActive: alwaysActive,
        listEvents: async () => ({
          items: [unsupportedItem({ reconcile_scope: "group_topics" })],
          next_cursor: null,
        }),
        mapMessage,
        onChanged,
        refreshHistory: neverRefreshHistory,
        repository,
      });

      expect(await deltaSync.drain(ROOM, new AbortController().signal)).toEqual(
        { exhausted: true },
      );
      expect(onChanged).toHaveBeenCalledTimes(1);
      expect(onChanged).toHaveBeenCalledWith(ROOM);
      expect(onChanged).toHaveReturnedWith({
        checkpoint: "1",
        marker: eventId,
      });
      expect(dirty.get(ROOM)?.get("group_topics")).toBe(eventId);
    },
  );

  it("drains multiple pages in order to exhaustion, applying every item once", async () => {
    const { checkpoints, mergedMessages, repository } = createFakeRepository();
    const pages: Record<string, EventPageWire> = {
      null_marker: {
        items: [
          messageItem({ cursor: "1", event_id: "e1" }),
          messageItem({ cursor: "2", event_id: "e2" }),
        ],
        next_cursor: "2",
      },
      "2": {
        items: [messageItem({ cursor: "3", event_id: "e3" })],
        next_cursor: "3",
      },
      "3": { items: [], next_cursor: null },
    };
    const listEvents = jest.fn(async (_id: string, after: string | null) => {
      return pages[after ?? "null_marker"];
    });
    const onChanged = jest.fn();
    const deltaSync = createDeltaSync({
      isActive: alwaysActive,
      listEvents,
      mapMessage,
      onChanged,
      refreshHistory: neverRefreshHistory,
      repository,
    });

    const result = await deltaSync.drain(ROOM, new AbortController().signal);

    expect(result).toEqual({ exhausted: true });
    expect(checkpoints.get(ROOM)).toBe("3");
    expect(mergedMessages).toHaveLength(3);
    expect(listEvents).toHaveBeenCalledTimes(3);
    expect(onChanged).toHaveBeenCalledWith(ROOM);
  });

  it("stops safely and defers once the bounded page limit is reached", async () => {
    const { checkpoints, repository } = createFakeRepository();
    let pageCount = 0;
    const listEvents = jest.fn(async (_id: string, after: string | null) => {
      const next = String(Number(after ?? "0") + 1);
      pageCount += 1;
      return {
        items: [messageItem({ cursor: next, event_id: "e" + next })],
        next_cursor: next,
      };
    });
    const deltaSync = createDeltaSync({
      isActive: alwaysActive,
      listEvents,
      mapMessage,
      onChanged: jest.fn(),
      refreshHistory: neverRefreshHistory,
      repository,
    });

    const result = await deltaSync.drain(ROOM, new AbortController().signal);

    expect(result).toEqual({ exhausted: false });
    expect(pageCount).toBe(DELTA_SYNC_MAX_PAGES_PER_DRAIN);
    expect(checkpoints.get(ROOM)).toBe(String(DELTA_SYNC_MAX_PAGES_PER_DRAIN));
  });

  it("stops safely on an empty page carrying a non-null next_cursor without skipping ahead", async () => {
    const { checkpoints, repository } = createFakeRepository();
    const listEvents = jest.fn(
      async () => ({ items: [], next_cursor: "9" }) as EventPageWire,
    );
    const deltaSync = createDeltaSync({
      isActive: alwaysActive,
      listEvents,
      mapMessage,
      onChanged: jest.fn(),
      refreshHistory: neverRefreshHistory,
      repository,
    });

    const result = await deltaSync.drain(ROOM, new AbortController().signal);

    expect(result).toEqual({ exhausted: false });
    expect(checkpoints.has(ROOM)).toBe(false);
    expect(listEvents).toHaveBeenCalledTimes(1);
  });

  it("stops safely on a repeated/no-progress item cursor within a page", async () => {
    const { checkpoints, mergedMessages, repository } = createFakeRepository();
    const listEvents = jest.fn(
      async () =>
        ({
          items: [
            messageItem({ cursor: "1", event_id: "e1" }),
            messageItem({ cursor: "1", event_id: "e2" }),
            messageItem({ cursor: "2", event_id: "e3" }),
          ],
          next_cursor: "2",
        }) as EventPageWire,
    );
    const deltaSync = createDeltaSync({
      isActive: alwaysActive,
      listEvents,
      mapMessage,
      onChanged: jest.fn(),
      refreshHistory: neverRefreshHistory,
      repository,
    });

    const result = await deltaSync.drain(ROOM, new AbortController().signal);

    expect(result).toEqual({ exhausted: false });
    expect(checkpoints.get(ROOM)).toBe("1");
    expect(mergedMessages).toHaveLength(1);
  });

  it("advances the checkpoint for a duplicate already applied by WebSocket without a second merge", async () => {
    const { checkpoints, mergedMessages, repository, wsApplied } =
      createFakeRepository();
    await repository.applyRealtimeMessageCreated({
      eventId: "e1",
      message: mapMessage(canonicalWire()),
    });
    expect(wsApplied).toHaveLength(1);
    const listEvents = jest.fn(
      async () =>
        ({
          items: [messageItem({ cursor: "1", event_id: "e1" })],
          next_cursor: null,
        }) as EventPageWire,
    );
    const deltaSync = createDeltaSync({
      isActive: alwaysActive,
      listEvents,
      mapMessage,
      onChanged: jest.fn(),
      refreshHistory: neverRefreshHistory,
      repository,
    });

    const result = await deltaSync.drain(ROOM, new AbortController().signal);

    expect(result).toEqual({ exhausted: true });
    expect(checkpoints.get(ROOM)).toBe("1");
    expect(mergedMessages).toHaveLength(0);
  });

  it("restarts boundedly from the stored checkpoint after a CAS mismatch", async () => {
    const base = createFakeRepository().repository;
    const repository: ConnectedChatSyncRepository = {
      ...base,
      applyOrderedMessageCreated: jest
        .fn()
        .mockResolvedValueOnce({
          actualCheckpoint: "5",
          status: "checkpoint_mismatch",
        })
        .mockResolvedValueOnce({ checkpoint: "6", status: "applied" }),
      getEventCheckpoint: jest
        .fn()
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce("5"),
    };
    const listEvents = jest.fn(async (_id: string, after: string | null) => {
      if (after === null) {
        return {
          items: [messageItem({ cursor: "1", event_id: "e1" })],
          next_cursor: null,
        } as EventPageWire;
      }
      return {
        items: [messageItem({ cursor: "6", event_id: "e6" })],
        next_cursor: null,
      } as EventPageWire;
    });
    const deltaSync = createDeltaSync({
      isActive: alwaysActive,
      listEvents,
      mapMessage,
      onChanged: jest.fn(),
      refreshHistory: neverRefreshHistory,
      repository,
    });

    const result = await deltaSync.drain(ROOM, new AbortController().signal);

    expect(result).toEqual({ exhausted: true });
    expect(listEvents).toHaveBeenCalledTimes(2);
    expect(listEvents).toHaveBeenNthCalledWith(2, ROOM, "5", expect.anything());
  });

  it("rejects a known event whose room does not match the drained conversation", async () => {
    const { checkpoints, repository } = createFakeRepository();
    const applySpy = jest.spyOn(repository, "applyOrderedMessageCreated");
    const listEvents = jest.fn(
      async () =>
        ({
          items: [
            messageItem({
              conversation_id: "other-room",
              cursor: "1",
              event_id: "e1",
            }),
          ],
          next_cursor: null,
        }) as EventPageWire,
    );
    const deltaSync = createDeltaSync({
      isActive: alwaysActive,
      listEvents,
      mapMessage,
      onChanged: jest.fn(),
      refreshHistory: neverRefreshHistory,
      repository,
    });

    const result = await deltaSync.drain(ROOM, new AbortController().signal);

    expect(result).toEqual({ exhausted: false });
    expect(applySpy).not.toHaveBeenCalled();
    expect(checkpoints.has(ROOM)).toBe(false);
  });

  it("rejects a known event with an unsupported version", async () => {
    const { repository } = createFakeRepository();
    const applySpy = jest.spyOn(repository, "applyOrderedMessageCreated");
    const listEvents = jest.fn(
      async () =>
        ({
          items: [messageItem({ cursor: "1", event_id: "e1", version: 2 })],
          next_cursor: null,
        }) as EventPageWire,
    );
    const deltaSync = createDeltaSync({
      isActive: alwaysActive,
      listEvents,
      mapMessage,
      onChanged: jest.fn(),
      refreshHistory: neverRefreshHistory,
      repository,
    });

    const result = await deltaSync.drain(ROOM, new AbortController().signal);

    expect(result).toEqual({ exhausted: false });
    expect(applySpy).not.toHaveBeenCalled();
  });

  it("reconciles a dirty chat_history marker only when the bounded C2 refresh is complete and the marker still matches", async () => {
    const { dirty, repository } = createFakeRepository();
    const listEvents = jest.fn(
      async () =>
        ({
          items: [
            unsupportedItem({
              cursor: "1",
              event_id: "u1",
              reconcile_scope: "chat_history",
            }),
          ],
          next_cursor: null,
        }) as EventPageWire,
    );
    const refreshHistory = jest.fn(async () => ({
      complete: true,
      messages: [] as readonly ConnectedHistoryMessageUpsert[],
    }));
    const deltaSync = createDeltaSync({
      isActive: alwaysActive,
      listEvents,
      mapMessage,
      onChanged: jest.fn(),
      refreshHistory,
      repository,
    });

    const result = await deltaSync.drain(ROOM, new AbortController().signal);

    expect(result).toEqual({ exhausted: true });
    expect(refreshHistory).toHaveBeenCalledTimes(1);
    expect(dirty.get(ROOM)?.has("chat_history")).toBe(false);
  });

  it("leaves the chat_history marker dirty when the bounded C2 refresh is incomplete", async () => {
    const { dirty, repository } = createFakeRepository();
    const listEvents = jest.fn(
      async () =>
        ({
          items: [
            unsupportedItem({
              cursor: "1",
              event_id: "u1",
              reconcile_scope: "chat_history",
            }),
          ],
          next_cursor: null,
        }) as EventPageWire,
    );
    const refreshHistory = jest.fn(async () => ({
      complete: false,
      messages: [] as readonly ConnectedHistoryMessageUpsert[],
    }));
    const deltaSync = createDeltaSync({
      isActive: alwaysActive,
      listEvents,
      mapMessage,
      onChanged: jest.fn(),
      refreshHistory,
      repository,
    });

    await deltaSync.drain(ROOM, new AbortController().signal);

    expect(refreshHistory).toHaveBeenCalledTimes(1);
    expect(dirty.get(ROOM)?.get("chat_history")).toBe("u1");
  });

  it("leaves group_topics dirty without ever calling the chat_history-only C2 refresh", async () => {
    const { dirty, repository } = createFakeRepository();
    const listEvents = jest.fn(
      async () =>
        ({
          items: [
            unsupportedItem({
              cursor: "1",
              event_id: "u1",
              reconcile_scope: "group_topics",
            }),
          ],
          next_cursor: null,
        }) as EventPageWire,
    );
    const refreshHistory = jest.fn();
    const deltaSync = createDeltaSync({
      isActive: alwaysActive,
      listEvents,
      mapMessage,
      onChanged: jest.fn(),
      refreshHistory: refreshHistory as never,
      repository,
    });

    await deltaSync.drain(ROOM, new AbortController().signal);

    expect(refreshHistory).not.toHaveBeenCalled();
    expect(dirty.get(ROOM)?.get("group_topics")).toBe("u1");
  });

  it("does not fail the drain when the bounded C2 refresh throws, leaving the marker dirty", async () => {
    const { dirty, repository } = createFakeRepository();
    const listEvents = jest.fn(
      async () =>
        ({
          items: [
            unsupportedItem({
              cursor: "1",
              event_id: "u1",
              reconcile_scope: "chat_history",
            }),
          ],
          next_cursor: null,
        }) as EventPageWire,
    );
    const refreshHistory = jest.fn(async () => {
      throw new Error("network_unavailable");
    });
    const deltaSync = createDeltaSync({
      isActive: alwaysActive,
      listEvents,
      mapMessage,
      onChanged: jest.fn(),
      refreshHistory,
      repository,
    });

    const result = await deltaSync.drain(ROOM, new AbortController().signal);

    expect(result).toEqual({ exhausted: true });
    expect(dirty.get(ROOM)?.get("chat_history")).toBe("u1");
  });

  it("joins a single flight per conversation instead of issuing overlapping page reads", async () => {
    const { repository } = createFakeRepository();
    let resolvePage!: (page: EventPageWire) => void;
    const listEvents = jest.fn(
      () =>
        new Promise<EventPageWire>((resolve) => {
          resolvePage = resolve;
        }),
    );
    const deltaSync = createDeltaSync({
      isActive: alwaysActive,
      listEvents,
      mapMessage,
      onChanged: jest.fn(),
      refreshHistory: neverRefreshHistory,
      repository,
    });

    const first = deltaSync.drain(ROOM, new AbortController().signal);
    const second = deltaSync.drain(ROOM, new AbortController().signal);
    await Promise.resolve();
    await Promise.resolve();
    expect(listEvents).toHaveBeenCalledTimes(1);
    resolvePage({
      items: [],
      next_cursor: null,
    });
    const [firstResult, secondResult] = await Promise.all([first, second]);
    expect(firstResult).toEqual({ exhausted: true });
    expect(secondResult).toEqual({ exhausted: true });
  });

  it("stops without applying once isActive turns false mid-flight, checked after the await", async () => {
    const { mergedMessages, repository } = createFakeRepository();
    let active = true;
    const listEvents = jest.fn(async () => {
      active = false;
      return {
        items: [messageItem({ cursor: "1", event_id: "e1" })],
        next_cursor: null,
      } as EventPageWire;
    });
    const onChanged = jest.fn();
    const deltaSync = createDeltaSync({
      isActive: () => active,
      listEvents,
      mapMessage,
      onChanged,
      refreshHistory: neverRefreshHistory,
      repository,
    });

    const result = await deltaSync.drain(ROOM, new AbortController().signal);

    expect(result).toEqual({ exhausted: false });
    expect(mergedMessages).toHaveLength(0);
    expect(onChanged).not.toHaveBeenCalled();
  });

  it("stops without applying once the caller's signal aborts mid-flight", async () => {
    const { mergedMessages, repository } = createFakeRepository();
    const controller = new AbortController();
    const listEvents = jest.fn(async () => {
      controller.abort();
      return {
        items: [messageItem({ cursor: "1", event_id: "e1" })],
        next_cursor: null,
      } as EventPageWire;
    });
    const deltaSync = createDeltaSync({
      isActive: alwaysActive,
      listEvents,
      mapMessage,
      onChanged: jest.fn(),
      refreshHistory: neverRefreshHistory,
      repository,
    });

    const result = await deltaSync.drain(ROOM, controller.signal);

    expect(result).toEqual({ exhausted: false });
    expect(mergedMessages).toHaveLength(0);
  });

  it("retries a persisted chat_history marker when a later empty S1 page finds it still dirty", async () => {
    const { dirty, repository } = createFakeRepository();
    const listEvents = jest
      .fn()
      .mockResolvedValueOnce({
        items: [
          unsupportedItem({
            cursor: "1",
            event_id: "u1",
            reconcile_scope: "chat_history",
          }),
        ],
        next_cursor: null,
      } satisfies EventPageWire)
      .mockResolvedValueOnce({
        items: [],
        next_cursor: null,
      } satisfies EventPageWire);
    const refreshHistory = jest
      .fn()
      .mockResolvedValueOnce({ complete: false, messages: [] })
      .mockResolvedValueOnce({ complete: true, messages: [] });
    const deltaSync = createDeltaSync({
      isActive: alwaysActive,
      listEvents,
      mapMessage,
      onChanged: jest.fn(),
      refreshHistory,
      repository,
    });

    await deltaSync.drain(ROOM, new AbortController().signal);
    expect(dirty.get(ROOM)?.get("chat_history")).toBe("u1");
    await deltaSync.drain(ROOM, new AbortController().signal);

    expect(refreshHistory).toHaveBeenCalledTimes(2);
    expect(dirty.get(ROOM)?.has("chat_history")).toBe(false);
  });

  it("starts a fresh drain after an aborted caller flight and keeps its map entry when the old flight settles", async () => {
    const { repository } = createFakeRepository();
    let resolveOld!: (value: EventPageWire) => void;
    let resolveFresh!: (value: EventPageWire) => void;
    const listEvents = jest
      .fn()
      .mockImplementationOnce(
        () =>
          new Promise<EventPageWire>((resolve) => {
            resolveOld = resolve;
          }),
      )
      .mockImplementationOnce(
        () =>
          new Promise<EventPageWire>((resolve) => {
            resolveFresh = resolve;
          }),
      );
    const deltaSync = createDeltaSync({
      isActive: alwaysActive,
      listEvents,
      mapMessage,
      onChanged: jest.fn(),
      refreshHistory: neverRefreshHistory,
      repository,
    });
    const oldController = new AbortController();
    const freshController = new AbortController();
    const oldFlight = deltaSync.drain(ROOM, oldController.signal);
    await Promise.resolve();
    await Promise.resolve();
    oldController.abort();
    const freshFlight = deltaSync.drain(ROOM, freshController.signal);
    await Promise.resolve();
    await Promise.resolve();
    expect(listEvents).toHaveBeenCalledTimes(2);

    resolveOld({ items: [], next_cursor: null });
    await oldFlight;
    const joinedFreshFlight = deltaSync.drain(ROOM, freshController.signal);
    expect(joinedFreshFlight).toBe(freshFlight);

    resolveFresh({ items: [], next_cursor: null });
    await expect(freshFlight).resolves.toEqual({ exhausted: true });
  });

  it("does not publish onChanged after an ordered apply invalidates the scope", async () => {
    const base = createFakeRepository().repository;
    let active = true;
    const repository: ConnectedChatSyncRepository = {
      ...base,
      applyOrderedMessageCreated: jest.fn(async () => {
        active = false;
        return { checkpoint: "1", status: "applied" as const };
      }),
    };
    const onChanged = jest.fn();
    const deltaSync = createDeltaSync({
      isActive: () => active,
      listEvents: jest.fn(
        async () =>
          ({
            items: [messageItem({ cursor: "1", event_id: "e1" })],
            next_cursor: null,
          }) as EventPageWire,
      ),
      mapMessage,
      onChanged,
      refreshHistory: neverRefreshHistory,
      repository,
    });

    await expect(
      deltaSync.drain(ROOM, new AbortController().signal),
    ).resolves.toEqual({
      exhausted: false,
    });
    expect(onChanged).not.toHaveBeenCalled();
  });

  it("propagates authoritative C2 failures while retaining the dirty marker", async () => {
    for (const status of [401, 403, 404, 426]) {
      const { dirty, repository } = createFakeRepository();
      const deltaSync = createDeltaSync({
        isActive: alwaysActive,
        listEvents: jest.fn(
          async () =>
            ({
              items: [
                unsupportedItem({
                  cursor: "1",
                  event_id: "c2-" + status,
                  reconcile_scope: "chat_history",
                }),
              ],
              next_cursor: null,
            }) as EventPageWire,
        ),
        mapMessage,
        onChanged: jest.fn(),
        refreshHistory: jest.fn(async () => {
          throw Object.assign(new Error("authoritative_c2_" + status), {
            status,
          });
        }),
        repository,
      });

      await expect(
        deltaSync.drain(ROOM, new AbortController().signal),
      ).rejects.toMatchObject({
        status,
      });
      expect(dirty.get(ROOM)?.get("chat_history")).toBe("c2-" + status);
    }
  });
});
