import { act, render } from "@testing-library/react-native";
import { AppState, Text } from "react-native";
import type { AccountPrincipal } from "@/core/database/account/types";
import type { ConnectedChatRepository } from "@/core/database/account/connected-chat-types";
import {
  ConnectedChatProvider,
  useConnectedChat,
} from "@/features/chat/model/connected-chat-provider";
import { createConnectedChatStore } from "@/features/chat/model/connected-chat-store";
import type {
  AuthorizedChatRequest,
  ConnectedChatStore,
} from "@/features/chat/model/connected-chat-store";
import {
  CHATROOM_ID,
  PRINCIPAL,
  deferred,
  fakeChatApi,
  fakeClock,
  fakeConnectedChatRepository,
  fakeMessageIdentity,
  repositoryHistoryRow,
} from "./connected-chat-fixtures";

const authorize: AuthorizedChatRequest = (execute, signal) =>
  execute("fake", signal ?? new AbortController().signal);

function fixture() {
  const api = fakeChatApi();
  const repo = fakeConnectedChatRepository();
  repo.listMessagesWindow.mockResolvedValue({
    items: [repositoryHistoryRow()],
    hasMore: false,
    nextBefore: null,
  });
  const stores: ConnectedChatStore[] = [];
  const createStore = jest.fn(() => {
    const store = createConnectedChatStore({
      createApi: () => api,
      clock: fakeClock(),
      messageIdentity: fakeMessageIdentity(),
    });
    stores.push(store);
    return store;
  });
  const observations: string[] = [];
  function Probe({ label }: { label: string }) {
    const { state, ready } = useConnectedChat();
    observations.push(`${label}:${state.history.items.length}:${ready}`);
    return <Text>{`${state.history.items.length}:${ready}`}</Text>;
  }
  const tree = (
    principal: AccountPrincipal | null = PRINCIPAL,
    repository: ConnectedChatRepository | null = repo,
    auth = authorize,
    label = "current",
  ) => (
    <ConnectedChatProvider
      principal={principal}
      repository={repository}
      authorizedRequest={auth}
      createStore={createStore}
    >
      <Probe label={label} />
    </ConnectedChatProvider>
  );
  return { api, repo, stores, createStore, observations, tree };
}

describe("M8 account-scoped connected chat provider", () => {
  const initialAppState = AppState.currentState;
  beforeEach(() => {
    AppState.currentState = "active";
    jest
      .spyOn(AppState, "addEventListener")
      .mockImplementation(() => ({ remove: jest.fn() }));
  });
  afterEach(() => {
    AppState.currentState = initialAppState;
    jest.restoreAllMocks();
  });
  test.each(["user", "epoch", "logout"])(
    "masks old SQLite rows synchronously on %s and aborts the old request",
    async (change) => {
      const f = fixture();
      const screen = await render(f.tree());
      await act(() => f.stores[0].actions.openRoom(CHATROOM_ID));
      expect(screen.getByText("1:true")).toBeTruthy();
      const pending =
        deferred<Awaited<ReturnType<typeof f.api.listChatroomMessages>>>();
      f.api.listChatroomMessages.mockReturnValueOnce(pending.promise);
      let request!: Promise<void>;
      await act(() => {
        request = f.stores[0].actions.openRoom(CHATROOM_ID);
      });
      const signal = f.api.listChatroomMessages.mock.calls[1][3]!;
      const next =
        change === "logout"
          ? null
          : {
              ...PRINCIPAL,
              ...(change === "user"
                ? { userId: "other-account" }
                : { epoch: 2 }),
            };
      await screen.rerender(
        f.tree(next, change === "logout" ? null : f.repo, authorize, "new"),
      );
      expect(f.observations).not.toContain("new:1:true");
      expect(signal.aborted).toBe(true);
      expect(f.stores[0].getState().chatroomId).toBeNull();
      await act(async () => {
        pending.resolve({ items: [], nextCursor: null });
        await request;
      });
      expect(
        screen.getByText(change === "logout" ? "0:false" : "0:true"),
      ).toBeTruthy();
      await screen.unmount();
    },
  );

  test("keeps the store and rows during credential refresh and uses the latest authorization callback", async () => {
    const f = fixture();
    const screen = await render(f.tree());
    await act(() => f.stores[0].actions.openRoom(CHATROOM_ID));
    const authorizationCalls = jest.fn();
    const nextAuthorize: AuthorizedChatRequest = (execute, signal) => {
      authorizationCalls();
      return authorize(execute, signal);
    };
    await screen.rerender(f.tree({ ...PRINCIPAL }, f.repo, nextAuthorize));
    expect(f.createStore).toHaveBeenCalledTimes(1);
    expect(screen.getByText("1:true")).toBeTruthy();
    await act(() => f.stores[0].actions.openRoom(CHATROOM_ID));
    expect(authorizationCalls).toHaveBeenCalledTimes(1);
  });

  test("does not expose a ready scope before its repository opens, and replaces a closed handle", async () => {
    const f = fixture();
    const screen = await render(f.tree(PRINCIPAL, null));
    await act(() => f.stores[0].actions.openRoom(CHATROOM_ID));
    expect(screen.getByText("0:false")).toBeTruthy();
    expect(f.api.listChatroomMessages).not.toHaveBeenCalled();
    await screen.rerender(f.tree());
    await act(() => f.stores[1].actions.openRoom(CHATROOM_ID));
    expect(screen.getByText("1:true")).toBeTruthy();
    await screen.rerender(f.tree(PRINCIPAL, null, authorize, "closed"));
    expect(f.observations).not.toContain("closed:1:false");
    expect(f.stores[1].getState().history.items).toEqual([]);
  });

  test("only refreshes a focused loaded scope on foreground and removes lifecycle listeners", async () => {
    let listener!: (value: "active" | "background") => void;
    const remove = jest.fn();
    const spy = jest
      .spyOn(AppState, "addEventListener")
      .mockImplementation((_event, callback) => {
        listener = callback;
        return { remove };
      });
    try {
      const f = fixture();
      const screen = await render(f.tree());
      await act(() => {
        listener("background");
        listener("active");
      });
      expect(f.api.listChatroomMessages).not.toHaveBeenCalled();
      await act(() => f.stores[0].actions.openRoom(CHATROOM_ID));
      await act(async () => {
        listener("background");
        listener("active");
      });
      expect(f.api.listChatroomMessages).toHaveBeenCalledTimes(2);
      await act(() => f.stores[0].actions.closeRoom());
      await act(() => {
        listener("background");
        listener("active");
      });
      expect(f.api.listChatroomMessages).toHaveBeenCalledTimes(2);
      await screen.unmount();
      expect(remove).toHaveBeenCalledTimes(1);
    } finally {
      spy.mockRestore();
    }
  });

  test("rejects use outside the scoped provider", async () => {
    function Outside() {
      useConnectedChat();
      return null;
    }
    const error = jest
      .spyOn(console, "error")
      .mockImplementation(() => undefined);
    try {
      await expect(render(<Outside />)).rejects.toThrow(
        "ConnectedChatProvider",
      );
    } finally {
      error.mockRestore();
    }
  });

  test("a provider opened in the background cannot dispatch requests until foreground", async () => {
    AppState.currentState = "background";
    const f = fixture();
    const screen = await render(f.tree());
    await act(() => f.stores[0].actions.openRoom(CHATROOM_ID));
    expect(f.api.listChatroomMessages).not.toHaveBeenCalled();
    await screen.unmount();
  });
});
