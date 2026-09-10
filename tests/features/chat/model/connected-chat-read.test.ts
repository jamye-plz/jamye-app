import { createConnectedChatStore } from "@/features/chat/model/connected-chat-store";
import { ChatApiError } from "@/features/chat/data/chat-api";
import {
  CHATROOM_ID,
  OTHER_CHATROOM_ID,
  PRINCIPAL,
  SERVER_MESSAGE_ID,
  OTHER_SERVER_MESSAGE_ID,
  deferred,
  fakeChatApi,
  fakeClock,
  fakeConnectedChatRepository,
  fakeMessageIdentity,
  repositoryHistoryRow,
  emptyMessageWindow,
} from "./connected-chat-fixtures";

function setup() {
  const api = fakeChatApi();
  const repo = fakeConnectedChatRepository();
  repo.listMessagesWindow.mockResolvedValue({
    ...emptyMessageWindow(),
    items: [
      repositoryHistoryRow(),
      repositoryHistoryRow({
        localId: "second",
        serverMessageId: OTHER_SERVER_MESSAGE_ID,
      }),
      repositoryHistoryRow({
        localId: "pending",
        status: "pending",
        serverMessageId: null,
      }),
    ],
  });
  const marker = {
    chatroomId: CHATROOM_ID,
    lastReadCursor: "9007199254740993",
    updatedAt: "2026-09-10T00:00:00Z",
  };
  api.markChatroomRead.mockResolvedValue(marker);
  const store = createConnectedChatStore({
    createApi: () => api,
    clock: fakeClock(),
    messageIdentity: fakeMessageIdentity(),
  });
  store.setPrincipal(PRINCIPAL, repo, (execute, signal) =>
    execute("fake", signal!),
  );
  return { store, api, repo, marker };
}

test("C3 uses only the newest visible canonical message, never the newest loaded unseen message", async () => {
  const { store, api, marker } = setup();
  await store.actions.openRoom(CHATROOM_ID);
  await store.actions.markVisibleMessages([
    "pending",
    "unloaded",
    SERVER_MESSAGE_ID,
  ]);
  expect(api.markChatroomRead).toHaveBeenCalledWith(
    "fake",
    CHATROOM_ID,
    { messageId: SERVER_MESSAGE_ID },
    expect.anything(),
  );
  expect(store.getState().read.marker).toEqual(marker);
  await store.actions.markVisibleMessages([SERVER_MESSAGE_ID]);
  expect(api.markChatroomRead).toHaveBeenCalledTimes(1);
});

test("C3 ignores empty, local-only, wrong-room and background anchors", async () => {
  const { store, api, repo } = setup();
  repo.listMessagesWindow.mockResolvedValue({
    ...emptyMessageWindow(),
    items: [repositoryHistoryRow({ chatroomId: OTHER_CHATROOM_ID })],
  });
  await store.actions.openRoom(CHATROOM_ID);
  await store.actions.markVisibleMessages([]);
  await store.actions.markVisibleMessages([SERVER_MESSAGE_ID, "pending"]);
  store.actions.background();
  await store.actions.markVisibleMessages([SERVER_MESSAGE_ID]);
  expect(api.markChatroomRead).not.toHaveBeenCalled();
});

test("read failure preserves history and send and waits for explicit retry of a still-visible anchor", async () => {
  const { store, api } = setup();
  await store.actions.openRoom(CHATROOM_ID);
  const history = store.getState().history;
  api.markChatroomRead.mockRejectedValueOnce(
    new ChatApiError(503, "unavailable"),
  );
  await store.actions.markVisibleMessages([SERVER_MESSAGE_ID]);
  expect(store.getState().history).toBe(history);
  expect(store.getState().read.status).toBe("error");
  await store.actions.markVisibleMessages([SERVER_MESSAGE_ID]);
  expect(api.markChatroomRead).toHaveBeenCalledTimes(1);
  await store.actions.retryRead();
  expect(store.getState().read.status).toBe("ready");
  expect(api.sendChatMessage).not.toHaveBeenCalled();
});

test("the read retry cannot advance an anchor that is no longer visible", async () => {
  const { store, api } = setup();
  await store.actions.openRoom(CHATROOM_ID);
  api.markChatroomRead.mockRejectedValueOnce(
    new ChatApiError(503, "unavailable"),
  );
  await store.actions.markVisibleMessages([SERVER_MESSAGE_ID]);
  await store.actions.markVisibleMessages([]);
  await store.actions.retryRead();
  expect(api.markChatroomRead).toHaveBeenCalledTimes(1);
});

test("late C3 response after room switch or account logout never updates the current marker", async () => {
  const { store, api, marker } = setup();
  await store.actions.openRoom(CHATROOM_ID);
  const response = deferred<typeof marker>();
  api.markChatroomRead.mockReturnValueOnce(response.promise);
  const reading = store.actions.markVisibleMessages([SERVER_MESSAGE_ID]);
  const signal = api.markChatroomRead.mock.calls[0]![3]!;
  await store.actions.openRoom(OTHER_CHATROOM_ID);
  expect(signal.aborted).toBe(true);
  response.resolve(marker);
  await reading;
  expect(store.getState().read.marker).toBeNull();
  store.setPrincipal(null, null, null);
  await store.actions.markVisibleMessages([SERVER_MESSAGE_ID]);
  expect(api.markChatroomRead).toHaveBeenCalledTimes(1);
});

test("read membership loss hides history and disables later send attempts", async () => {
  const { store, api, repo } = setup();
  await store.actions.openRoom(CHATROOM_ID);
  api.markChatroomRead.mockRejectedValueOnce(
    new ChatApiError(403, "membership_required"),
  );
  await store.actions.markVisibleMessages([SERVER_MESSAGE_ID]);
  expect(store.getState().accessLost).toBe(true);
  expect(store.getState().history.items).toEqual([]);
  await store.actions.sendMessage("blocked");
  expect(repo.enqueuePendingMessage).not.toHaveBeenCalled();
});
