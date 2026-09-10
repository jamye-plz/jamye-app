import { createConnectedChatStore } from "@/features/chat/model/connected-chat-store";
import { ChatApiError } from "@/features/chat/data/chat-api";
import type { ChatMessageSendResult } from "@/features/chat/data/chat-api";
import {
  CHATROOM_ID,
  OTHER_CHATROOM_ID,
  PRINCIPAL,
  canonicalWireMessage,
  deferred,
  emptyMessageWindow,
  fakeChatApi,
  fakeClock,
  fakeConnectedChatRepository,
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
  const store = createConnectedChatStore({
    createApi: () => api,
    clock: fakeClock(),
    messageIdentity: identity,
  });
  store.setPrincipal(PRINCIPAL, repository, (execute, signal) =>
    execute("fake", signal!),
  );
  return { store, api, repository, identity };
}

test("SQLite pending and failed rows are visible before and after the HTTP attempt", async () => {
  const { store, api } = setup();
  await store.actions.openRoom(CHATROOM_ID);
  const response = deferred<ChatMessageSendResult>();
  const started = deferred<void>();
  api.sendChatMessage.mockImplementation(() => {
    started.resolve();
    return response.promise;
  });
  const sending = store.actions.sendMessage("그대로\n보내기");
  await started.promise;
  expect(store.getState().history.items).toEqual([
    expect.objectContaining({ body: "그대로\n보내기", status: "pending" }),
  ]);
  response.reject(new ChatApiError(0, "network_error"));
  await sending;
  expect(store.getState().history.items[0]?.status).toBe("failed");
});

test.each(["background", "closeRoom"] as const)(
  "%s interrupts pending send; re-entry permits only an explicit exact retry",
  async (action) => {
    const { store, api, repository, identity } = setup();
    await store.actions.openRoom(CHATROOM_ID);
    const response = deferred<ChatMessageSendResult>();
    const started = deferred<void>();
    api.sendChatMessage.mockImplementationOnce(() => {
      started.resolve();
      return response.promise;
    });
    const sending = store.actions.sendMessage("한글 🙂\n 원문 ");
    await started.promise;
    store.actions[action]();
    if (action === "background") await store.actions.foreground();
    else await store.actions.openRoom(CHATROOM_ID);
    expect(repository.markSendFailed).toHaveBeenCalledWith({
      clientMsgId: "gen-client-1",
      errorCode: "network",
    });
    expect(store.getState().history.items[0]?.status).toBe("failed");
    expect(store.getState().send.status).not.toBe("pending");
    expect(api.sendChatMessage).toHaveBeenCalledTimes(1);
    response.resolve({ status: 201, message: canonicalWireMessage() });
    await sending;
    expect(repository.mergeCanonicalMessage).not.toHaveBeenCalled();
    api.sendChatMessage.mockRejectedValueOnce(
      new ChatApiError(0, "network_error"),
    );
    await store.actions.retryMessage("gen-client-1");
    expect(api.sendChatMessage).toHaveBeenCalledTimes(2);
    expect(api.sendChatMessage).toHaveBeenLastCalledWith(
      "fake",
      CHATROOM_ID,
      { body: "한글 🙂\n 원문 ", clientMessageId: "gen-client-1" },
      expect.anything(),
    );
    expect(identity.next).toHaveBeenCalledTimes(1);
  },
);

test("double tap during SQLite enqueue creates just one command", async () => {
  const { store, repository, identity, api } = setup();
  await store.actions.openRoom(CHATROOM_ID);
  const write = deferred<ReturnType<typeof pendingEnqueueResult>>();
  repository.enqueuePendingMessage.mockReturnValueOnce(write.promise);
  api.sendChatMessage.mockRejectedValue(new ChatApiError(0, "network_error"));
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
  expect(repository.markSendFailed).toHaveBeenCalled();
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
