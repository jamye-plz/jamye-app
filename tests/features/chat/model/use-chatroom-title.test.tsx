import { renderHook } from "@testing-library/react-native";

import { useChatroomTitle } from "@/features/chat/model/use-chatroom-title";

const groupId = "11111111-1111-4111-8111-111111111111";
const chatroomId = "22222222-2222-4222-8222-222222222222";
const topicId = "33333333-3333-4333-8333-333333333333";

let mockChat: {
  ready: boolean;
  state: {
    groupId: string | null;
    rooms: { status: string; items: readonly unknown[] };
  };
  actions: { loadRooms: jest.Mock };
};
let mockTopics: {
  ready: boolean;
  state: {
    detail: {
      id: string | null;
      status: string;
      topic: { title: string } | null;
    };
  };
  store: { actions: { openTopic: jest.Mock } } | null;
};
let mockGroupName: string | null;

jest.mock("@/features/chat/model/connected-chat-provider", () => ({
  useConnectedChat: () => mockChat,
}));
jest.mock("@/features/topics/model/topics-provider", () => ({
  useTopics: () => mockTopics,
}));
jest.mock("@/features/groups/model/groups-provider", () => ({
  useGroupName: () => mockGroupName,
}));

beforeEach(() => {
  mockChat = {
    actions: { loadRooms: jest.fn().mockResolvedValue(undefined) },
    ready: true,
    state: { groupId: null, rooms: { items: [], status: "idle" } },
  };
  mockTopics = {
    ready: true,
    state: { detail: { id: null, status: "idle", topic: null } },
    store: { actions: { openTopic: jest.fn().mockResolvedValue(undefined) } },
  };
  mockGroupName = "우리 그룹";
});

describe("useChatroomTitle (D7/E4/E11)", () => {
  test("requests the group's rooms itself instead of trusting a stale/cleared rooms slice", async () => {
    await renderHook(() => useChatroomTitle(groupId, chatroomId));
    expect(mockChat.actions.loadRooms).toHaveBeenCalledWith(groupId);
  });

  test("unresolved (neutral title, no tap target data) while the room is not yet found", async () => {
    const { result } = await renderHook(() =>
      useChatroomTitle(groupId, chatroomId),
    );
    expect(result.current).toEqual({
      kind: "unresolved",
      targetTopicId: null,
      title: "대화",
    });
  });

  test("does not re-request rooms once this group's rooms are already loading/loaded", async () => {
    mockChat.state = {
      groupId,
      rooms: { items: [], status: "ready" },
    };
    await renderHook(() => useChatroomTitle(groupId, chatroomId));
    expect(mockChat.actions.loadRooms).not.toHaveBeenCalled();
  });

  test("main room resolves to the group name and no topic id (E4 main_room)", async () => {
    mockChat.state = {
      groupId,
      rooms: {
        items: [{ chatroomId, kind: "main", topicId: null }],
        status: "ready",
      },
    };
    const { result } = await renderHook(() =>
      useChatroomTitle(groupId, chatroomId),
    );
    expect(result.current).toEqual({
      kind: "main",
      targetTopicId: null,
      title: "우리 그룹",
    });
  });

  test("topic room stays unresolved until the topic is loaded, but opens it in the shared topics store (주제 조회)", async () => {
    mockChat.state = {
      groupId,
      rooms: {
        items: [{ chatroomId, kind: "topic", topicId }],
        status: "ready",
      },
    };
    const { result } = await renderHook(() =>
      useChatroomTitle(groupId, chatroomId),
    );
    expect(result.current).toEqual({
      kind: "unresolved",
      targetTopicId: null,
      title: "대화",
    });
    expect(mockTopics.store!.actions.openTopic).toHaveBeenCalledWith(
      groupId,
      topicId,
    );
  });

  test("reopens the topic when a blur elsewhere hands a cancelled load back to idle", async () => {
    mockChat.state = {
      groupId,
      rooms: {
        items: [{ chatroomId, kind: "topic", topicId }],
        status: "ready",
      },
    };
    mockTopics.state = {
      detail: { id: topicId, status: "loading", topic: null },
    };
    const { rerender } = await renderHook(() =>
      useChatroomTitle(groupId, chatroomId),
    );
    expect(mockTopics.store!.actions.openTopic).not.toHaveBeenCalled();
    // The group home's blur aborted the read (topics-store `interrupt`).
    mockTopics.state = { detail: { id: topicId, status: "idle", topic: null } };
    await rerender({});
    expect(mockTopics.store!.actions.openTopic).toHaveBeenCalledWith(
      groupId,
      topicId,
    );
  });

  test("topic room resolves once the shared topics store has it ready (E4 topic_room)", async () => {
    mockChat.state = {
      groupId,
      rooms: {
        items: [{ chatroomId, kind: "topic", topicId }],
        status: "ready",
      },
    };
    mockTopics.state = {
      detail: { id: topicId, status: "ready", topic: { title: "주제 제목" } },
    };
    const { result } = await renderHook(() =>
      useChatroomTitle(groupId, chatroomId),
    );
    expect(result.current).toEqual({
      kind: "topic",
      targetTopicId: topicId,
      title: "주제 제목",
    });
    expect(mockTopics.store!.actions.openTopic).not.toHaveBeenCalled();
  });
});
