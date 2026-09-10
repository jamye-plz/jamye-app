import { ChatApiError } from "@/features/chat/data/chat-api";
import { createConnectedChatStore } from "@/features/chat/model/connected-chat-store";
import type {
  AuthorizedChatRequest,
  ConnectedChatStore,
} from "@/features/chat/model/connected-chat-store";
import {
  CHATROOM_ID,
  GROUP_ID,
  OTHER_CHATROOM_ID,
  PRINCIPAL,
  SERVER_MESSAGE_ID,
  canonicalWireMessage,
  deferred,
  emptyMessageWindow,
  fakeChatApi,
  fakeClock,
  fakeConnectedChatRepository,
  fakeConnectedSync,
  fakeMessageIdentity,
  messageCursor,
  pendingEnqueueResult,
  repositoryCanonicalRow,
  repositoryChatroom,
  repositoryHistoryRow,
  wireChatroom,
  wireHistoryMessage,
} from "./connected-chat-fixtures";

// The coordinator captured a real module-not-found RED before implementation.

const authorized: AuthorizedChatRequest = (execute, signal) =>
  execute("fake-token", signal ?? new AbortController().signal);

describe("M8 room/history regressions with M9 queued-send ownership", () => {
  function setup() {
    const chatApi = fakeChatApi();
    const repository = fakeConnectedChatRepository();
    const createApi = jest.fn(() => chatApi);
    const clock = fakeClock();
    const messageIdentity = fakeMessageIdentity();
    const sync = fakeConnectedSync();
    const store: ConnectedChatStore = createConnectedChatStore({
      clock,
      createApi,
      messageIdentity,
      createSync: sync.create,
    });
    store.setPrincipal(PRINCIPAL, repository, authorized);
    return {
      chatApi,
      clock,
      createApi,
      messageIdentity,
      repository,
      store,
      sync,
    };
  }

  test("C1 room list persists the HTTP page to the repository, then renders only from a repository read", async () => {
    const { chatApi, repository, store } = setup();
    chatApi.listGroupChatrooms.mockResolvedValueOnce({
      items: [wireChatroom()],
      nextCursor: "http-opaque-cursor",
    });
    const row = repositoryChatroom();
    repository.upsertChatrooms.mockResolvedValueOnce(undefined);
    repository.listChatrooms.mockResolvedValueOnce({
      hasMore: false,
      items: [row],
      nextAfter: null,
    });

    await store.actions.loadRooms(GROUP_ID);

    expect(chatApi.listGroupChatrooms).toHaveBeenCalledWith(
      "fake-token",
      GROUP_ID,
      {},
      expect.anything(),
    );
    expect(repository.upsertChatrooms).toHaveBeenCalledWith([
      expect.objectContaining({ chatroomId: CHATROOM_ID, groupId: GROUP_ID }),
    ]);
    expect(repository.listChatrooms).toHaveBeenCalledWith({
      after: null,
      groupId: GROUP_ID,
      limit: expect.any(Number),
    });
    // Rendered rows are the repository's rows, never the raw HTTP page.
    expect(store.getState().rooms.items).toEqual([row]);
    expect(store.getState().rooms.nextAfter).toBeNull();
  });

  test("opening a room fetches the newest C2 page, persists it, then renders exclusively from a repository read", async () => {
    const { chatApi, repository, store } = setup();
    chatApi.listChatroomMessages.mockResolvedValueOnce({
      items: [wireHistoryMessage()],
      nextCursor: "http-history-cursor",
    });
    const row = repositoryHistoryRow();
    repository.mergeHistoryMessages.mockResolvedValueOnce(undefined);
    repository.listMessagesWindow.mockResolvedValueOnce({
      hasMore: true,
      items: [row],
      nextBefore: messageCursor(),
    });

    await store.actions.openRoom(CHATROOM_ID);

    expect(chatApi.listChatroomMessages).toHaveBeenCalledWith(
      "fake-token",
      CHATROOM_ID,
      {},
      expect.anything(),
    );
    expect(repository.mergeHistoryMessages).toHaveBeenCalledWith([
      expect.objectContaining({
        chatroomId: CHATROOM_ID,
        serverMessageId: SERVER_MESSAGE_ID,
        body: "안녕하세요",
      }),
    ]);
    expect(repository.listMessagesWindow).toHaveBeenCalledWith({
      before: null,
      chatroomId: CHATROOM_ID,
      limit: expect.any(Number),
    });
    expect(store.getState().chatroomId).toBe(CHATROOM_ID);
    expect(store.getState().history.items).toEqual([row]);
  });

  test("loading older C2 history chains the server's opaque cursor and dedupes overlap by local id", async () => {
    const { chatApi, repository, store } = setup();
    const newestRow = repositoryHistoryRow({ localId: "row-newest" });
    const repoCursorAfterNewest = messageCursor({ localId: "row-newest" });
    chatApi.listChatroomMessages.mockResolvedValueOnce({
      items: [wireHistoryMessage()],
      nextCursor: "older-cursor",
    });
    repository.mergeHistoryMessages.mockResolvedValueOnce(undefined);
    repository.listMessagesWindow.mockResolvedValueOnce({
      hasMore: true,
      items: [newestRow],
      nextBefore: repoCursorAfterNewest,
    });
    await store.actions.openRoom(CHATROOM_ID);

    const olderRow = repositoryHistoryRow({
      localId: "row-older",
      serverMessageId: "77777777-7777-4777-8777-777777777777",
    });
    chatApi.listChatroomMessages.mockResolvedValueOnce({
      items: [
        wireHistoryMessage({ id: "77777777-7777-4777-8777-777777777777" }),
      ],
      nextCursor: null,
    });
    // The repository echoes the still-current row back unchanged alongside the new older one.
    repository.listMessagesWindow.mockResolvedValueOnce({
      hasMore: false,
      items: [olderRow, newestRow],
      nextBefore: null,
    });
    await store.actions.loadOlderHistory();

    expect(chatApi.listChatroomMessages).toHaveBeenLastCalledWith(
      "fake-token",
      CHATROOM_ID,
      { before: "older-cursor" },
      expect.anything(),
    );
    expect(repository.listMessagesWindow).toHaveBeenLastCalledWith({
      before: repoCursorAfterNewest,
      chatroomId: CHATROOM_ID,
      limit: expect.any(Number),
    });
    expect(store.getState().history.items).toEqual([olderRow, newestRow]);
    expect(store.getState().history.hasMore).toBe(false);
  });

  test("sending enqueues the pending message before waking the only C4 dispatcher", async () => {
    const { chatApi, repository, store, sync } = setup();
    repository.listMessagesWindow.mockResolvedValue(emptyMessageWindow());
    await store.actions.openRoom(CHATROOM_ID);
    repository.enqueuePendingMessage.mockResolvedValueOnce(
      pendingEnqueueResult(),
    );
    chatApi.sendChatMessage.mockResolvedValueOnce({
      status: 201,
      message: canonicalWireMessage(),
    });
    repository.mergeCanonicalMessage.mockResolvedValueOnce(
      repositoryCanonicalRow(),
    );

    await store.actions.sendMessage("메시지");

    expect(repository.enqueuePendingMessage).toHaveBeenCalled();
    expect(sync.runtime.wake).toHaveBeenCalled();
    expect(
      repository.enqueuePendingMessage.mock.invocationCallOrder[0],
    ).toBeLessThan(sync.runtime.wake.mock.invocationCallOrder[0]!);
    expect(chatApi.sendChatMessage).not.toHaveBeenCalled();
  });

  test("a fresh send mints a new id on every call", async () => {
    const { chatApi, repository, store, messageIdentity } = setup();
    repository.listMessagesWindow.mockResolvedValue(emptyMessageWindow());
    await store.actions.openRoom(CHATROOM_ID);
    repository.enqueuePendingMessage
      .mockResolvedValueOnce(
        pendingEnqueueResult({ clientMsgId: "gen-client-1" }),
      )
      .mockResolvedValueOnce(
        pendingEnqueueResult({ clientMsgId: "gen-client-2" }),
      );
    chatApi.sendChatMessage.mockResolvedValue({
      status: 201,
      message: canonicalWireMessage(),
    });
    repository.mergeCanonicalMessage.mockResolvedValue(
      repositoryCanonicalRow(),
    );

    await store.actions.sendMessage("첫 메시지");
    await store.actions.sendMessage("두 번째 메시지");

    expect(messageIdentity.next).toHaveBeenCalledTimes(2);
    expect(repository.enqueuePendingMessage).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        body: "첫 메시지",
        clientMsgId: "gen-client-1",
      }),
    );
    expect(repository.enqueuePendingMessage).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        body: "두 번째 메시지",
        clientMsgId: "gen-client-2",
      }),
    );
  });

  test("retry reuses the persisted outbox command's exact id, room and body without normalizing whitespace", async () => {
    const { chatApi, repository, store } = setup();
    repository.listMessagesWindow.mockResolvedValue(emptyMessageWindow());
    await store.actions.openRoom(CHATROOM_ID);
    const exactBody = "  줄바꿈 포함 메시지 😀\n다음 줄  ";
    repository.getOutboxCommand.mockResolvedValueOnce({
      body: exactBody,
      chatroomId: CHATROOM_ID,
      clientMsgId: "persisted-client-id",
      commandId: "persisted-command-id",
      errorCode: "network",
      localId: "persisted-local-id",
      state: "failed",
    });
    repository.retryFailedMessage.mockResolvedValueOnce(
      pendingEnqueueResult({
        body: exactBody,
        clientMsgId: "persisted-client-id",
      }),
    );
    chatApi.sendChatMessage.mockResolvedValueOnce({
      status: 200,
      message: canonicalWireMessage({
        body: exactBody,
        clientMessageId: "persisted-client-id",
      }),
    });
    repository.mergeCanonicalMessage.mockResolvedValueOnce(
      repositoryCanonicalRow({
        body: exactBody,
        clientMsgId: "persisted-client-id",
      }),
    );

    await store.actions.retryMessage("persisted-client-id");

    expect(repository.retryFailedMessage).toHaveBeenCalledWith({
      body: exactBody,
      chatroomId: CHATROOM_ID,
      clientMsgId: "persisted-client-id",
    });
    expect(chatApi.sendChatMessage).not.toHaveBeenCalled();
  });

  test("canonical updates from either C4 success status render only the dispatcher-committed repository row", async () => {
    for (const status of [201, 200] as const) {
      const { chatApi, repository, store, sync } = setup();
      repository.listMessagesWindow.mockResolvedValue(emptyMessageWindow());
      await store.actions.openRoom(CHATROOM_ID);
      repository.enqueuePendingMessage.mockResolvedValueOnce(
        pendingEnqueueResult(),
      );
      chatApi.sendChatMessage.mockResolvedValueOnce({
        status,
        message: canonicalWireMessage(),
      });
      const canonicalRow = repositoryCanonicalRow();
      repository.mergeCanonicalMessage.mockResolvedValueOnce(canonicalRow);
      repository.listMessagesWindow.mockResolvedValueOnce({
        hasMore: false,
        items: [canonicalRow],
        nextBefore: null,
      });

      await store.actions.sendMessage("메시지");

      repository.listMessagesWindow.mockResolvedValueOnce({
        hasMore: false,
        items: [canonicalRow],
        nextBefore: null,
      });
      await sync.bindings[0].onChanged();
      expect(repository.mergeCanonicalMessage).not.toHaveBeenCalled();
      expect(store.getState().history.items).toEqual([canonicalRow]);
      expect(chatApi.sendChatMessage).not.toHaveBeenCalled();
    }
  });

  test("a dispatcher-committed conflict stays visible and explicit retry never remints its identity", async () => {
    const { chatApi, repository, store, sync, messageIdentity } = setup();
    repository.listMessagesWindow.mockResolvedValue(emptyMessageWindow());
    await store.actions.openRoom(CHATROOM_ID);
    repository.enqueuePendingMessage.mockResolvedValueOnce(
      pendingEnqueueResult({ clientMsgId: "gen-client-1" }),
    );
    chatApi.sendChatMessage.mockRejectedValueOnce(
      new ChatApiError(409, "conflict"),
    );
    repository.markSendFailed.mockResolvedValueOnce(undefined);

    await store.actions.sendMessage("충돌 메시지");

    repository.listMessagesWindow.mockResolvedValueOnce({
      ...emptyMessageWindow(),
      items: [
        repositoryHistoryRow({ status: "failed", clientMsgId: "gen-client-1" }),
      ],
    });
    await sync.bindings[0].onChanged();
    expect(store.getState().history.items[0].status).toBe("failed");
    expect(repository.markSendFailed).not.toHaveBeenCalled();
    expect(chatApi.sendChatMessage).not.toHaveBeenCalled();

    // A subsequent explicit retry reuses the exact same id — it is never reminted.
    repository.getOutboxCommand.mockResolvedValueOnce({
      body: "충돌 메시지",
      chatroomId: CHATROOM_ID,
      clientMsgId: "gen-client-1",
      commandId: "gen-command-1",
      errorCode: "conflict",
      localId: "gen-local-1",
      state: "failed",
    });
    repository.retryFailedMessage.mockResolvedValueOnce(
      pendingEnqueueResult({ clientMsgId: "gen-client-1" }),
    );
    chatApi.sendChatMessage.mockResolvedValueOnce({
      status: 200,
      message: canonicalWireMessage({ clientMessageId: "gen-client-1" }),
    });
    repository.mergeCanonicalMessage.mockResolvedValueOnce(
      repositoryCanonicalRow({ clientMsgId: "gen-client-1" }),
    );

    await store.actions.retryMessage("gen-client-1");

    expect(repository.retryFailedMessage).toHaveBeenCalledWith({
      body: "충돌 메시지",
      chatroomId: CHATROOM_ID,
      clientMsgId: "gen-client-1",
    });
    expect(sync.runtime.wake).toHaveBeenCalledTimes(2);
    expect(messageIdentity.next).toHaveBeenCalledTimes(1);
  });

  test("unknown transport delivery belongs to the dispatcher and queued intents are not manually failed by the view", async () => {
    const { chatApi, repository, store, sync } = setup();
    repository.listMessagesWindow.mockResolvedValue(emptyMessageWindow());
    await store.actions.openRoom(CHATROOM_ID);
    repository.enqueuePendingMessage.mockResolvedValueOnce(
      pendingEnqueueResult({ clientMsgId: "gen-client-1" }),
    );
    chatApi.sendChatMessage.mockRejectedValueOnce(
      new ChatApiError(0, "network_unavailable"),
    );

    await store.actions.sendMessage("전송 결과 불명");

    expect(store.getState().send).toEqual({ status: "idle" });
    expect(sync.runtime.wake).toHaveBeenCalledTimes(1);
    expect(repository.markSendFailed).not.toHaveBeenCalled();
    expect(chatApi.sendChatMessage).not.toHaveBeenCalled();
    repository.getOutboxCommand.mockResolvedValueOnce(
      pendingEnqueueResult().command,
    );
    await store.actions.retryMessage("gen-client-1");
    expect(repository.retryFailedMessage).not.toHaveBeenCalled();
    expect(sync.runtime.wake).toHaveBeenCalledTimes(1);
  });

  test("a stale response for a previous room never replaces the current room's rendered state", async () => {
    const { chatApi, repository, store } = setup();
    const firstFetch =
      deferred<Awaited<ReturnType<typeof chatApi.listChatroomMessages>>>();
    chatApi.listChatroomMessages.mockReturnValueOnce(firstFetch.promise);
    const openingFirst = store.actions.openRoom(CHATROOM_ID);
    await Promise.resolve();
    const firstSignal = chatApi.listChatroomMessages.mock
      .calls[0]![3] as AbortSignal;

    const otherRow = repositoryHistoryRow({
      chatroomId: OTHER_CHATROOM_ID,
      localId: "other-row",
    });
    chatApi.listChatroomMessages.mockResolvedValueOnce({
      items: [wireHistoryMessage({ chatroomId: OTHER_CHATROOM_ID })],
      nextCursor: null,
    });
    repository.mergeHistoryMessages.mockResolvedValue(undefined);
    repository.listMessagesWindow.mockResolvedValueOnce({
      hasMore: false,
      items: [otherRow],
      nextBefore: null,
    });
    await store.actions.openRoom(OTHER_CHATROOM_ID);

    expect(firstSignal.aborted).toBe(true);
    firstFetch.resolve({
      items: [wireHistoryMessage()],
      nextCursor: null,
    });
    await openingFirst;

    expect(store.getState().chatroomId).toBe(OTHER_CHATROOM_ID);
    expect(store.getState().history.items).toEqual([otherRow]);
    expect(repository.mergeHistoryMessages).toHaveBeenCalledTimes(1);
  });

  test("a room-list response that resolves after an account/epoch change is discarded before any repository write", async () => {
    const { chatApi, repository, store } = setup();
    const page =
      deferred<Awaited<ReturnType<typeof chatApi.listGroupChatrooms>>>();
    chatApi.listGroupChatrooms.mockReturnValueOnce(page.promise);
    const loading = store.actions.loadRooms(GROUP_ID);
    const signal = chatApi.listGroupChatrooms.mock.calls[0]![3] as AbortSignal;

    const otherRepository = fakeConnectedChatRepository();
    store.setPrincipal(
      { ...PRINCIPAL, epoch: PRINCIPAL.epoch + 1 },
      otherRepository,
      authorized,
    );
    expect(signal.aborted).toBe(true);

    page.resolve({ items: [wireChatroom()], nextCursor: null });
    await loading;

    expect(repository.upsertChatrooms).not.toHaveBeenCalled();
    expect(otherRepository.upsertChatrooms).not.toHaveBeenCalled();
    expect(store.getState().rooms.items).toEqual([]);
  });

  test("an enqueue completion after an account switch cannot wake or publish in the new scope", async () => {
    const { chatApi, repository, store } = setup();
    repository.listMessagesWindow.mockResolvedValue(emptyMessageWindow());
    await store.actions.openRoom(CHATROOM_ID);
    const write = deferred<ReturnType<typeof pendingEnqueueResult>>();
    repository.enqueuePendingMessage.mockReturnValueOnce(write.promise);
    const sending = store.actions.sendMessage("계정 전환 전 메시지");

    const otherRepository = fakeConnectedChatRepository();
    store.setPrincipal(
      { ...PRINCIPAL, userId: "88888888-8888-4888-8888-888888888888" },
      otherRepository,
      authorized,
    );
    write.resolve(pendingEnqueueResult());
    await sending;

    expect(repository.mergeCanonicalMessage).not.toHaveBeenCalled();
    expect(otherRepository.mergeCanonicalMessage).not.toHaveBeenCalled();
    expect(chatApi.sendChatMessage).not.toHaveBeenCalled();
  });

  test("dispose aborts a pending request and no further repository write can occur", async () => {
    const { chatApi, repository, store } = setup();
    const page =
      deferred<Awaited<ReturnType<typeof chatApi.listGroupChatrooms>>>();
    chatApi.listGroupChatrooms.mockReturnValueOnce(page.promise);
    const loading = store.actions.loadRooms(GROUP_ID);
    const signal = chatApi.listGroupChatrooms.mock.calls[0]![3] as AbortSignal;

    store.dispose();
    expect(signal.aborted).toBe(true);

    page.resolve({ items: [wireChatroom()], nextCursor: null });
    await loading;

    expect(repository.upsertChatrooms).not.toHaveBeenCalled();
  });

  test("membership loss clears room content without replay, while an earlier independent send error stays separately recoverable", async () => {
    const { chatApi, repository, store } = setup();
    chatApi.listChatroomMessages.mockResolvedValueOnce({
      items: [wireHistoryMessage()],
      nextCursor: "cursor-1",
    });
    const row = repositoryHistoryRow();
    repository.mergeHistoryMessages.mockResolvedValueOnce(undefined);
    repository.listMessagesWindow.mockResolvedValueOnce({
      hasMore: true,
      items: [row],
      nextBefore: messageCursor(),
    });
    await store.actions.openRoom(CHATROOM_ID);
    expect(store.getState().history.items).toEqual([row]);

    repository.enqueuePendingMessage.mockRejectedValueOnce(
      new Error("storage write failed"),
    );
    await store.actions.sendMessage("실패할 메시지");
    expect(store.getState().send.status).toBe("failed");
    // A send failure never touches already-rendered history.
    expect(store.getState().history.items).toEqual([row]);

    chatApi.listChatroomMessages.mockRejectedValueOnce(
      new ChatApiError(403, "membership_required"),
    );
    await store.actions.loadOlderHistory();

    expect(store.getState().history.items).toEqual([]);
    expect(store.getState().history.status).toBe("error");
    // Old rows/actions stop being usable after membership loss: no replay via a stale id.
    await store.actions.retryMessage("gen-client-1");
    expect(repository.retryFailedMessage).not.toHaveBeenCalled();
  });

  test("foreground resumes the account dispatcher but does not create a second foreground sender", async () => {
    const { chatApi, repository, store, sync } = setup();
    repository.listMessagesWindow.mockResolvedValue(emptyMessageWindow());
    await store.actions.openRoom(CHATROOM_ID);

    store.actions.background();
    await store.actions.foreground();

    expect(chatApi.sendChatMessage).not.toHaveBeenCalled();
    expect(repository.retryFailedMessage).not.toHaveBeenCalled();
    expect(sync.runtime.resume).toHaveBeenCalled();
  });

  test("C1 load-more uses only the HTTP opaque cursor, independently of the SQLite cursor", async () => {
    const { chatApi, repository, store } = setup();
    const localCursor = {
      chatroomId: CHATROOM_ID,
      sortSeconds: 1,
      sortNanos: 0,
    };
    chatApi.listGroupChatrooms.mockResolvedValueOnce({
      items: [wireChatroom()],
      nextCursor: "server-room-page-2",
    });
    repository.listChatrooms.mockResolvedValueOnce({
      items: [repositoryChatroom()],
      hasMore: true,
      nextAfter: localCursor,
    });
    await store.actions.loadRooms(GROUP_ID);
    chatApi.listGroupChatrooms.mockResolvedValueOnce({
      items: [],
      nextCursor: null,
    });
    repository.listChatrooms.mockResolvedValueOnce({
      items: [],
      hasMore: false,
      nextAfter: null,
    });
    await store.actions.loadMoreRooms();
    expect(chatApi.listGroupChatrooms).toHaveBeenLastCalledWith(
      "fake-token",
      GROUP_ID,
      { after: "server-room-page-2" },
      expect.anything(),
    );
    expect(repository.listChatrooms).toHaveBeenLastCalledWith({
      groupId: GROUP_ID,
      after: localCursor,
      limit: expect.any(Number),
    });
  });

  test("an account change while enqueue is pending prevents even starting C4", async () => {
    const { chatApi, repository, store } = setup();
    repository.listMessagesWindow.mockResolvedValue(emptyMessageWindow());
    await store.actions.openRoom(CHATROOM_ID);
    const pending =
      deferred<Awaited<ReturnType<typeof repository.enqueuePendingMessage>>>();
    repository.enqueuePendingMessage.mockReturnValueOnce(pending.promise);
    const sending = store.actions.sendMessage("이전 계정");
    expect(repository.enqueuePendingMessage).toHaveBeenCalledTimes(1);
    store.setPrincipal(null, null, null);
    pending.resolve(pendingEnqueueResult());
    await sending;
    expect(chatApi.sendChatMessage).not.toHaveBeenCalled();
    expect(repository.mergeCanonicalMessage).not.toHaveBeenCalled();
    expect(store.getState().history.items).toEqual([]);
  });

  test("a late SQLite read after changing rooms cannot publish the old room snapshot", async () => {
    const { chatApi, repository, store } = setup();
    chatApi.listChatroomMessages.mockResolvedValue({
      items: [],
      nextCursor: null,
    });
    const readStarted = deferred<void>();
    const oldRead =
      deferred<Awaited<ReturnType<typeof repository.listMessagesWindow>>>();
    repository.listMessagesWindow.mockImplementationOnce(() => {
      readStarted.resolve();
      return oldRead.promise;
    });
    const oldOpening = store.actions.openRoom(CHATROOM_ID);
    await readStarted.promise;
    const currentRow = repositoryHistoryRow({
      localId: "current-room-row",
      chatroomId: OTHER_CHATROOM_ID,
    });
    repository.listMessagesWindow.mockResolvedValueOnce({
      items: [currentRow],
      hasMore: false,
      nextBefore: null,
    });
    await store.actions.openRoom(OTHER_CHATROOM_ID);
    oldRead.resolve({
      items: [repositoryHistoryRow()],
      hasMore: false,
      nextBefore: null,
    });
    await oldOpening;
    expect(store.getState().chatroomId).toBe(OTHER_CHATROOM_ID);
    expect(store.getState().history.items).toEqual([currentRow]);
  });

  test("changing rooms preserves an in-progress enqueue without publishing its old-room snapshot", async () => {
    const { repository, store } = setup();
    repository.listMessagesWindow.mockResolvedValue(emptyMessageWindow());
    await store.actions.openRoom(CHATROOM_ID);
    const write = deferred<ReturnType<typeof pendingEnqueueResult>>();
    repository.enqueuePendingMessage.mockReturnValueOnce(write.promise);
    const sending = store.actions.sendMessage("메시지");
    const opening = store.actions.openRoom(OTHER_CHATROOM_ID);
    write.resolve(pendingEnqueueResult());
    await Promise.all([sending, opening]);
    expect(repository.mergeCanonicalMessage).not.toHaveBeenCalled();
    expect(store.getState().chatroomId).toBe(OTHER_CHATROOM_ID);
    expect(store.getState().send.status).toBe("idle");
    expect(repository.markSendFailed).not.toHaveBeenCalled();
  });

  test("replacing the repository for the same principal invalidates the old lease's requests", async () => {
    const { chatApi, repository, store } = setup();
    const page =
      deferred<Awaited<ReturnType<typeof chatApi.listGroupChatrooms>>>();
    chatApi.listGroupChatrooms.mockReturnValueOnce(page.promise);
    const loading = store.actions.loadRooms(GROUP_ID);
    const signal = chatApi.listGroupChatrooms.mock.calls[0]![3] as AbortSignal;
    const replacement = fakeConnectedChatRepository();
    store.setPrincipal({ ...PRINCIPAL }, replacement, authorized);
    expect(signal.aborted).toBe(true);
    page.resolve({ items: [wireChatroom()], nextCursor: null });
    await loading;
    expect(repository.upsertChatrooms).not.toHaveBeenCalled();
    expect(replacement.upsertChatrooms).not.toHaveBeenCalled();
  });

  test("C1 appends the next repository page without dropping previously rendered rooms", async () => {
    const { chatApi, repository, store } = setup();
    const first = repositoryChatroom();
    const second = repositoryChatroom({ chatroomId: OTHER_CHATROOM_ID });
    chatApi.listGroupChatrooms.mockResolvedValueOnce({
      items: [],
      nextCursor: "next-rooms",
    });
    repository.listChatrooms.mockResolvedValueOnce({
      items: [first],
      hasMore: false,
      nextAfter: { chatroomId: CHATROOM_ID, sortNanos: 0, sortSeconds: 1 },
    });
    await store.actions.loadRooms(GROUP_ID);
    repository.listChatrooms.mockResolvedValueOnce({
      items: [second],
      hasMore: false,
      nextAfter: {
        chatroomId: OTHER_CHATROOM_ID,
        sortNanos: 0,
        sortSeconds: 2,
      },
    });
    await store.actions.loadMoreRooms();
    expect(store.getState().rooms.items).toEqual([first, second]);
    expect(store.getState().rooms.hasMore).toBe(false);
  });

  test("C2 prepends an older repository-only page while keeping the newest loaded message", async () => {
    const { chatApi, repository, store } = setup();
    const newest = repositoryHistoryRow({ localId: "newest" });
    const older = repositoryHistoryRow({
      localId: "older",
      serverMessageId: "66666666-6666-4666-8666-666666666666",
      createdAtRaw: "2024-01-01T00:00:00.000000000Z",
    });
    chatApi.listChatroomMessages.mockResolvedValueOnce({
      items: [],
      nextCursor: "older-page",
    });
    repository.listMessagesWindow.mockResolvedValueOnce({
      items: [newest],
      hasMore: false,
      nextBefore: messageCursor({ localId: "newest" }),
    });
    await store.actions.openRoom(CHATROOM_ID);
    repository.listMessagesWindow.mockResolvedValueOnce({
      items: [older],
      hasMore: false,
      nextBefore: messageCursor({ localId: "older" }),
    });
    await store.actions.loadOlderHistory();
    expect(store.getState().history.items).toEqual([older, newest]);
  });

  test("a stale retry id from another room never starts that room's send", async () => {
    const { chatApi, repository, store } = setup();
    repository.listMessagesWindow.mockResolvedValue(emptyMessageWindow());
    await store.actions.openRoom(CHATROOM_ID);
    repository.getOutboxCommand.mockResolvedValueOnce({
      ...pendingEnqueueResult().command,
      chatroomId: OTHER_CHATROOM_ID,
      state: "failed",
    });
    await store.actions.retryMessage("gen-client-1");
    expect(repository.retryFailedMessage).not.toHaveBeenCalled();
    expect(chatApi.sendChatMessage).not.toHaveBeenCalled();
  });

  test("an older-page failure can be explicitly retried with the same server cursor", async () => {
    const { chatApi, repository, store } = setup();
    chatApi.listChatroomMessages.mockResolvedValueOnce({
      items: [],
      nextCursor: "same-older-page",
    });
    repository.listMessagesWindow.mockResolvedValue({
      items: [repositoryHistoryRow()],
      hasMore: false,
      nextBefore: messageCursor(),
    });
    await store.actions.openRoom(CHATROOM_ID);
    chatApi.listChatroomMessages.mockRejectedValueOnce(
      new ChatApiError(500, "server_unavailable"),
    );
    await store.actions.loadOlderHistory();
    expect(store.getState().history.status).toBe("error");
    await store.actions.loadOlderHistory();
    expect(chatApi.listChatroomMessages).toHaveBeenCalledTimes(3);
    expect(chatApi.listChatroomMessages).toHaveBeenLastCalledWith(
      "fake-token",
      CHATROOM_ID,
      { before: "same-older-page" },
      expect.anything(),
    );
    expect(store.getState().history.status).toBe("ready");
  });
});
