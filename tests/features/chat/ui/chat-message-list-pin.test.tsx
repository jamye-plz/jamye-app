import { fireEvent, render } from "@testing-library/react-native";
import type { ReactNode } from "react";
import { FlatList } from "react-native";

import { AppThemeProvider } from "@/core/theme/theme-provider";
import type { ChatMessage } from "@/features/chat/model/chat-message-window";
import {
  ChatMessageList,
  getPinnedBottomFollowOffset,
  resolveListKeyboardDismissMode,
} from "@/features/chat/ui/chat-message-list";
import type { ChatConversation } from "@/features/chat/use-chat-conversation";

jest.mock("expo-router", () => ({
  useFocusEffect: jest.fn(),
  useRouter: () => ({ push: jest.fn() }),
}));
jest.mock("@/features/media/ui/message-attachments-view", () => ({
  MessageAttachmentsView: () => null,
}));
jest.mock("@/features/chat/ui/chat-message-menu", () => ({
  ChatMessageMenu: ({ children }: Readonly<{ children?: ReactNode }>) =>
    children,
}));
jest.mock("react-native-keyboard-controller", () => ({
  KeyboardGestureArea: ({ children }: Readonly<{ children?: ReactNode }>) =>
    children,
  KeyboardState: { CLOSED: 4, CLOSING: 3, OPEN: 2, OPENING: 1, UNKNOWN: 0 },
}));
// A plain RN FlatList with object refs, so the JS reveal's `scrollToOffset`
// lands on `FlatList.prototype`; `useAnimatedReaction`s are captured (latest
// closure per reaction) so the test can run the UI-thread follow by hand.
const mockReactions = new Map<
  string,
  {
    last: unknown;
    prepare: () => unknown;
    react: (value: unknown, previous: unknown) => void;
  }
>();
jest.mock("react-native-reanimated", () => {
  const { FlatList: MockFlatList, View } =
    jest.requireActual<typeof import("react-native")>("react-native");
  const createSharedValue = (initialValue: unknown) => {
    let currentValue = initialValue;
    return {
      get value() {
        return currentValue;
      },
      set value(nextValue: unknown) {
        currentValue = nextValue;
      },
      get: () => currentValue,
      set: (nextValue: unknown) => {
        currentValue = nextValue;
      },
    };
  };
  return {
    __esModule: true,
    default: { FlatList: MockFlatList, View },
    scrollTo: jest.fn(),
    useAnimatedReaction: (
      prepare: () => unknown,
      react: (value: unknown, previous: unknown) => void,
    ) => {
      const key = prepare.toString();
      const existing = mockReactions.get(key);
      mockReactions.set(key, { last: existing?.last ?? null, prepare, react });
    },
    useAnimatedRef: () => ({ current: null }),
    useSharedValue: createSharedValue,
  };
});

/** Runs every captured reaction the way the UI runtime would on a frame. */
function flushUiReactions() {
  for (const reaction of mockReactions.values()) {
    const value = reaction.prepare();
    reaction.react(value, reaction.last);
    reaction.last = value;
  }
}

function message(localId: string, createdAtMs: number): ChatMessage {
  return {
    body: `message ${localId}`,
    clientMsgId: null,
    conversationId: "conversation-1",
    createdAtMs,
    localId,
    senderId: "user-2",
    senderLabel: "민수",
    serverMessageId: `server-${localId}`,
    status: "sent",
  };
}

const conversation = {
  hasMore: false,
  initialPageStatus: "ready",
  items: [message("m1", 1_000), message("m2", 2_000), message("m3", 3_000)],
  loadOlder: jest.fn(async () => undefined),
  olderPageStatus: "idle",
  retryInitialPage: jest.fn(async () => undefined),
} as unknown as ChatConversation;

async function renderList() {
  const screen = await render(
    <AppThemeProvider>
      <ChatMessageList
        conversation={conversation}
        latestMessageRevealTarget="m3"
        onRetryFailedMessage={jest.fn()}
        onShareAttachment={jest.fn()}
      />
    </AppThemeProvider>,
  );
  return screen.getByTestId("chat-message-list");
}

const layout = {
  nativeEvent: { layout: { height: 300, width: 400, x: 0, y: 0 } },
};
const drag = {
  nativeEvent: {
    contentOffset: { x: 0, y: 400 },
    contentSize: { height: 900, width: 400 },
    layoutMeasurement: { height: 300, width: 400 },
  },
};

describe("ChatMessageList bottom pin (device regression: landed short of the latest message)", () => {
  afterEach(() => jest.restoreAllMocks());

  test("the first reveal jumps to the bottom and the UI thread keeps following re-measured rows until the user drags", async () => {
    const scrollToOffset = jest
      .spyOn(FlatList.prototype, "scrollToOffset")
      .mockImplementation(() => undefined);
    const { scrollTo } = jest.requireMock<{ scrollTo: jest.Mock }>(
      "react-native-reanimated",
    );
    const list = await renderList();

    await fireEvent(list, "layout", layout);
    await fireEvent(list, "contentSizeChange", 0, 600);
    expect(scrollToOffset).toHaveBeenLastCalledWith({
      animated: false,
      offset: 300,
    });

    // FlatList replaces estimated heights with measured ones: still pinned.
    await fireEvent(list, "contentSizeChange", 0, 900);
    scrollTo.mockClear();
    flushUiReactions();
    expect(scrollTo).toHaveBeenCalledWith(expect.anything(), 0, 600, false);

    // Reading older messages is never interrupted (E11).
    await fireEvent(list, "scrollBeginDrag", drag);
    await fireEvent(list, "contentSizeChange", 0, 1_000);
    scrollTo.mockClear();
    flushUiReactions();
    expect(scrollTo).not.toHaveBeenCalled();
  });

  test("the follow offset needs a pinned viewport and a changed, measured height", () => {
    const base = {
      contentHeight: 900,
      keyboardOverlap: 0,
      pinned: true,
      previousContentHeight: 600,
      restingViewportHeight: 300,
    };
    expect(getPinnedBottomFollowOffset(base)).toBe(600);
    expect(getPinnedBottomFollowOffset({ ...base, keyboardOverlap: 100 })).toBe(
      700,
    );
    expect(getPinnedBottomFollowOffset({ ...base, pinned: false })).toBeNull();
    expect(
      getPinnedBottomFollowOffset({ ...base, previousContentHeight: 900 }),
    ).toBeNull();
    expect(
      getPinnedBottomFollowOffset({ ...base, restingViewportHeight: 0 }),
    ).toBeNull();
  });
});

describe("ChatMessageList keyboard drag (R4, device regression: dragging the list never moved the iOS keyboard)", () => {
  test("on iOS the list lets a drag pull the keyboard down with the finger", async () => {
    const list = await renderList();
    expect(list.props.keyboardDismissMode).toBe("interactive");
  });

  test("only iOS sets it; Android's KeyboardGestureArea owns the gesture there", () => {
    expect(resolveListKeyboardDismissMode("ios")).toBe("interactive");
    expect(resolveListKeyboardDismissMode("android")).toBeUndefined();
  });
});
