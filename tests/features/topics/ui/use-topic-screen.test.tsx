import { render } from "@testing-library/react-native";
import { useTopicScreen } from "@/features/topics/ui/use-topic-screen";
import { groupId } from "../topics-fixtures";

// M15 device round r2 follow-up (coordinator round 2, item 3): pins
// use-topic-screen.ts's contract that only a *group-wide* chat access loss
// revokes the topics store -- a room-scoped chat loss (a single topic
// chatroom's own eviction/`membership_required`, connected-chat-store.ts's
// `roomAccessLost`) must never block the whole group's topics. This is a
// deliberately isolated harness (jest.fn() spies, not the real topics
// store/connected chat store) so it cannot destabilize the wider
// topics-screens.test.tsx suite's shared, statically-mocked chat state.

// jest.mock factories may only reference `mock`-prefixed outer variables.
const mockGroupId = groupId;
const mockCloseRooms = jest.fn();
const mockOpenGroup = jest.fn().mockResolvedValue(undefined);
const mockBlur = jest.fn();
const mockRevoke = jest.fn();
let mockChatState: Readonly<{
  groupId: string | null;
  accessLost: boolean;
  roomAccessLost: boolean;
}>;

jest.mock("expo-router", () => ({
  useRouter: () => ({ push: jest.fn(), replace: jest.fn() }),
  useFocusEffect: (callback: () => void | (() => void)) => {
    const React = jest.requireActual<typeof import("react")>("react");
    React.useEffect(callback, [callback]);
  },
}));
jest.mock("@/core/providers/app-providers", () => ({
  useAccountScope: () => ({ state: { status: "ready" }, retry: jest.fn() }),
}));
jest.mock("@/features/chat/model/connected-chat-provider", () => ({
  useConnectedChat: () => ({
    actions: { closeRooms: mockCloseRooms },
    ready: true,
    state: mockChatState,
  }),
}));
jest.mock("@/features/topics/model/topics-provider", () => ({
  useTopics: () => ({
    ready: true,
    state: { accessLost: false, groupId: mockGroupId },
    store: {
      actions: {
        blur: mockBlur,
        openGroup: mockOpenGroup,
        openTopic: jest.fn().mockResolvedValue(undefined),
        revoke: mockRevoke,
      },
      getState: () => ({ accessLost: false, groupId: mockGroupId }),
    },
  }),
}));

function Harness({ groupId: gid }: Readonly<{ groupId: string }>) {
  useTopicScreen(gid);
  return null;
}

describe("useTopicScreen: room-scoped chat loss never revokes, group-wide chat loss always does", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockChatState = { accessLost: false, groupId, roomAccessLost: false };
  });

  test("a room-scoped chat loss (roomAccessLost) does not revoke the topics store", async () => {
    mockChatState = { accessLost: false, groupId, roomAccessLost: true };
    await render(<Harness groupId={groupId} />);
    expect(mockRevoke).not.toHaveBeenCalled();
  });

  test("a group-wide chat loss (accessLost) revokes the topics store", async () => {
    mockChatState = { accessLost: true, groupId, roomAccessLost: false };
    await render(<Harness groupId={groupId} />);
    expect(mockRevoke).toHaveBeenCalledTimes(1);
  });

  test("no chat loss at all does not revoke the topics store", async () => {
    await render(<Harness groupId={groupId} />);
    expect(mockRevoke).not.toHaveBeenCalled();
  });
});
