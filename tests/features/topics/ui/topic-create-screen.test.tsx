import { fireEvent, render } from "@testing-library/react-native";
import { AppState } from "react-native";
import { AppThemeProvider } from "@/core/theme/theme-provider";
import { TopicsProvider } from "@/features/topics/model/topics-provider";
import { TopicCreateScreen } from "@/features/topics/ui/topic-create-screen";
import { TopicsApiError } from "@/features/topics/data/topics-api";
import { authorize, topicsHarness } from "../topics-harness";
import { groupId } from "../topics-fixtures";

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
      groupId: "",
      accessLost: false,
      rooms: { status: "ready", items: [] },
    },
    actions: { loadRooms: mockLoadRooms, closeRooms: mockCloseRooms },
    ready: true,
  }),
}));

describe("TopicCreateScreen modal presentation, field, and locked-retry state", () => {
  const previousAppState = AppState.currentState;
  beforeEach(() => {
    jest.clearAllMocks();
    lastStackScreenOptions = undefined;
    AppState.currentState = "active";
  });
  afterEach(() => {
    AppState.currentState = previousAppState;
  });
  async function setup(id: string, f = topicsHarness()) {
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
          <TopicCreateScreen groupId={id} />
        </TopicsProvider>
      </AppThemeProvider>
    );
    const screen = await render(tree);
    return { ...f, screen };
  }

  test("presents as a modal titled 새 주제 with the title field and its helper", async () => {
    const f = await setup(groupId);
    expect(lastStackScreenOptions?.presentation).toBe("modal");
    expect(lastStackScreenOptions?.title).toBe("새 주제");
    expect(f.screen.getByLabelText("주제 제목")).toBeTruthy();
    expect(
      f.screen.getByText(
        "제목으로 주제를 만들고, 자세한 이야기는 만든 뒤 추가합니다.",
      ),
    ).toBeTruthy();
  });

  test("shows guidance text instead of the field while the group scope is not ready", async () => {
    const f = await setup("invalid");
    expect(f.screen.getByText("주제 만들기를 준비하고 있습니다.")).toBeTruthy();
    expect(f.screen.queryByLabelText("주제 제목")).toBeNull();
  });

  test("locked state after an uncertain create shows the retry notice and a same-title retry action", async () => {
    const fixture = topicsHarness();
    fixture.api.createTopic.mockRejectedValueOnce(
      new TopicsApiError(0, "network_unavailable"),
    );
    const f = await setup(groupId, fixture);
    await fireEvent.changeText(f.screen.getByLabelText("주제 제목"), "주제");
    await fireEvent.press(
      f.screen.getByRole("button", { name: "주제 만들기" }),
    );
    expect(
      f.screen.getByText(
        "생성 결과가 불확실합니다. 먼저 같은 제목으로 재시도하세요. 새 시도는 이전 주제가 이미 생성됐는지 확인한 뒤 선택하세요.",
      ),
    ).toBeTruthy();
    expect(
      f.screen.getByRole("button", { name: "같은 주제 생성 재시도" }),
    ).toBeTruthy();
    await fireEvent.press(
      f.screen.getByRole("button", { name: "이전 결과 확인 후 새 시도" }),
    );
    expect(f.screen.getByLabelText("주제 제목").props.value).toBe("");
  });
});
