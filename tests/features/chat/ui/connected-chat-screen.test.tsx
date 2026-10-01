import { render } from "@testing-library/react-native";

import { AppThemeProvider } from "@/core/theme/theme-provider";
import { ConnectedChatScreen } from "@/features/chat/ui/connected-chat-screen";

const GROUP_ID = "aaaaaaaa-0000-4000-8000-000000000001";
const CHATROOM_ID = "bbbbbbbb-0000-4000-8000-000000000002";
const TOPIC_ID = "cccccccc-0000-4000-8000-000000000003";

// E6a/CHAT-AC4: only Stack.Screen's `options` matter here -- a bare stand-in
// (no real navigator) that records every call, mirroring
// chat-message-row.test.tsx's mockMessageMenuActions precedent.
const mockStackScreenOptions = jest.fn();
const mockRouterReplace = jest.fn();
let mockIsFocusedValue = true;
jest.mock("expo-router", () => ({
  Stack: {
    Screen: (props: { options?: Record<string, unknown> }) => {
      mockStackScreenOptions(props.options);
      return null;
    },
  },
  useFocusEffect: jest.fn(),
  useIsFocused: () => mockIsFocusedValue,
  useRouter: () => ({ push: jest.fn(), replace: mockRouterReplace }),
}));

jest.mock("@/core/providers/session-provider", () => ({
  useSession: () => ({ principal: { userId: "user-1", epoch: 0 } }),
}));

jest.mock("@/core/providers/app-providers", () => ({
  useAccountScope: () => ({ state: { status: "ready" }, retry: jest.fn() }),
}));

jest.mock("@/features/media/model/use-media-upload-queue", () => ({
  useMediaUploadQueue: () => ({}),
}));

// connected-chat-screen.tsx statically imports chat-screen.tsx (its
// non-deleted-branch shell), and that module graph pulls in native-only
// modules at evaluation time (react-native-keyboard-controller,
// react-native-reanimated/worklets), so the whole shell is replaced by a
// stand-in instead of mocking each native dependency. The stand-in only
// records the header options the real shell sets once a topic title
// resolves: a `headerTitle` function (the title button) plus `title`.
jest.mock("@/features/chat/ui/chat-screen", () => ({
  ChatConversationScreen: (props: { title: string }) => {
    mockStackScreenOptions({ headerTitle: () => null, title: props.title });
    return null;
  },
}));

// D7/E4 title resolution is not reachable from the deleted-topic branch this
// suite targets (it returns before ChatConversationScreen ever renders it);
// stubbed out so its own internal useTopics/useConnectedChat/useGroupName
// calls do not need a second, independent mock shape here.
jest.mock("@/features/chat/model/use-chatroom-title", () => ({
  useChatroomTitle: () => ({
    kind: "unresolved" as const,
    title: "대화",
    targetTopicId: null,
  }),
}));

let mockTopicsState: Readonly<{
  accessLost: boolean;
  detail: Readonly<{
    id: string | null;
    status: "idle" | "loading" | "ready" | "error" | "deleted";
    topic: unknown;
  }>;
}>;
jest.mock("@/features/topics/model/topics-provider", () => ({
  useTopics: () => ({
    ready: true,
    state: mockTopicsState,
    store: { actions: { openTopic: jest.fn() } },
  }),
}));

const mockConnectedChatActions = {
  closeRoom: jest.fn(),
  deleteMessage: jest.fn(),
  discardFailedMessage: jest.fn(),
  markVisibleMessages: jest.fn(),
  openRoom: jest.fn(),
  retryMessage: jest.fn(),
  retryRead: jest.fn(),
  sendMessage: jest.fn(),
};

function defaultRooms() {
  return {
    error: null,
    hasMore: false,
    items: [
      {
        chatroomId: CHATROOM_ID,
        createdAtRaw: "2026-09-10T00:00:00Z",
        groupId: GROUP_ID,
        kind: "topic" as const,
        topicId: TOPIC_ID,
      },
    ],
    loadingMore: false,
    nextAfter: null,
    status: "ready" as const,
  };
}

function defaultConnectedChatState() {
  return {
    accessLost: false,
    chatroomId: null as string | null,
    history: {
      error: null,
      hasMore: false,
      items: [],
      loadingMore: false,
      status: "idle" as const,
    },
    read: { status: "idle" as const },
    roomAccessLost: false,
    rooms: defaultRooms(),
    send: { status: "idle" as const },
    sync: "connected" as const,
  };
}

let mockConnectedChatState = defaultConnectedChatState();
jest.mock("@/features/chat/model/connected-chat-provider", () => ({
  useConnectedChat: () => ({
    actions: mockConnectedChatActions,
    ready: true,
    state: mockConnectedChatState,
  }),
}));

beforeEach(() => {
  mockStackScreenOptions.mockClear();
  mockRouterReplace.mockClear();
  mockIsFocusedValue = true;
  mockTopicsState = {
    accessLost: false,
    detail: { id: TOPIC_ID, status: "deleted", topic: null },
  };
  mockConnectedChatState = defaultConnectedChatState();
});

describe("ConnectedChatScreen deleted-topic header (CHAT-AC4/E6a)", () => {
  test("sets the header title to 삭제된 주제 with no title-button options, instead of the topic's own title", async () => {
    await render(
      <AppThemeProvider>
        <ConnectedChatScreen chatroomId={CHATROOM_ID} groupId={GROUP_ID} />
      </AppThemeProvider>,
    );

    expect(mockStackScreenOptions).toHaveBeenCalledTimes(1);
    expect(mockStackScreenOptions).toHaveBeenCalledWith({
      headerTitle: "삭제된 주제",
      title: "삭제된 주제",
    });
  });

  test("replaces the open topic's title button once the topic is deleted -- screen options merge across renders (device round)", async () => {
    mockTopicsState = {
      accessLost: false,
      detail: { id: TOPIC_ID, status: "ready", topic: { title: "주제" } },
    };
    mockConnectedChatState = {
      ...defaultConnectedChatState(),
      chatroomId: CHATROOM_ID,
    };
    const screen = await render(
      <AppThemeProvider>
        <ConnectedChatScreen chatroomId={CHATROOM_ID} groupId={GROUP_ID} />
      </AppThemeProvider>,
    );
    mockTopicsState = {
      accessLost: false,
      detail: { id: TOPIC_ID, status: "deleted", topic: null },
    };
    await screen.rerender(
      <AppThemeProvider>
        <ConnectedChatScreen chatroomId={CHATROOM_ID} groupId={GROUP_ID} />
      </AppThemeProvider>,
    );
    // React Navigation merges every setOptions call into the screen's
    // options, so an option the deleted branch leaves out keeps the shell's
    // earlier value.
    const merged = Object.assign(
      {},
      ...mockStackScreenOptions.mock.calls.map(([options]) => options),
    );
    expect(merged.title).toBe("삭제된 주제");
    expect(merged.headerTitle).toBe("삭제된 주제");
  });
});

describe("ConnectedChatScreen access-loss redirect focus guard (E4/C4, task-app-media request)", () => {
  test("does not redirect while a screen on top holds focus, and redirects once this screen regains focus", async () => {
    mockTopicsState = {
      accessLost: false,
      detail: { id: null, status: "idle", topic: null },
    };
    mockConnectedChatState = {
      ...defaultConnectedChatState(),
      accessLost: true,
      chatroomId: CHATROOM_ID,
      rooms: { ...defaultRooms(), items: [] },
    };
    mockIsFocusedValue = false;

    const screen = await render(
      <AppThemeProvider>
        <ConnectedChatScreen chatroomId={CHATROOM_ID} groupId={GROUP_ID} />
      </AppThemeProvider>,
    );
    expect(mockRouterReplace).not.toHaveBeenCalled();

    mockIsFocusedValue = true;
    await screen.rerender(
      <AppThemeProvider>
        <ConnectedChatScreen chatroomId={CHATROOM_ID} groupId={GROUP_ID} />
      </AppThemeProvider>,
    );
    expect(mockRouterReplace).toHaveBeenCalledWith("/");
  });
});
