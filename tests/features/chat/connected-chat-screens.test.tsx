import { act, fireEvent, render } from "@testing-library/react-native";
import type { FlatListProps } from "react-native";
import type { ComponentProps } from "react";
import { AppThemeProvider } from "@/core/theme/theme-provider";
import { ChatRoomsScreen } from "@/features/chat/ui/chat-rooms-screen";
import { ConnectedChatScreen } from "@/features/chat/ui/connected-chat-screen";
import { ChatRouteGuard } from "@/features/chat/ui/chat-route-guard";
import type { ChatComposer } from "@/features/chat/ui/chat-composer";
import type { ChatMessage } from "@/features/chat/model/chat-message-window";
import { createConnectedChatStore } from "@/features/chat/model/connected-chat-store";
import type {
  ConnectedChatState,
  ConnectedChatStoreActions,
} from "@/features/chat/model/connected-chat-store";
import {
  CHATROOM_ID,
  GROUP_ID,
  OTHER_CHATROOM_ID,
  PRINCIPAL,
  SERVER_MESSAGE_ID,
  deferred,
  fakeChatApi,
  fakeClock,
  fakeMessageIdentity,
  repositoryChatroom,
  repositoryHistoryRow,
} from "./model/connected-chat-fixtures";
import ChatroomsRoute from "@/app/groups/[groupId]/chatrooms/index";
import ChatroomRoute from "@/app/groups/[groupId]/chatrooms/[chatroomId]";

const mockRouter = { push: jest.fn(), replace: jest.fn() };
const mockRedirect = jest.fn();
const mockObserveList = jest.fn<void, [FlatListProps<ChatMessage>]>();
const mockObserveComposer = jest.fn<
  void,
  [ComponentProps<typeof ChatComposer>]
>();
let mockParams: Record<string, string | string[]> = {};
let mockAppMode = "connected-auth";
let mockPrincipal: typeof PRINCIPAL | null = PRINCIPAL;
let mockAccount = { state: { status: "ready" }, retry: jest.fn() };
let mockChat: {
  state: ConnectedChatState;
  actions: ConnectedChatStoreActions;
  ready: boolean;
};
jest.mock("expo-router", () => ({
  useRouter: () => mockRouter,
  useLocalSearchParams: () => mockParams,
  useFocusEffect: (callback: () => void | (() => void)) => {
    const React = jest.requireActual<typeof import("react")>("react");
    React.useEffect(callback, [callback]);
  },
  Redirect: (props: { href: string }) => {
    mockRedirect(props.href);
    return null;
  },
}));
jest.mock("@/core/config/public-env", () => ({
  getPublicEnv: () => ({ appMode: mockAppMode }),
}));
jest.mock("@/core/providers/session-provider", () => ({
  useSession: () => ({ principal: mockPrincipal }),
}));
jest.mock("@/core/providers/app-providers", () => ({
  useAccountScope: () => mockAccount,
}));
jest.mock("@/features/chat/model/connected-chat-provider", () => ({
  useConnectedChat: () => mockChat,
}));
jest.mock("@/features/chat/ui/chat-composer", () => {
  const React = jest.requireActual<typeof import("react")>("react");
  const actual = jest.requireActual<
    typeof import("@/features/chat/ui/chat-composer")
  >("@/features/chat/ui/chat-composer");
  return {
    ChatComposer: (props: ComponentProps<typeof ChatComposer>) => {
      mockObserveComposer(props);
      return React.createElement(actual.ChatComposer, props);
    },
  };
});
jest.mock("react-native-safe-area-context", () => ({
  ...jest.requireActual("react-native-safe-area-context"),
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));
jest.mock("react-native-keyboard-controller", () => ({
  KeyboardState: { UNKNOWN: 0, OPENING: 1, OPEN: 2, CLOSING: 3, CLOSED: 4 },
  useAnimatedKeyboard: () => ({
    height: { value: 0, get: () => 0 },
    state: { value: 0, get: () => 0 },
  }),
}));
jest.mock("react-native-reanimated", () => {
  const React = jest.requireActual<typeof import("react")>("react");
  const { FlatList, View } =
    jest.requireActual<typeof import("react-native")>("react-native");
  const shared = (initial: unknown) => {
    let value = initial;
    return {
      get value() {
        return value;
      },
      set value(next: unknown) {
        value = next;
      },
      get: () => value,
      set: (next: unknown) => {
        value = typeof next === "function" ? next(value) : next;
      },
    };
  };
  const ObservedList = (props: FlatListProps<ChatMessage>) => {
    mockObserveList(props);
    return React.createElement(FlatList<ChatMessage>, props);
  };
  return {
    __esModule: true,
    default: { FlatList: ObservedList, View },
    scrollTo: jest.fn(),
    useAnimatedReaction: () => undefined,
    useAnimatedRef: () => ({ current: null }),
    useAnimatedStyle: (updater: () => unknown) => updater(),
    useDerivedValue: (updater: () => unknown) => shared(updater()),
    useSharedValue: shared,
  };
});

function actions(): ConnectedChatStoreActions {
  return {
    loadRooms: jest.fn().mockResolvedValue(undefined),
    loadMoreRooms: jest.fn().mockResolvedValue(undefined),
    closeRooms: jest.fn(),
    openRoom: jest.fn().mockResolvedValue(undefined),
    loadOlderHistory: jest.fn().mockResolvedValue(undefined),
    sendMessage: jest.fn().mockResolvedValue(undefined),
    retryMessage: jest.fn().mockResolvedValue(undefined),
    markVisibleMessages: jest.fn().mockResolvedValue(undefined),
    retryRead: jest.fn().mockResolvedValue(undefined),
    closeRoom: jest.fn(),
    background: jest.fn(),
    foreground: jest.fn().mockResolvedValue(undefined),
  };
}
beforeEach(() => {
  jest.clearAllMocks();
  mockPrincipal = PRINCIPAL;
  mockAppMode = "connected-auth";
  mockParams = { groupId: GROUP_ID, chatroomId: CHATROOM_ID };
  mockAccount = { state: { status: "ready" }, retry: jest.fn() };
  const initial = createConnectedChatStore({
    clock: fakeClock(),
    createApi: fakeChatApi,
    messageIdentity: fakeMessageIdentity(),
  }).getState();
  mockChat = {
    state: {
      ...initial,
      groupId: GROUP_ID,
      chatroomId: CHATROOM_ID,
      history: {
        ...initial.history,
        status: "ready",
        items: [repositoryHistoryRow()],
      },
      rooms: {
        ...initial.rooms,
        status: "ready",
        items: [repositoryChatroom()],
      },
    },
    actions: actions(),
    ready: true,
  };
});
const roomTree = (roomId = CHATROOM_ID) => (
  <AppThemeProvider>
    <ConnectedChatScreen groupId={GROUP_ID} chatroomId={roomId} />
  </AppThemeProvider>
);
const roomsTree = (groupId = GROUP_ID) => (
  <AppThemeProvider>
    <ChatRoomsScreen groupId={groupId} />
  </AppThemeProvider>
);
const lastList = () =>
  mockObserveList.mock.calls[mockObserveList.mock.calls.length - 1][0];
const lastController = () =>
  mockObserveComposer.mock.calls[mockObserveComposer.mock.calls.length - 1][0]
    .controller;
const visible = (item: ChatMessage, isViewable = true) => ({
  item,
  isViewable,
  key: item.localId,
  index: 0,
});

test("offline sync keeps composing available with a durable queue notice", async () => {
  mockChat.state = { ...mockChat.state, sync: "offline" };
  const screen = await render(roomTree());
  expect(
    screen.getByText(
      "연결을 기다리는 중입니다. 메시지는 기기에 저장되고 연결되면 자동으로 전송됩니다.",
    ),
  ).toBeTruthy();
  expect(mockObserveComposer.mock.calls.at(-1)?.[0].blocked).not.toBe(true);
  await screen.unmount();
});

test("protocol upgrade blocks composing without discarding the queued messages", async () => {
  mockChat.state = { ...mockChat.state, sync: "upgrade-required" };
  const screen = await render(roomTree());
  expect(
    screen.getByText(
      "앱 업데이트가 필요합니다. 전송 대기 중인 메시지는 기기에 보관됩니다.",
    ),
  ).toBeTruthy();
  expect(mockObserveComposer.mock.calls.at(-1)?.[0].blocked).toBe(true);
  await screen.unmount();
});

test("C1 lists real room kinds, paginates, navigates and cancels when leaving the list", async () => {
  mockChat.state = {
    ...mockChat.state,
    rooms: {
      ...mockChat.state.rooms,
      hasMore: true,
      items: [
        repositoryChatroom(),
        repositoryChatroom({
          chatroomId: OTHER_CHATROOM_ID,
          kind: "topic",
          topicId: "topic",
        }),
      ],
    },
  };
  const screen = await render(roomsTree());
  expect(screen.getByRole("header", { name: "주제" })).toBeTruthy();
  expect(screen.queryByText(/채팅방/)).toBeNull();
  expect(mockChat.actions.loadRooms).toHaveBeenCalledWith(GROUP_ID);
  await fireEvent.press(
    screen.getByRole("button", { name: `기본 주제 · ${CHATROOM_ID}` }),
  );
  expect(mockRouter.push).toHaveBeenCalledWith({
    pathname: "/groups/[groupId]/chatrooms/[chatroomId]",
    params: { groupId: GROUP_ID, chatroomId: CHATROOM_ID },
  });
  expect(
    screen.getByRole("button", { name: `주제 · ${OTHER_CHATROOM_ID}` }),
  ).toBeTruthy();
  await fireEvent.press(screen.getByRole("button", { name: "주제 더 보기" }));
  expect(mockChat.actions.loadMoreRooms).toHaveBeenCalledTimes(1);
  await fireEvent.press(screen.getByRole("button", { name: "주제 새로고침" }));
  await fireEvent.press(
    screen.getByRole("button", { name: "그룹으로 돌아가기" }),
  );
  expect(mockRouter.replace).toHaveBeenCalledWith({
    pathname: "/groups/[groupId]",
    params: { groupId: GROUP_ID },
  });
  await screen.unmount();
  expect(mockChat.actions.closeRooms).toHaveBeenCalledTimes(1);
});

test("C1 distinguishes loading, empty and recoverable errors", async () => {
  mockChat.state = {
    ...mockChat.state,
    rooms: { ...mockChat.state.rooms, status: "loading", items: [] },
  };
  const screen = await render(roomsTree());
  expect(screen.getByText("주제 불러오는 중…")).toBeTruthy();
  mockChat.state = {
    ...mockChat.state,
    rooms: { ...mockChat.state.rooms, status: "ready" },
  };
  await screen.rerender(roomsTree());
  expect(screen.getByText("주제가 없습니다.")).toBeTruthy();
  mockChat.state = {
    ...mockChat.state,
    rooms: {
      ...mockChat.state.rooms,
      status: "error",
      error: "server_unavailable",
    },
  };
  await screen.rerender(roomsTree());
  await fireEvent.press(
    screen.getByRole("button", { name: "주제 다시 불러오기" }),
  );
  expect(mockChat.actions.loadRooms).toHaveBeenCalledTimes(2);
});

test("invalid routes and unavailable account storage cannot dispatch C1/C2", async () => {
  const screen = await render(roomsTree("bad"));
  expect(screen.getByText("올바르지 않은 그룹 주소입니다.")).toBeTruthy();
  await fireEvent.press(
    screen.getByRole("button", { name: "그룹으로 돌아가기" }),
  );
  expect(mockRouter.replace).toHaveBeenCalledWith("/");
  mockChat.ready = false;
  await screen.rerender(roomsTree());
  expect(screen.getByText("대화 저장소 준비 중…")).toBeTruthy();
  mockAccount.state = { status: "error" };
  await screen.rerender(roomsTree());
  await fireEvent.press(
    screen.getByRole("button", { name: "저장소 다시 열기" }),
  );
  expect(mockAccount.retry).toHaveBeenCalledTimes(1);
  await screen.rerender(roomTree());
  expect(screen.getByText("대화 저장소를 열지 못했습니다.")).toBeTruthy();
  await fireEvent.press(
    screen.getByRole("button", { name: "저장소 다시 열기" }),
  );
  expect(mockAccount.retry).toHaveBeenCalledTimes(2);
  await screen.rerender(roomTree("bad"));
  expect(screen.getByText("올바르지 않은 대화 주소입니다.")).toBeTruthy();
  expect(mockChat.actions.loadRooms).not.toHaveBeenCalled();
  expect(mockChat.actions.openRoom).not.toHaveBeenCalled();
});

test("membership loss hides C1/C2 rows and leaves the inaccessible conversation", async () => {
  mockChat.state = { ...mockChat.state, accessLost: true };
  const screen = await render(roomsTree());
  expect(
    screen.queryByRole("button", { name: `기본 주제 · ${CHATROOM_ID}` }),
  ).toBeNull();
  expect(mockRouter.replace).toHaveBeenCalledWith("/");
  await screen.rerender(roomTree());
  expect(screen.queryByText("안녕하세요")).toBeNull();
  expect(screen.getByText("이 대화에 접근할 수 없습니다.")).toBeTruthy();
});

test("the connected conversation uses existing chat UI, visible canonical IDs and exact manual retry", async () => {
  const failed = repositoryHistoryRow({
    localId: "local-failed",
    serverMessageId: null,
    clientMsgId: "retry-exact",
    status: "failed",
    body: "재시도할 원문",
  });
  mockChat.state = {
    ...mockChat.state,
    history: {
      ...mockChat.state.history,
      items: [repositoryHistoryRow(), failed],
    },
  };
  const screen = await render(roomTree());
  expect(mockChat.actions.openRoom).toHaveBeenCalledWith(CHATROOM_ID);
  expect(screen.getByText("안녕하세요")).toBeTruthy();
  expect(screen.queryByText(/로컬 fixture/)).toBeNull();
  expect(mockChat.actions.markVisibleMessages).not.toHaveBeenCalled();
  const list = lastList();
  const rows = list.data!;
  expect(list.keyExtractor!(rows[1], 1)).toBe("local-failed");
  expect(list.viewabilityConfig).toEqual({
    minimumViewTime: 350,
    itemVisiblePercentThreshold: 80,
  });
  await act(() =>
    list.onViewableItemsChanged!({
      viewableItems: [
        visible(rows[0]),
        visible(rows[1]),
        visible({ ...rows[0], serverMessageId: "unseen" }, false),
      ],
      changed: [],
    }),
  );
  expect(mockChat.actions.markVisibleMessages).toHaveBeenCalledWith([
    SERVER_MESSAGE_ID,
  ]);
  await fireEvent.press(
    screen.getByRole("button", { name: "메시지 다시 보내기" }),
  );
  expect(mockChat.actions.retryMessage).toHaveBeenCalledWith("retry-exact");
  await fireEvent.press(
    screen.getByRole("button", { name: "메시지 새로고침" }),
  );
  await fireEvent.press(screen.getByRole("button", { name: "주제 목록으로" }));
  expect(mockRouter.replace).toHaveBeenCalledWith({
    pathname: "/groups/[groupId]/chatrooms",
    params: { groupId: GROUP_ID },
  });
  await screen.unmount();
  expect(mockChat.actions.closeRoom).toHaveBeenCalledTimes(1);
});

test("a deleted sender and a system message are not visually grouped as the same person", async () => {
  mockChat.state = {
    ...mockChat.state,
    history: {
      ...mockChat.state.history,
      items: [
        repositoryHistoryRow({
          localId: "deleted-sender",
          senderId: null,
          senderNickname: null,
        }),
        repositoryHistoryRow({
          localId: "system",
          kind: "system",
          senderId: null,
          senderNickname: null,
          body: "그룹 안내",
        }),
      ],
    },
  };
  const screen = await render(roomTree());
  expect(screen.getByText("알 수 없는 사용자")).toBeTruthy();
  expect(screen.getByText("시스템")).toBeTruthy();
});

test("C3 failure stays separate from history and the composer, with explicit retry", async () => {
  mockChat.state = {
    ...mockChat.state,
    read: { status: "error", error: "network", marker: null },
    send: { status: "uncertain", errorCode: "network", clientMsgId: "exact" },
  };
  const screen = await render(roomTree());
  expect(screen.getByText("안녕하세요")).toBeTruthy();
  expect(screen.getByText(/같은 메시지로 다시 시도/)).toBeTruthy();
  await fireEvent.changeText(
    screen.getByLabelText("메시지 입력"),
    "계속 전송 가능",
  );
  expect(
    screen.getByRole("button", { name: "메시지 보내기" }),
  ).not.toBeDisabled();
  await fireEvent.press(
    screen.getByRole("button", { name: "읽음 처리 다시 시도" }),
  );
  expect(mockChat.actions.retryRead).toHaveBeenCalledTimes(1);
  mockChat.state = {
    ...mockChat.state,
    read: { status: "ready", marker: null, error: null },
  };
  await screen.rerender(roomTree());
  expect(screen.getByText("읽음 처리를 반영했습니다.")).toBeTruthy();
  mockChat.state = {
    ...mockChat.state,
    send: { status: "pending", clientMsgId: "exact" },
  };
  await screen.rerender(roomTree());
  expect(screen.getByRole("button", { name: "메시지 보내기" })).toBeDisabled();
});

test("only a local enqueue commit clears the multiline draft while network completion remains pending", async () => {
  const network = deferred<void>();
  let committed!: (id: string) => void;
  const send = jest.fn((_body: string, callback?: (id: string) => void) => {
    committed = callback!;
    return network.promise;
  });
  mockChat.actions = { ...mockChat.actions, sendMessage: send };
  const screen = await render(roomTree());
  await fireEvent.changeText(
    screen.getByLabelText("메시지 입력"),
    "한국어\n원문",
  );
  await fireEvent(screen.getByLabelText("메시지 입력"), "keyPress", {
    nativeEvent: { key: "Enter" },
  });
  expect(send).not.toHaveBeenCalled();
  await fireEvent.press(screen.getByRole("button", { name: "메시지 보내기" }));
  expect(send.mock.calls[0][0]).toBe("한국어\n원문");
  expect(screen.getByLabelText("메시지 입력").props.value).toBe("한국어\n원문");
  await act(() => committed("local-stable"));
  expect(screen.getByLabelText("메시지 입력").props.value).toBe("");
  await act(() => network.resolve());
});

test("a retained controller or viewability callback cannot act on a different or closed room", async () => {
  const screen = await render(roomTree());
  const oldController = lastController();
  const oldList = lastList();
  const oldViewability = oldList.onViewableItemsChanged!;
  mockChat.state = { ...mockChat.state, chatroomId: OTHER_CHATROOM_ID };
  await screen.rerender(roomTree(OTHER_CHATROOM_ID));
  await act(async () => {
    await oldController.send({ body: "오래된 화면", clearDraft: jest.fn() });
    oldViewability({ viewableItems: [visible(oldList.data![0])], changed: [] });
  });
  expect(mockChat.actions.sendMessage).not.toHaveBeenCalled();
  expect(mockChat.actions.markVisibleMessages).not.toHaveBeenCalled();
  const currentController = lastController();
  await screen.unmount();
  await currentController.send({ body: "닫힌 화면", clearDraft: jest.fn() });
  expect(mockChat.actions.sendMessage).not.toHaveBeenCalled();
});

test("thin routes use real params and reject malformed arrays; fixture and signed-out modes redirect", async () => {
  const screen = await render(
    <AppThemeProvider>
      <ChatroomsRoute />
    </AppThemeProvider>,
  );
  expect(mockChat.actions.loadRooms).toHaveBeenCalledWith(GROUP_ID);
  await screen.rerender(
    <AppThemeProvider>
      <ChatroomRoute />
    </AppThemeProvider>,
  );
  expect(screen.getByText("안녕하세요")).toBeTruthy();
  mockParams = { groupId: [GROUP_ID], chatroomId: [CHATROOM_ID] };
  await screen.rerender(
    <AppThemeProvider>
      <ChatroomRoute />
    </AppThemeProvider>,
  );
  expect(screen.getByText("올바르지 않은 대화 주소입니다.")).toBeTruthy();
  await screen.rerender(
    <AppThemeProvider>
      <ChatroomsRoute />
    </AppThemeProvider>,
  );
  expect(screen.getByText("올바르지 않은 그룹 주소입니다.")).toBeTruthy();
  mockPrincipal = null;
  await screen.rerender(
    <ChatRouteGuard>
      <></>
    </ChatRouteGuard>,
  );
  expect(mockRedirect).toHaveBeenCalledWith("/");
  mockAppMode = "fixture";
  await screen.rerender(
    <ChatRouteGuard>
      <></>
    </ChatRouteGuard>,
  );
  expect(mockRedirect).toHaveBeenCalledTimes(2);
});
