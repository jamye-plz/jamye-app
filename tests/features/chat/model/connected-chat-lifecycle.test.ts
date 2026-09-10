import { createConnectedChatStore } from "@/features/chat/model/connected-chat-store";
import {
  CHATROOM_ID,
  OTHER_CHATROOM_ID,
  PRINCIPAL,
  deferred,
  emptyMessageWindow,
  fakeChatApi,
  fakeClock,
  fakeConnectedChatRepository,
  fakeConnectedSync,
  fakeMessageIdentity,
  pendingEnqueueResult,
} from "./connected-chat-fixtures";

function setup() {
  const api = fakeChatApi();
  const repository = fakeConnectedChatRepository();
  let row = pendingEnqueueResult().message;
  let command = pendingEnqueueResult().command;
  let enqueued = false;
  repository.listMessagesWindow.mockImplementation(async ({ chatroomId }) => ({
    ...emptyMessageWindow(),
    items: enqueued && chatroomId === row.chatroomId ? [row] : [],
  }));
  repository.enqueuePendingMessage.mockImplementation(async (input) => {
    enqueued = true;
    const result = pendingEnqueueResult(input);
    row = result.message;
    command = result.command;
    return result;
  });
  repository.markSendFailed.mockImplementation(async ({ errorCode }) => {
    row = { ...row, status: "failed" };
    command = { ...command, state: "failed", errorCode };
  });
  repository.getOutboxCommand.mockImplementation(async () => command);
  repository.retryFailedMessage.mockImplementation(async () => {
    row = { ...row, status: "pending" };
    return { message: row, command };
  });
  const identity = fakeMessageIdentity();
  const sync = fakeConnectedSync();
  const store = createConnectedChatStore({
    createApi: () => api,
    clock: fakeClock(),
    messageIdentity: identity,
    createSync: sync.create,
  });
  store.setPrincipal(PRINCIPAL, repository, (execute, signal) =>
    execute("fake", signal!),
  );
  return { store, api, repository, identity, sync };
}

test("SQLite pending and dispatcher-failed rows are visible without a view-owned HTTP attempt", async () => {
  const { store, api, repository, sync } = setup();
  await store.actions.openRoom(CHATROOM_ID);
  await store.actions.sendMessage("그대로\n보내기");
  expect(store.getState().history.items).toEqual([
    expect.objectContaining({ body: "그대로\n보내기", status: "pending" }),
  ]);
  // Simulate a stable failure already committed by the exclusive dispatcher.
  await repository.markSendFailed({
    clientMsgId: "gen-client-1",
    errorCode: "conflict",
  });
  await sync.bindings[0].onChanged();
  expect(store.getState().history.items[0]?.status).toBe("failed");
  expect(api.sendChatMessage).not.toHaveBeenCalled();
  store.dispose();
});

test.each(["background", "closeRoom"] as const)(
  "%s preserves the pending send identity for the account dispatcher on re-entry",
  async (action) => {
    const { store, api, repository, identity, sync } = setup();
    await store.actions.openRoom(CHATROOM_ID);
    await store.actions.sendMessage("한글 🙂\n 원문 ");
    store.actions[action]();
    if (action === "background") await store.actions.foreground();
    else await store.actions.openRoom(CHATROOM_ID);
    expect(repository.markSendFailed).not.toHaveBeenCalled();
    expect(store.getState().history.items[0]?.status).toBe("pending");
    expect(store.getState().send.status).not.toBe("pending");
    expect(api.sendChatMessage).not.toHaveBeenCalled();
    expect(repository.mergeCanonicalMessage).not.toHaveBeenCalled();
    await store.actions.retryMessage("gen-client-1");
    expect(repository.retryFailedMessage).not.toHaveBeenCalled();
    expect(sync.runtime.wake).toHaveBeenCalledTimes(1);
    expect(identity.next).toHaveBeenCalledTimes(1);
    store.dispose();
  },
);

test("double tap during SQLite enqueue creates just one command", async () => {
  const { store, repository, identity } = setup();
  await store.actions.openRoom(CHATROOM_ID);
  const write = deferred<ReturnType<typeof pendingEnqueueResult>>();
  repository.enqueuePendingMessage.mockReturnValueOnce(write.promise);
  const first = store.actions.sendMessage("first");
  const second = store.actions.sendMessage("second");
  expect(identity.next).toHaveBeenCalledTimes(1);
  write.resolve(pendingEnqueueResult());
  await Promise.all([first, second]);
});

test("background during enqueue settles the local row without dispatch or cross-room publication", async () => {
  const { store, repository, api } = setup();
  await store.actions.openRoom(CHATROOM_ID);
  const write = deferred<ReturnType<typeof pendingEnqueueResult>>();
  repository.enqueuePendingMessage.mockReturnValueOnce(write.promise);
  const sending = store.actions.sendMessage("message");
  store.actions.background();
  write.resolve(pendingEnqueueResult());
  await sending;
  await store.actions.foreground();
  expect(repository.markSendFailed).not.toHaveBeenCalled();
  expect(api.sendChatMessage).not.toHaveBeenCalled();
  await store.actions.openRoom(OTHER_CHATROOM_ID);
  expect(store.getState().history.items).toEqual([]);
});

test("background blocks even retained screen send actions", async () => {
  const { store, repository } = setup();
  await store.actions.openRoom(CHATROOM_ID);
  store.actions.background();
  await store.actions.sendMessage("hidden screen");
  expect(repository.enqueuePendingMessage).not.toHaveBeenCalled();
});

test("an interrupted enqueue failure cannot publish a send error into the next room", async () => {
  const { store, repository, api } = setup();
  await store.actions.openRoom(CHATROOM_ID);
  const write = deferred<ReturnType<typeof pendingEnqueueResult>>();
  repository.enqueuePendingMessage.mockReturnValueOnce(write.promise);
  const sending = store.actions.sendMessage("old room");
  const opening = store.actions.openRoom(OTHER_CHATROOM_ID);
  write.reject(new Error("database unavailable"));
  await Promise.all([sending, opening]);
  expect(store.getState()).toMatchObject({
    chatroomId: OTHER_CHATROOM_ID,
    send: { status: "idle" },
    history: { status: "ready", items: [] },
  });
  expect(api.sendChatMessage).not.toHaveBeenCalled();
});
