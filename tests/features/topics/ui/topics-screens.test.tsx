import { act, fireEvent, render, within } from "@testing-library/react-native";
import type { ReactNode } from "react";
import { AppState } from "react-native";
import { AppThemeProvider } from "@/core/theme/theme-provider";
import { TopicsProvider } from "@/features/topics/model/topics-provider";
import { TopicsScreen } from "@/features/topics/ui/topics-screen";
import { TopicCreateScreen } from "@/features/topics/ui/topic-create-screen";
import { TopicDetailScreen } from "@/features/topics/ui/topic-detail-screen";
import { TopicsApiError } from "@/features/topics/data/topics-api";
import type { TopicListProps } from "@/features/topics/ui/topic-list.types";
import type { TopicDateChipsProps } from "@/features/topics/ui/topic-date-chips.types";
import type { TopicEditFormProps } from "@/features/topics/ui/topic-edit-form.types";
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
// The real Stack.Screen renders `options.headerRight` into the native header;
// this stand-in renders it inline instead so `headerRight`-gated controls
// stay reachable through RNTL role queries.
jest.mock("expo-router", () => ({
  Stack: {
    Screen: (props: {
      options?: {
        headerRight?: () => ReactNode;
        headerTitle?: string | (() => ReactNode);
      };
    }) => {
      const { headerRight, headerTitle } = props.options ?? {};
      return (
        <>
          {typeof headerTitle === "function" ? headerTitle() : null}
          {headerRight ? headerRight() : null}
        </>
      );
    },
    ...jest
      .requireActual<typeof import("../../../support/stack-toolbar-mock")>(
        "../../../support/stack-toolbar-mock",
      )
      .createStackToolbarMock(),
  },
  useLocalSearchParams: () => mockParams,
  // M17/U13: topic detail reads the root stack; none is mounted here.
  useNavigation: () => ({ getState: () => undefined, reset: jest.fn() }),
  useRouter: () => ({ push: mockPush, replace: mockReplace }),
  useFocusEffect: (callback: () => void | (() => void)) => {
    const React = jest.requireActual<typeof import("react")>("react");
    React.useEffect(callback, [callback]);
  },
}));
jest.mock("@/shared/ui/native-input-sheet", () => ({
  NativeInputSheet: jest.requireActual<
    typeof import("../../../support/native-input-shell-mock")
  >("../../../support/native-input-shell-mock").NativeInputShellMock,
}));
jest.mock("@/shared/ui/native-input-dialog", () => ({
  NativeInputDialog: jest.requireActual<
    typeof import("../../../support/native-input-shell-mock")
  >("../../../support/native-input-shell-mock").NativeInputShellMock,
}));
jest.mock("@/features/groups/model/groups-provider", () => ({
  useGroupName: () => "우리 그룹",
}));
// The platform topic list (SwiftUI on iOS, Compose on Android) has its own
// tests (topic-list.test.tsx); this stand-in keeps rows reachable as plain
// buttons and exposes the auto-load sentinel as a button too.
jest.mock("@/features/topics/ui/topic-list", () => {
  const { Pressable, Text, View } =
    jest.requireActual<typeof import("react-native")>("react-native");
  function TopicList(props: TopicListProps) {
    return (
      <View>
        {props.topics.map((topic) => (
          <Pressable
            accessibilityLabel={`주제 ${topic.title}, 작성자 ${topic.authorNickname}`}
            accessibilityRole="button"
            key={topic.id}
            onPress={() => props.onOpenChat(topic)}
          >
            <Text>{topic.title}</Text>
          </Pressable>
        ))}
        {props.loadMore ? (
          <Pressable
            accessibilityLabel="주제 더 보기"
            accessibilityRole="button"
            onPress={props.loadMore.onVisible}
          >
            <Text>더 보기</Text>
          </Pressable>
        ) : null}
      </View>
    );
  }
  return { TopicList };
});
// The platform date dial (SwiftUI ScrollView on iOS, jamye-ui on Android)
// has its own tests; this stand-in exposes each date as a plain button using
// the real (already-tested) label/order model helpers.
jest.mock("@/features/topics/ui/topic-date-chips", () => {
  const { Pressable, Text, View } =
    jest.requireActual<typeof import("react-native")>("react-native");
  const { dialDates, topicDateLabel } = jest.requireActual<
    typeof import("../../../../src/features/topics/model/topics-dates")
  >("../../../../src/features/topics/model/topics-dates");
  function TopicDateChips({
    dates,
    onSelect,
    selected,
    testID,
    today,
  }: TopicDateChipsProps) {
    const items = dialDates(dates, today, selected);
    return (
      <View testID={testID}>
        {items.map((date) => (
          <Pressable
            accessibilityLabel={`${topicDateLabel(date, today)} 선택`}
            accessibilityRole="button"
            accessibilityState={{ selected: date === selected }}
            key={date}
            onPress={() => onSelect(date)}
          >
            <Text>{topicDateLabel(date, today)}</Text>
          </Pressable>
        ))}
      </View>
    );
  }
  return { TopicDateChips };
});
// C1's StandardStateView has its own tests; this stand-in renders the
// title/description/action set as plain text and buttons.
jest.mock("@/shared/ui/standard-state-view", () => {
  const { Pressable, Text, View } =
    jest.requireActual<typeof import("react-native")>("react-native");
  function StandardStateView(props: {
    kind: string;
    testID?: string;
    title?: string;
    description?: string;
    actions?: readonly { label: string; onPress: () => void }[];
  }) {
    if (props.kind === "loading")
      return (
        <View testID={props.testID}>
          <Text>불러오는 중…</Text>
        </View>
      );
    return (
      <View testID={props.testID}>
        <Text>{props.title}</Text>
        {props.description ? <Text>{props.description}</Text> : null}
        {(props.actions ?? []).map((action) => (
          <Pressable
            accessibilityLabel={action.label}
            accessibilityRole="button"
            key={action.label}
            onPress={action.onPress}
          >
            <Text>{action.label}</Text>
          </Pressable>
        ))}
      </View>
    );
  }
  return { StandardStateView };
});
// D2's integrated edit form has its own tests; this stand-in exposes plain
// TextInputs (same accessibility labels the old inline editors used) and
// mirrors the real hook's dirty/valid gating closely enough for these tests.
jest.mock("@/features/topics/ui/topic-edit-form", () => {
  const React = jest.requireActual<typeof import("react")>("react");
  const { TextInput, View, Text, Pressable } =
    jest.requireActual<typeof import("react-native")>("react-native");
  const TopicEditForm = React.forwardRef(function TopicEditForm(
    props: TopicEditFormProps,
    ref: React.Ref<{ submit: () => void }>,
  ) {
    const [title, setTitle] = React.useState(props.topic.title);
    const [body, setBody] = React.useState(props.topic.body ?? "");
    const [tags, setTags] = React.useState(props.tags.map((tag) => tag.tag));
    const [newTag, setNewTag] = React.useState("");
    const originalTags = props.tags.map((tag) => tag.tag);
    const titleChanged = props.canEditBody && title !== props.topic.title;
    const bodyChanged =
      props.canEditBody && body !== (props.topic.body ?? "") && body.length > 0;
    const tagsChanged =
      props.canEditTags &&
      JSON.stringify([...tags].sort()) !==
        JSON.stringify([...originalTags].sort());
    const canSave =
      (titleChanged || bodyChanged || tagsChanged) &&
      newTag.trim().length === 0;
    React.useEffect(() => {
      props.onValidityChange(canSave);
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [canSave]);
    React.useImperativeHandle(ref, () => ({
      submit: () => {
        if (!canSave) return;
        props.onSave({
          patch:
            titleChanged || bodyChanged
              ? {
                  ...(titleChanged ? { title } : {}),
                  ...(bodyChanged ? { body } : {}),
                }
              : null,
          tags: tagsChanged
            ? tags.map((tag) => ({
                confidence: null,
                source: "user" as const,
                tag,
              }))
            : null,
        });
      },
    }));
    return (
      <View>
        {props.canEditBody ? (
          <>
            <TextInput
              accessibilityLabel="주제 제목"
              onChangeText={setTitle}
              value={title}
            />
            <TextInput
              accessibilityLabel="주제 본문"
              onChangeText={setBody}
              value={body}
            />
          </>
        ) : null}
        {props.canEditTags ? (
          <>
            {tags.map((tag) => (
              <Pressable
                accessibilityLabel={`${tag} 태그 제거`}
                accessibilityRole="button"
                key={tag}
                onPress={() =>
                  setTags((current) => current.filter((item) => item !== tag))
                }
              >
                <Text>{tag}</Text>
              </Pressable>
            ))}
            <TextInput
              accessibilityLabel="새 태그"
              onChangeText={setNewTag}
              value={newTag}
            />
            <Pressable
              accessibilityLabel="태그 추가"
              accessibilityRole="button"
              onPress={() => {
                const trimmed = newTag.trim();
                if (!trimmed) return;
                setTags((current) => [...current, trimmed]);
                setNewTag("");
              }}
            >
              <Text>태그 추가</Text>
            </Pressable>
          </>
        ) : null}
        {props.errorText ? <Text>{props.errorText}</Text> : null}
      </View>
    );
  });
  return { TopicEditForm };
});
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

describe("M10/M14 topic views with real controller and fake API", () => {
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
  test("list preserves basic topic, no row action beyond opening the chatroom, and never introduces unread badges", async () => {
    const f = await setup(<TopicsScreen groupId={groupId} />);
    expect(f.screen.getByText("오늘 이야기")).toBeTruthy();
    expect(f.screen.queryByText(topicId)).toBeNull();
    expect(f.screen.queryByText(/안읽음|읽지 않은/)).toBeNull();
    await fireEvent.press(
      f.screen.getByRole("button", { name: "그룹 대화방" }),
    );
    expect(mockPush).toHaveBeenLastCalledWith({
      pathname: "/groups/[groupId]/chatrooms/[chatroomId]",
      params: { groupId, chatroomId: otherId },
    });
    await fireEvent.press(
      f.screen.getByRole("button", { name: "주제 오늘 이야기, 작성자 작성자" }),
    );
    expect(mockPush).toHaveBeenLastCalledWith({
      pathname: "/groups/[groupId]/chatrooms/[chatroomId]",
      params: { groupId, chatroomId: roomId },
    });
    expect(f.screen.queryByText("전체 날짜")).toBeNull();
    expect(f.screen.queryByRole("button", { name: "그룹 정보" })).toBeNull();
    expect(
      within(f.screen.getByTestId("stack-toolbar-right"))
        .getAllByRole("button")
        .map((button) => button.props.accessibilityLabel),
    ).toEqual(["그룹 대화방", "새 주제 만들기"]);
    const titleButton = f.screen.getByRole("button", { name: "우리 그룹" });
    expect(titleButton.props.accessibilityHint).toBe("그룹 정보를 엽니다");
    await fireEvent.press(titleButton);
    expect(mockPush).toHaveBeenLastCalledWith({
      pathname: "/groups/[groupId]/info",
      params: { groupId },
    });
  });
  test("shows the C1 empty state only for a settled date with no topics, with a 새 주제 만들기 entry point", async () => {
    const fixture = topicsHarness();
    fixture.api.listTopics.mockResolvedValue({ items: [], nextCursor: null });
    const f = await setup(<TopicsScreen groupId={groupId} />, fixture);
    expect(f.screen.getByText("선택한 날짜에 주제가 없습니다.")).toBeTruthy();
    // SwiftUI/Compose state views only render inside a Host.
    expect(
      within(f.screen.getByTestId("topics-state-host")).getByTestId(
        "topics-empty",
      ),
    ).toBeTruthy();
    await fireEvent.press(
      within(f.screen.getByTestId("topics-empty")).getByRole("button", {
        name: "새 주제 만들기",
      }),
    );
    expect(mockPush).toHaveBeenCalledWith({
      pathname: "/groups/[groupId]/topics/new",
      params: { groupId },
    });
  });
  test("E6c/C7/GROUPS-AC2: a network failure on first load shows the read-specific copy", async () => {
    const fixture = topicsHarness();
    fixture.api.listTopics.mockRejectedValue(
      new TopicsApiError(0, "network_unavailable"),
    );
    const f = await setup(<TopicsScreen groupId={groupId} />, fixture);
    await f.screen.findByText(
      "주제를 불러오지 못했습니다. 연결을 확인한 뒤 다시 시도해 주세요.",
    );
    expect(f.screen.getByTestId("topics-error")).toBeTruthy();
  });
  test("opens on today (T1 order) and reloads only when a different date is picked", async () => {
    const fixture = topicsHarness();
    fixture.api.listDates.mockResolvedValue({
      today: "2026-09-11",
      dates: ["2026-09-11", "2026-09-10"],
      nextCursor: null,
    });
    const f = await setup(<TopicsScreen groupId={groupId} />, fixture);
    expect(f.api.listTopics).toHaveBeenCalledWith(
      "test-token",
      groupId,
      { date: "2026-09-11", limit: 20 },
      expect.anything(),
    );
    expect(
      f.screen.getByRole("button", { name: "오늘 선택" }).props
        .accessibilityState.selected,
    ).toBe(true);
    expect(f.screen.getByText("어제")).toBeTruthy();
    await fireEvent.press(f.screen.getByRole("button", { name: "어제 선택" }));
    expect(f.api.listTopics).toHaveBeenLastCalledWith(
      "test-token",
      groupId,
      { date: "2026-09-10", limit: 20 },
      expect.anything(),
    );
  });
  test("create only submits explicitly and replaces to the returned topic's own chatroom (T7)", async () => {
    const f = await setup(<TopicCreateScreen groupId={groupId} />);
    await fireEvent.changeText(
      f.screen.getByLabelText("주제 제목"),
      "우리의 새 주제",
    );
    expect(f.api.createTopic).not.toHaveBeenCalled();
    await fireEvent.press(f.screen.getByRole("button", { name: "만들기" }));
    expect(f.api.createTopic).toHaveBeenCalledTimes(1);
    expect(mockReplace).toHaveBeenCalledWith({
      pathname: "/groups/[groupId]/chatrooms/[chatroomId]",
      params: { groupId, chatroomId: roomId },
    });
  });
  test("uncertain creation locks the same title and retries with the same key", async () => {
    const fixture = topicsHarness();
    fixture.api.createTopic.mockRejectedValueOnce(
      new TopicsApiError(0, "network_unavailable"),
    );
    const f = await setup(<TopicCreateScreen groupId={groupId} />, fixture);
    await fireEvent.changeText(f.screen.getByLabelText("주제 제목"), "주제");
    await fireEvent.press(f.screen.getByRole("button", { name: "만들기" }));
    expect(f.screen.getByLabelText("주제 제목").props.value).toBe("주제");
    expect(mockReplace).not.toHaveBeenCalled();
    await fireEvent.press(f.screen.getByRole("button", { name: "재시도" }));
    expect(f.api.createTopic.mock.calls[1]![2]).toEqual(
      f.api.createTopic.mock.calls[0]![2],
    );
  });
  test("detail renders the article (no 이 주제에서 대화하기) and 편집 opens the integrated form", async () => {
    const f = await setup(
      <TopicDetailScreen groupId={groupId} topicId={topicId} />,
    );
    expect(f.screen.getByTestId("topic-article")).toBeTruthy();
    expect(
      f.screen.queryByRole("button", { name: "이 주제에서 대화하기" }),
    ).toBeNull();
    // M15/AC4: 편집 is now a HeaderActions menu item (주제 메뉴), not a
    // standalone button -- opening it is the only thing that changed here.
    await fireEvent.press(f.screen.getByRole("menuitem", { name: "편집" }));
    expect(f.screen.queryByTestId("topic-article")).toBeNull();
    await fireEvent.changeText(
      f.screen.getByLabelText("주제 본문"),
      "첫 줄\n둘째 줄",
    );
    expect(f.api.updateTopic).not.toHaveBeenCalled();
    await fireEvent.press(f.screen.getByRole("button", { name: "저장" }));
    expect(f.api.updateTopic).toHaveBeenCalledWith(
      "test-token",
      groupId,
      topicId,
      { body: "첫 줄\n둘째 줄" },
      expect.anything(),
    );
  });
  test("취소 restores the article view without saving", async () => {
    const f = await setup(
      <TopicDetailScreen groupId={groupId} topicId={topicId} />,
    );
    // M15/AC4: 편집 is now a HeaderActions menu item (주제 메뉴), not a
    // standalone button -- opening it is the only thing that changed here.
    await fireEvent.press(f.screen.getByRole("menuitem", { name: "편집" }));
    await fireEvent.changeText(
      f.screen.getByLabelText("주제 본문"),
      "버릴 초안",
    );
    await fireEvent.press(f.screen.getByRole("button", { name: "취소" }));
    expect(f.api.updateTopic).not.toHaveBeenCalled();
    expect(f.screen.getByTestId("topic-article")).toBeTruthy();
  });
  test("tag editor preserves existing metadata and adds only user-authored tags", async () => {
    const f = await setup(
      <TopicDetailScreen groupId={groupId} topicId={topicId} />,
    );
    // M15/AC4: 편집 is now a HeaderActions menu item (주제 메뉴), not a
    // standalone button -- opening it is the only thing that changed here.
    await fireEvent.press(f.screen.getByRole("menuitem", { name: "편집" }));
    await fireEvent.changeText(f.screen.getByLabelText("새 태그"), " 새 태그 ");
    await fireEvent.press(f.screen.getByRole("button", { name: "태그 추가" }));
    await fireEvent.press(f.screen.getByRole("button", { name: "저장" }));
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
  test("only the author sees 편집: the group owner gets no entry point on another author's topic", async () => {
    const f = topicsHarness();
    f.principal.userId = otherId;
    const { screen } = await setup(
      <TopicDetailScreen groupId={groupId} topicId={topicId} />,
      f,
    );
    await screen.findByTestId("topic-article");
    // M15/AC4/E11: the entry point is now the 주제 메뉴 trigger itself
    // (which holds 편집/삭제); a non-author must see neither.
    expect(screen.queryByRole("button", { name: "주제 메뉴" })).toBeNull();
  });
  test("no permission at all hides the 편집 entry point entirely", async () => {
    const f = topicsHarness();
    f.api.getTopic.mockResolvedValue({
      ...f.topic,
      authorId: otherId,
    });
    f.principal.userId = "99999999-9999-4999-8999-999999999999";
    const { screen } = await setup(
      <TopicDetailScreen groupId={groupId} topicId={topicId} />,
      f,
    );
    await screen.findByTestId("topic-article");
    // M15/AC4/E11: the entry point is now the 주제 메뉴 trigger itself
    // (which holds 편집/삭제); a non-author must see neither.
    expect(screen.queryByRole("button", { name: "주제 메뉴" })).toBeNull();
  });
  test("changing account removes the previous create form input", async () => {
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
  test("permission loss during editing hides the topic and its draft", async () => {
    const f = await setup(
      <TopicDetailScreen groupId={groupId} topicId={topicId} />,
    );
    // M15/AC4: 편집 is now a HeaderActions menu item (주제 메뉴), not a
    // standalone button -- opening it is the only thing that changed here.
    await fireEvent.press(f.screen.getByRole("menuitem", { name: "편집" }));
    await fireEvent.changeText(
      f.screen.getByLabelText("주제 본문"),
      "숨겨야 할 초안",
    );
    await act(() => f.stores[0]!.actions.revoke());
    expect(f.screen.queryByLabelText("주제 본문")).toBeNull();
    expect(f.screen.queryByText("오늘 이야기")).toBeNull();
    expect(f.screen.queryByTestId("topic-article")).toBeNull();
  });
  test("new and detail (root-Stack, D6) routes forward scalar params to the real topic screens", async () => {
    const create = await setup(<TopicCreateRoute />);
    expect(create.screen.getByLabelText("주제 제목")).toBeTruthy();
    expect(create.api.listTopics).toHaveBeenCalledWith(
      "test-token",
      groupId,
      { date: "2026-09-11", limit: 20 },
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
