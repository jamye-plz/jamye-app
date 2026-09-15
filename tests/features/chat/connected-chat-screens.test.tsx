import { act, fireEvent, render } from "@testing-library/react-native";
import type { FlatListProps } from "react-native";
import type { ComponentProps } from "react";
import { AppThemeProvider } from "@/core/theme/theme-provider";
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
const mockTopicsRoute = jest.fn();
const mockObserveList = jest.fn<void, [FlatListProps<ChatMessage>]>();
const mockObserveComposer = jest.fn<
  void,
  [ComponentProps<typeof ChatComposer>]
>();
type RecordedScreenOptions = Readonly<{
  headerRight?: () => unknown;
  headerTitle?: () => unknown;
  title?: string;
}>;
const mockObserveScreenOptions = jest.fn<void, [RecordedScreenOptions]>();
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
  Stack: {
    Screen: (props: { options?: RecordedScreenOptions }) => {
      if (props.options) mockObserveScreenOptions(props.options);
      return null;
    },
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
// Native image gestures have their own viewer tests; these tests exercise chat
// visibility/read receipts without initializing a native gesture detector.
jest.mock("@/features/media/ui/media-image-viewer", () => ({
  MediaImageViewer: () => null,
}));
// M10 owns the group topic-list view; these legacy tests retain the existing
// chat screens and check only the thin route's delegation to that new view.
jest.mock("@/features/topics/ui/topics-screen", () => ({
  TopicsScreen: (props: { groupId: string }) => {
    mockTopicsRoute(props);
    return null;
  },
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
const lastList = () =>
  mockObserveList.mock.calls[mockObserveList.mock.calls.length - 1][0];
const lastController = () =>
  mockObserveComposer.mock.calls[mockObserveComposer.mock.calls.length - 1][0]
    .controller;
const lastScreenOptions = () =>
  mockObserveScreenOptions.mock.calls[
    mockObserveScreenOptions.mock.calls.length - 1
  ]?.[0];
const visible = (item: ChatMessage, isViewable = true) => ({
  item,
  isViewable,
  key: item.localId,
  index: 0,
});

test("offline sync keeps composing available with a durable queue notice", async () => {
  mockChat.state = { ...mockChat.state, sync: "offline" };
  const screen = await render(roomTree());
  const headerTitleElement = lastScreenOptions()?.headerTitle?.() as
    { props: { subtitle?: string; title?: string } } | undefined;
  expect(headerTitleElement?.props.subtitle).toBe(
    "오프라인 · 기기에 저장 후 자동 전송",
  );
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

test("invalid routes and unavailable account storage cannot dispatch C2", async () => {
  mockChat.ready = false;
  mockAccount.state = { status: "error" };
  const screen = await render(roomTree());
  expect(screen.getByText("대화 저장소를 열지 못했습니다.")).toBeTruthy();
  await fireEvent.press(
    screen.getByRole("button", { name: "저장소 다시 열기" }),
  );
  expect(mockAccount.retry).toHaveBeenCalledTimes(1);
  await screen.rerender(roomTree("bad"));
  expect(screen.getByText("올바르지 않은 대화 주소입니다.")).toBeTruthy();
  expect(mockChat.actions.openRoom).not.toHaveBeenCalled();
});

test("membership loss leaves the inaccessible conversation", async () => {
  mockChat.state = { ...mockChat.state, accessLost: true };
  const screen = await render(roomTree());
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
  expect(list.viewabilityConfigCallbackPairs![0].viewabilityConfig).toEqual({
    minimumViewTime: 350,
    itemVisiblePercentThreshold: 80,
  });
  await act(() =>
    list.viewabilityConfigCallbackPairs![0].onViewableItemsChanged!({
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
  jest.mocked(mockChat.actions.markVisibleMessages).mockClear();
  expect(list.viewabilityConfigCallbackPairs![1].viewabilityConfig).toEqual({
    itemVisiblePercentThreshold: 1,
    minimumViewTime: 200,
  });
  await act(() =>
    list.viewabilityConfigCallbackPairs![1].onViewableItemsChanged!({
      viewableItems: [visible(rows[0])],
      changed: [],
    }),
  );
  expect(mockChat.actions.markVisibleMessages).not.toHaveBeenCalled();
  expect(lastList().extraData.has(rows[0].localId)).toBe(true);
  await fireEvent.press(
    screen.getByRole("button", { name: "메시지 다시 보내기" }),
  );
  expect(mockChat.actions.retryMessage).toHaveBeenCalledWith("retry-exact");
  const headerRightElement = lastScreenOptions()?.headerRight?.() as
    | {
        props: {
          accessibilityLabel?: string;
          disabled?: boolean;
          onPress?: () => void;
        };
      }
    | undefined;
  expect(headerRightElement?.props.accessibilityLabel).toBe("메시지 새로고침");
  headerRightElement?.props.onPress?.();
  expect(mockChat.actions.openRoom).toHaveBeenLastCalledWith(CHATROOM_ID);
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
  const oldViewability =
    oldList.viewabilityConfigCallbackPairs![0].onViewableItemsChanged!;
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
  expect(mockTopicsRoute).toHaveBeenLastCalledWith({ groupId: GROUP_ID });
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
  expect(mockTopicsRoute).toHaveBeenLastCalledWith({ groupId: "" });
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
