import { fireEvent, render } from "@testing-library/react-native";
import { AppState } from "react-native";
import { AppThemeProvider } from "@/core/theme/theme-provider";
import { TopicsProvider } from "@/features/topics/model/topics-provider";
import { TopicDetailScreen } from "@/features/topics/ui/topic-detail-screen";
import { authorize, topicsHarness } from "../topics-harness";
import { groupId, topicId, otherId } from "../topics-fixtures";

// T5b owns the upload button/media grid markup; isolate this file from its
// later restyling by consuming stub components with matching export names.
jest.mock("@/features/media/ui/topic-image-upload-button", () => ({
  TopicImageUploadButton: () => null,
}));
jest.mock("@/features/media/ui/topic-media-list", () => ({
  TopicMediaList: () => null,
}));

const mockPush = jest.fn();
const mockReplace = jest.fn();
const mockLoadRooms = jest.fn().mockResolvedValue(undefined);
const mockCloseRooms = jest.fn();
let lastStackScreenOptions: Record<string, unknown> | undefined;
jest.mock("expo-router", () => ({
  Stack: {
    Screen: (props: {
      options?: Record<string, unknown> & { headerRight?: () => unknown };
    }) => {
      lastStackScreenOptions = props.options;
      return props.options?.headerRight ? props.options.headerRight() : null;
    },
  },
  useLocalSearchParams: () => ({}),
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
      rooms: { status: "ready", items: [] },
    },
    actions: { loadRooms: mockLoadRooms, closeRooms: mockCloseRooms },
    ready: true,
  }),
}));

// Neither the topic author nor the group owner from `topicsHarness`.
const strangerId = "77777777-7777-4777-8777-777777777777";

describe("TopicDetailScreen edit menu, sheet items, and inline editors", () => {
  const previousAppState = AppState.currentState;
  beforeEach(() => {
    jest.clearAllMocks();
    lastStackScreenOptions = undefined;
    AppState.currentState = "active";
  });
  afterEach(() => {
    AppState.currentState = previousAppState;
  });
  async function setup(f = topicsHarness()) {
    const tree = (
      <AppThemeProvider>
        <TopicsProvider
          principal={f.principal}
          repository={f.repository}
          authorize={authorize}
          watchGroup={f.watchGroup}
          subscribeSync={f.subscribeSync}
          createStore={f.createStore}
        >
          <TopicDetailScreen groupId={groupId} topicId={topicId} />
        </TopicsProvider>
      </AppThemeProvider>
    );
    const screen = await render(tree);
    return { ...f, screen };
  }

  test("sets the native header title and shows title, author, body, and a tag chip", async () => {
    const f = await setup();
    expect(lastStackScreenOptions?.title).toBe("주제");
    expect(f.screen.getByText("오늘 이야기")).toBeTruthy();
    expect(f.screen.getByText("작성자 작성자")).toBeTruthy();
    expect(f.screen.getByText("#여행")).toBeTruthy();
  });

  test("hides the edit menu icon entirely for a viewer with neither edit nor tag permission", async () => {
    const f = topicsHarness();
    f.principal.userId = strangerId;
    await setup(f);
    expect(lastStackScreenOptions?.headerRight).toBeUndefined();
  });

  test("author sees both sheet items; picking title/body opens the body editor and cancel closes it", async () => {
    const f = await setup();
    expect(typeof lastStackScreenOptions?.headerRight).toBe("function");
    await fireEvent.press(
      f.screen.getByRole("button", { name: "주제 편집 메뉴" }),
    );
    expect(
      f.screen.getByRole("button", { name: "제목·본문 편집" }),
    ).toBeTruthy();
    expect(f.screen.getByRole("button", { name: "태그 편집" })).toBeTruthy();
    await fireEvent.press(
      f.screen.getByRole("button", { name: "제목·본문 편집" }),
    );
    expect(f.screen.getByLabelText("주제 제목 수정")).toBeTruthy();
    expect(f.screen.getByLabelText("주제 본문")).toBeTruthy();
    await fireEvent.press(f.screen.getByRole("button", { name: "편집 취소" }));
    expect(f.screen.queryByLabelText("주제 본문")).toBeNull();
  });

  test("group owner without authorship sees only the tag sheet item", async () => {
    const fixture = topicsHarness();
    fixture.principal.userId = otherId;
    const f = await setup(fixture);
    await fireEvent.press(
      f.screen.getByRole("button", { name: "주제 편집 메뉴" }),
    );
    expect(
      f.screen.queryByRole("button", { name: "제목·본문 편집" }),
    ).toBeNull();
    await fireEvent.press(f.screen.getByRole("button", { name: "태그 편집" }));
    expect(f.screen.getByLabelText("새 태그")).toBeTruthy();
    await fireEvent.press(
      f.screen.getByRole("button", { name: "태그 편집 취소" }),
    );
    expect(f.screen.queryByLabelText("새 태그")).toBeNull();
  });

  test("saving an edited body shows a success notice", async () => {
    const f = await setup();
    await fireEvent.press(
      f.screen.getByRole("button", { name: "주제 편집 메뉴" }),
    );
    await fireEvent.press(
      f.screen.getByRole("button", { name: "제목·본문 편집" }),
    );
    await fireEvent.changeText(
      f.screen.getByLabelText("주제 본문"),
      "새로운 본문",
    );
    await fireEvent.press(
      f.screen.getByRole("button", { name: "제목·본문 저장" }),
    );
    expect(f.screen.getByText("저장했습니다.")).toBeTruthy();
  });
});
