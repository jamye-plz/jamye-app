import { createConnectedChatStore } from "@/features/chat/model/connected-chat-store";
import type { ConnectedChatSyncFactory } from "@/features/chat/model/connected-chat-store";
import type { ConnectedChatRepository } from "@/core/database/account/connected-chat-types";
import { ChatApiError } from "@/features/chat/data/chat-api";
import {
  CHATROOM_ID,
  OTHER_CHATROOM_ID,
  PRINCIPAL,
  deferred,
  emptyMessageWindow,
  fakeChatApi,
  fakeClock,
  fakeConnectedChatRepository,
  fakeMessageIdentity,
  pendingEnqueueResult,
  repositoryHistoryRow,
} from "./connected-chat-fixtures";

function setup() {
  const repository = fakeConnectedChatRepository();
  repository.listMessagesWindow.mockResolvedValue(emptyMessageWindow());
  const api = fakeChatApi();
  const runtimes: ReturnType<typeof makeRuntime>[] = [];
  const bindings: Parameters<ConnectedChatSyncFactory>[0][] = [];
  function makeRuntime() {
    return {
      start: jest.fn(),
      wake: jest.fn(),
      setConversations: jest.fn(),
      pause: jest.fn(),
      resume: jest.fn(),
      dispose: jest.fn(),
    };
  }
  const createSync: ConnectedChatSyncFactory = (binding) => {
    bindings.push(binding);
    const runtime = makeRuntime();
    runtimes.push(runtime);
    return runtime;
  };
  const store = createConnectedChatStore({
    clock: fakeClock(),
    messageIdentity: fakeMessageIdentity(),
    createApi: () => api,
    createSync,
  });
  store.setPrincipal(PRINCIPAL, repository, (execute, signal) =>
    execute("token", signal ?? new AbortController().signal),
  );
  return { api, repository, store, runtimes, bindings };
}

test("M9 commits immutable intent then wakes the sole dispatcher without direct C4", async () => {
  const f = setup();
  await f.store.actions.openRoom(CHATROOM_ID);
  f.repository.enqueuePendingMessage.mockResolvedValue(pendingEnqueueResult());
  const committed = jest.fn();
  await f.store.actions.sendMessage("메시지", committed);
  expect(committed).toHaveBeenCalledWith("gen-local-1");
  expect(f.runtimes[0].wake).toHaveBeenCalledTimes(1);
  expect(f.api.sendChatMessage).not.toHaveBeenCalled();
  expect(f.repository.markSendFailed).not.toHaveBeenCalled();
  expect(f.store.getState().send.status).toBe("idle");
  expect(f.runtimes[0].setConversations).toHaveBeenLastCalledWith([
    CHATROOM_ID,
  ]);
  f.store.dispose();
});

test("manual retry requeues the stored body and id, then wakes the dispatcher", async () => {
  const f = setup();
  await f.store.actions.openRoom(CHATROOM_ID);
  const queued = pendingEnqueueResult();
  f.repository.getOutboxCommand.mockResolvedValue({
    ...queued.command,
    state: "failed",
  });
  f.repository.retryFailedMessage.mockResolvedValue(queued);
  await f.store.actions.retryMessage(queued.command.clientMsgId);
  expect(f.repository.retryFailedMessage).toHaveBeenCalledWith({
    body: queued.command.body,
    chatroomId: CHATROOM_ID,
    clientMsgId: queued.command.clientMsgId,
  });
  expect(f.runtimes[0].wake).toHaveBeenCalledTimes(1);
  expect(f.api.sendChatMessage).not.toHaveBeenCalled();
  f.store.dispose();
});

test("background does not turn a durable enqueue into failed or release it to a second sender", async () => {
  const f = setup();
  await f.store.actions.openRoom(CHATROOM_ID);
  const pending = deferred<ReturnType<typeof pendingEnqueueResult>>();
  f.repository.enqueuePendingMessage.mockReturnValue(pending.promise);
  const committed = jest.fn();
  const sending = f.store.actions.sendMessage("메시지", committed);
  f.store.actions.background();
  pending.resolve(pendingEnqueueResult());
  await sending;
  expect(f.runtimes[0].pause).toHaveBeenCalledTimes(1);
  expect(f.repository.markSendFailed).not.toHaveBeenCalled();
  expect(f.api.sendChatMessage).not.toHaveBeenCalled();
  expect(committed).not.toHaveBeenCalled();
  await f.store.actions.foreground();
  expect(f.runtimes[0].resume).toHaveBeenCalled();
  f.store.dispose();
});

test("background cache changes and old-account callbacks cannot publish into the active room", async () => {
  const f = setup();
  await f.store.actions.openRoom(CHATROOM_ID);
  const row = repositoryHistoryRow();
  f.repository.listMessagesWindow.mockResolvedValue({
    ...emptyMessageWindow(),
    items: [row],
  });
  await f.bindings[0].onChanged();
  expect(f.store.getState().history.items).toEqual([row]);
  f.store.setPrincipal(
    { ...PRINCIPAL, epoch: 2 },
    f.repository,
    (execute, signal) => execute("new", signal ?? new AbortController().signal),
  );
  expect(f.runtimes[0].dispose).toHaveBeenCalledTimes(1);
  expect(f.bindings[0].isActive()).toBe(false);
  await f.bindings[0].onChanged();
  f.bindings[0].onState("membership-evicted");
  expect(f.store.getState().history.items).toEqual([]);
  expect(f.store.getState().accessLost).toBe(false);
  f.store.dispose();
});

test("4001 access eviction hides room data, blocks sending and leaves unrelated queues intact", async () => {
  const f = setup();
  await f.store.actions.openRoom(CHATROOM_ID);
  f.bindings[0].onState("membership-evicted");
  expect(f.store.getState().accessLost).toBe(true);
  expect(f.store.getState().history.items).toEqual([]);
  expect(f.store.getState().sync).toBe("membership-evicted");
  await f.store.actions.sendMessage("차단");
  expect(f.repository.enqueuePendingMessage).not.toHaveBeenCalled();
  expect(f.repository.markSendFailed).not.toHaveBeenCalled();
  await f.store.actions.openRoom(OTHER_CHATROOM_ID);
  expect(f.store.getState().accessLost).toBe(false);
  f.store.dispose();
});

test("upgrade-required is visible and preserves existing intent without accepting new sends", async () => {
  const f = setup();
  await f.store.actions.openRoom(CHATROOM_ID);
  f.bindings[0].onState("upgrade-required");
  expect(f.store.getState().sync).toBe("upgrade-required");
  await f.store.actions.sendMessage("업데이트 후");
  expect(f.repository.enqueuePendingMessage).not.toHaveBeenCalled();
  expect(f.repository.markSendFailed).not.toHaveBeenCalled();
  f.store.dispose();
});

test("a verified account can reopen its cached room offline and queue without C4", async () => {
  const f = setup();
  const cached = repositoryHistoryRow();
  f.repository.listMessagesWindow.mockResolvedValue({
    ...emptyMessageWindow(),
    items: [cached],
  });
  f.api.listChatroomMessages.mockRejectedValue(
    new ChatApiError(0, "network_unavailable"),
  );
  await f.store.actions.openRoom(CHATROOM_ID);
  expect(f.store.getState().history.items).toEqual([cached]);
  expect(f.store.getState().history.status).toBe("ready");
  expect(f.store.getState().sync).toBe("offline");
  f.repository.enqueuePendingMessage.mockResolvedValue(pendingEnqueueResult());
  await f.store.actions.sendMessage("오프라인 메시지");
  expect(f.runtimes[0].wake).toHaveBeenCalledTimes(1);
  expect(f.api.sendChatMessage).not.toHaveBeenCalled();
  f.store.dispose();
});

test("membership denial never falls back to cached room content", async () => {
  const f = setup();
  f.repository.listMessagesWindow.mockResolvedValue({
    ...emptyMessageWindow(),
    items: [repositoryHistoryRow()],
  });
  f.api.listChatroomMessages.mockRejectedValue(
    new ChatApiError(403, "membership_required"),
  );
  await f.store.actions.openRoom(CHATROOM_ID);
  expect(f.store.getState().history.items).toEqual([]);
  expect(f.store.getState().accessLost).toBe(true);
  f.store.dispose();
});

test("a denied S1 room hides only that conversation and fences its pending read", async () => {
  const f = setup();
  await f.store.actions.openRoom(CHATROOM_ID);
  const pending =
    deferred<
      Awaited<ReturnType<ConnectedChatRepository["listMessagesWindow"]>>
    >();
  f.repository.listMessagesWindow.mockReturnValueOnce(pending.promise);
  const reading = f.bindings[0].onChanged();
  f.bindings[0].onConversationEvicted?.(OTHER_CHATROOM_ID);
  expect(f.store.getState().accessLost).toBe(false);
  f.bindings[0].onConversationEvicted?.(CHATROOM_ID);
  pending.resolve({ ...emptyMessageWindow(), items: [repositoryHistoryRow()] });
  await reading;
  expect(f.store.getState().accessLost).toBe(true);
  expect(f.store.getState().history.items).toEqual([]);
  await f.store.actions.sendMessage("차단");
  expect(f.repository.enqueuePendingMessage).not.toHaveBeenCalled();
  f.store.dispose();
});
