import { act, fireEvent, render } from "@testing-library/react-native";
import type { ReactNode } from "react";
import { AppState } from "react-native";
import { AppThemeProvider } from "@/core/theme/theme-provider";
import { TopicsProvider } from "@/features/topics/model/topics-provider";
import { TopicsScreen } from "@/features/topics/ui/topics-screen";
import { TopicCreateScreen } from "@/features/topics/ui/topic-create-screen";
import { TopicDetailScreen } from "@/features/topics/ui/topic-detail-screen";
import { TopicsApiError } from "@/features/topics/data/topics-api";
import { authorize, topicsHarness } from "../topics-harness";
import { groupId, topicId, roomId, otherId } from "../topics-fixtures";
import TopicCreateRoute from "@/app/groups/[groupId]/topics/new";
import TopicDetailRoute from "@/app/groups/[groupId]/topics/[topicId]";

// Native photo gestures are exercised by the focused viewer tests.
jest.mock("@/features/media/ui/media-image-viewer", () => ({
  MediaImageViewer: () => null,
}));

const mockPush = jest.fn();
const mockReplace = jest.fn();
const mockCloseRooms = jest.fn();
const mockLoadRooms = jest.fn().mockResolvedValue(undefined);
let mockParams: Record<string, string | string[]> = {};
jest.mock("expo-router", () => ({
  useLocalSearchParams: () => mockParams,
  useRouter: () => ({ push: mockPush, replace: mockReplace }),
  useFocusEffect: (callback: () => void | (() => void)) => {
    const React = jest.requireActual<typeof import("react")>("react");
    React.useEffect(callback, [callback]);
  },
}));
jest.mock("@/core/config/public-env", () => ({
  getPublicEnv: () => ({ appMode: "connected-auth" }),
}));
jest.mock("@/core/providers/session-provider", () => ({
  useSession: () => ({
    principal: { userId: "44444444-4444-4444-8444-444444444444" },
  }),
}));
jest.mock("@/core/providers/app-providers", () => ({
  useAccountScope: () => ({ state: { status: "ready" }, retry: jest.fn() }),
}));
jest.mock("@/features/chat/model/connected-chat-provider", () => ({
  useConnectedChat: () => ({
    state: {
      groupId: "11111111-1111-4111-8111-111111111111",
      accessLost: false,
      rooms: {
        status: "ready",
        items: [
          { kind: "main", chatroomId: "55555555-5555-4555-8555-555555555555" },
        ],
      },
    },
    actions: { loadRooms: mockLoadRooms, closeRooms: mockCloseRooms },
    ready: true,
  }),
}));

describe("M10 topic views with real controller and fake API", () => {
  const previousAppState = AppState.currentState;
  beforeEach(() => {
    jest.clearAllMocks();
    mockParams = { groupId, topicId };
    AppState.currentState = "active";
  });
  afterEach(() => {
    AppState.currentState = previousAppState;
  });
  async function setup(child: ReactNode, f = topicsHarness()) {
    const tree = (principal = f.principal) => (
      <AppThemeProvider>
        <TopicsProvider
          principal={principal}
          repository={f.repository}
          authorize={authorize}
          watchGroup={f.watchGroup}
          subscribeSync={f.subscribeSync}
          createStore={f.createStore}
        >
          {child}
        </TopicsProvider>
      </AppThemeProvider>
    );
    const screen = await render(tree());
    return { ...f, screen, tree };
  }
  test("list preserves basic topic, uses display titles and never introduces unread badges", async () => {
    const f = await setup(<TopicsScreen groupId={groupId} />);
    expect(f.screen.getByText("오늘 이야기")).toBeTruthy();
    expect(f.screen.queryByText(topicId)).toBeNull();
    expect(f.screen.queryByText(/안읽음|읽지 않은/)).toBeNull();
    await fireEvent.press(
      f.screen.getByRole("button", { name: "기본 주제 대화" }),
    );
    expect(mockPush).toHaveBeenLastCalledWith({
      pathname: "/groups/[groupId]/chatrooms/[chatroomId]",
      params: { groupId, chatroomId: otherId },
    });
    await fireEvent.press(
      f.screen.getByRole("button", { name: "주제 오늘 이야기, 작성자 작성자" }),
    );
    expect(mockPush).toHaveBeenLastCalledWith({
      pathname: "/groups/[groupId]/topics/[topicId]",
      params: { groupId, topicId },
    });
    await fireEvent.press(f.screen.getByRole("button", { name: "2026-09-11" }));
    expect(f.api.listTopics).toHaveBeenLastCalledWith(
      "test-token",
      groupId,
      { date: "2026-09-11", limit: 20 },
      expect.anything(),
    );
  });
  test("create only submits explicitly and opens the returned canonical topic", async () => {
    const f = await setup(<TopicCreateScreen groupId={groupId} />);
    await fireEvent.changeText(
      f.screen.getByLabelText("주제 제목"),
      "우리의 새 주제",
    );
    await fireEvent(f.screen.getByLabelText("주제 제목"), "submitEditing");
    expect(f.api.createTopic).not.toHaveBeenCalled();
    await fireEvent.press(
      f.screen.getByRole("button", { name: "주제 만들기" }),
    );
    expect(f.api.createTopic).toHaveBeenCalledTimes(1);
    expect(mockReplace).toHaveBeenCalledWith({
      pathname: "/groups/[groupId]/topics/[topicId]",
      params: { groupId, topicId },
    });
  });
  test("uncertain creation locks the same title and retries with the same key", async () => {
    const fixture = topicsHarness();
    fixture.api.createTopic.mockRejectedValueOnce(
      new TopicsApiError(0, "network_unavailable"),
    );
    const f = await setup(<TopicCreateScreen groupId={groupId} />, fixture);
    await fireEvent.changeText(f.screen.getByLabelText("주제 제목"), "주제");
    await fireEvent.press(
      f.screen.getByRole("button", { name: "주제 만들기" }),
    );
    expect(f.screen.getByLabelText("주제 제목").props.value).toBe("주제");
    expect(f.screen.getByLabelText("주제 제목").props.editable).toBe(false);
    expect(mockReplace).not.toHaveBeenCalled();
    await fireEvent.press(
      f.screen.getByRole("button", { name: "같은 주제 생성 재시도" }),
    );
    expect(f.api.createTopic.mock.calls[1]![2]).toEqual(
      f.api.createTopic.mock.calls[0]![2],
    );
  });
  test("detail opens existing conversation and explicit multiline save retains Korean newlines", async () => {
    const f = await setup(
      <TopicDetailScreen groupId={groupId} topicId={topicId} />,
    );
    await fireEvent.press(
      f.screen.getByRole("button", { name: "이 주제에서 대화하기" }),
    );
    expect(mockPush).toHaveBeenCalledWith({
      pathname: "/groups/[groupId]/chatrooms/[chatroomId]",
      params: { groupId, chatroomId: roomId },
    });
    await fireEvent.press(
      f.screen.getByRole("button", { name: "제목·본문 편집" }),
    );
    await fireEvent.changeText(
      f.screen.getByLabelText("주제 본문"),
      "첫 줄\n둘째 줄",
    );
    await fireEvent(f.screen.getByLabelText("주제 본문"), "submitEditing");
    expect(f.api.updateTopic).not.toHaveBeenCalled();
    await fireEvent.press(
      f.screen.getByRole("button", { name: "제목·본문 저장" }),
    );
    expect(f.api.updateTopic).toHaveBeenCalledWith(
      "test-token",
      groupId,
      topicId,
      { body: "첫 줄\n둘째 줄" },
      expect.anything(),
    );
  });
  test("body deletion is not offered and emptying an existing body disables save", async () => {
    const f = topicsHarness();
    f.api.getTopic.mockResolvedValue({ ...f.topic, body: "유지할 본문" });
    const { screen } = await setup(
      <TopicDetailScreen groupId={groupId} topicId={topicId} />,
      f,
    );
    await fireEvent.press(
      screen.getByRole("button", { name: "제목·본문 편집" }),
    );
    await fireEvent.changeText(screen.getByLabelText("주제 본문"), "");
    expect(
      screen.getByRole("button", { name: "제목·본문 저장" }).props
        .accessibilityState.disabled,
    ).toBe(true);
    expect(screen.queryByRole("button", { name: "주제 삭제" })).toBeNull();
  });
  test("tag editor preserves existing metadata and adds only user-authored tags", async () => {
    const f = await setup(
      <TopicDetailScreen groupId={groupId} topicId={topicId} />,
    );
    await fireEvent.press(f.screen.getByRole("button", { name: "태그 편집" }));
    await fireEvent.changeText(f.screen.getByLabelText("새 태그"), " 새 태그 ");
    await fireEvent.press(f.screen.getByRole("button", { name: "태그 추가" }));
    await fireEvent.press(
      f.screen.getByRole("button", { name: "태그 전체 저장" }),
    );
    expect(f.api.replaceTags).toHaveBeenCalledWith(
      "test-token",
      groupId,
      topicId,
      [
        { tag: "여행", source: "user", confidence: null },
        { tag: "새 태그", source: "user", confidence: null },
      ],
      expect.anything(),
    );
  });
  test("group owner can manage tags, not another author's body", async () => {
    const f = topicsHarness();
    f.principal.userId = otherId;
    const { screen } = await setup(
      <TopicDetailScreen groupId={groupId} topicId={topicId} />,
      f,
    );
    expect(screen.queryByRole("button", { name: "제목·본문 편집" })).toBeNull();
    expect(screen.getByRole("button", { name: "태그 편집" })).toBeTruthy();
  });
  test("changing account removes the previous form input", async () => {
    const f = await setup(<TopicCreateScreen groupId={groupId} />);
    await fireEvent.changeText(
      f.screen.getByLabelText("주제 제목"),
      "이전 계정 초안",
    );
    await f.screen.rerender(
      f.tree({ ...f.principal, userId: otherId, epoch: 2 }),
    );
    expect(f.screen.getByLabelText("주제 제목").props.value).toBe("");
  });
  test("permission loss hides topic, tags and edit draft", async () => {
    const f = await setup(
      <TopicDetailScreen groupId={groupId} topicId={topicId} />,
    );
    await fireEvent.press(
      f.screen.getByRole("button", { name: "제목·본문 편집" }),
    );
    await fireEvent.changeText(
      f.screen.getByLabelText("주제 본문"),
      "숨겨야 할 초안",
    );
    await act(() => f.stores[0]!.actions.revoke());
    expect(f.screen.queryByLabelText("주제 본문")).toBeNull();
    expect(f.screen.queryByText("오늘 이야기")).toBeNull();
    expect(
      f.screen.queryByRole("button", { name: "이 주제에서 대화하기" }),
    ).toBeNull();
  });
  test("new and detail routes forward scalar params to the real topic screens", async () => {
    const create = await setup(<TopicCreateRoute />);
    expect(create.screen.getByLabelText("주제 제목")).toBeTruthy();
    expect(create.api.listTopics).toHaveBeenCalledWith(
      "test-token",
      groupId,
      { limit: 20 },
      expect.anything(),
    );
    await create.screen.unmount();
    const detail = await setup(<TopicDetailRoute />);
    expect(detail.screen.getByText("오늘 이야기")).toBeTruthy();
    expect(detail.api.getTopic).toHaveBeenCalledWith(
      "test-token",
      groupId,
      topicId,
      expect.anything(),
    );
  });
  test("new routes reject array params before any topic request", async () => {
    mockParams = { groupId: [groupId], topicId: [topicId] };
    const create = await setup(<TopicCreateRoute />);
    expect(create.api.listTopics).not.toHaveBeenCalled();
    await create.screen.unmount();
    const detail = await setup(<TopicDetailRoute />);
    expect(detail.api.getTopic).not.toHaveBeenCalled();
    expect(
      detail.screen.getByText("올바르지 않은 주제 주소입니다."),
    ).toBeTruthy();
  });
  test("invalid IDs never trigger requests", async () => {
    const f = await setup(<TopicsScreen groupId="invalid" />);
    expect(f.api.listTopics).not.toHaveBeenCalled();
    expect(f.screen.getByText("올바르지 않은 주제 주소입니다.")).toBeTruthy();
  });
});
