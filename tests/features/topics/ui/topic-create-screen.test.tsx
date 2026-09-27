import { fireEvent, render, waitFor } from "@testing-library/react-native";
import { AppState } from "react-native";
import { AppThemeProvider } from "@/core/theme/theme-provider";
import { TopicsProvider } from "@/features/topics/model/topics-provider";
import { TopicCreateScreen } from "@/features/topics/ui/topic-create-screen";
import { TopicsApiError } from "@/features/topics/data/topics-api";
import { authorize, topicsHarness } from "../topics-harness";
import { groupId } from "../topics-fixtures";

const mockPush = jest.fn();
const mockReplace = jest.fn();
const mockBack = jest.fn();
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
  useRouter: () => ({ back: mockBack, push: mockPush, replace: mockReplace }),
  useFocusEffect: (callback: () => void | (() => void)) => {
    const React = jest.requireActual<typeof import("react")>("react");
    React.useEffect(callback, [callback]);
  },
}));
// C3 shell stand-in; the shell's own rendering is native-input-shell.test.tsx.
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

describe("TopicCreateScreen (T7, C3 one-line input)", () => {
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
  async function failFirstCreate() {
    let keys = 0;
    const fixture = topicsHarness({ newKey: () => `key-${++keys}` });
    fixture.api.createTopic.mockRejectedValueOnce(
      new TopicsApiError(0, "network_unavailable"),
    );
    const f = await setup(groupId, fixture);
    await fireEvent.changeText(f.screen.getByLabelText("주제 제목"), "주제");
    await fireEvent.press(f.screen.getByRole("button", { name: "만들기" }));
    return f;
  }

  test("presents as a modal 새 주제 shell with the title field, its helper and ✕ closing it", async () => {
    const f = await setup(groupId);
    expect(lastStackScreenOptions?.presentation).toBe("modal");
    expect(f.screen.getByRole("header", { name: "새 주제" })).toBeTruthy();
    expect(f.screen.getByLabelText("주제 제목")).toBeTruthy();
    expect(
      f.screen.getByText(
        "제목으로 주제를 만들고, 자세한 이야기는 만든 뒤 추가합니다.",
      ),
    ).toBeTruthy();
    await fireEvent.press(f.screen.getByRole("button", { name: "취소" }));
    expect(mockBack).toHaveBeenCalledTimes(1);
  });

  test("keeps 만들기 disabled with guidance while the group scope is not ready", async () => {
    const f = await setup("invalid");
    expect(f.screen.getByText("주제 만들기를 준비하고 있습니다.")).toBeTruthy();
    expect(
      f.screen.getByRole("button", { name: "만들기" }).props.accessibilityState
        .disabled,
    ).toBe(true);
  });

  test("replaces the modal with the created topic chatroom", async () => {
    const f = await setup(groupId);
    await fireEvent.changeText(f.screen.getByLabelText("주제 제목"), "새 주제");
    await fireEvent.press(f.screen.getByRole("button", { name: "만들기" }));
    await waitFor(() => {
      expect(mockReplace).toHaveBeenCalledWith({
        pathname: "/groups/[groupId]/chatrooms/[chatroomId]",
        params: { groupId, chatroomId: f.topic.chatroomId },
      });
    });
  });

  test("an uncertain create keeps the title and 재시도 resends it under the same key", async () => {
    const f = await failFirstCreate();
    expect(
      f.screen.getByText(
        "생성 결과가 불확실합니다. 같은 제목으로 재시도하면 이미 만들어진 주제를 중복 없이 확인합니다. 제목을 바꿔 만들면 새 주제로 시도하니 이전 주제가 만들어졌는지 먼저 확인하세요.",
      ),
    ).toBeTruthy();
    expect(mockReplace).not.toHaveBeenCalled();
    await fireEvent.press(f.screen.getByRole("button", { name: "재시도" }));
    expect(f.api.createTopic).toHaveBeenCalledTimes(2);
    expect(f.api.createTopic.mock.calls[1]![2]).toEqual(
      f.api.createTopic.mock.calls[0]![2],
    );
  });

  test("an edited title after an uncertain create is an explicit new attempt under a new key", async () => {
    const f = await failFirstCreate();
    await fireEvent.changeText(
      f.screen.getByLabelText("주제 제목"),
      "다른 주제",
    );
    await fireEvent.press(f.screen.getByRole("button", { name: "만들기" }));
    expect(f.api.createTopic).toHaveBeenCalledTimes(2);
    const [first, second] = f.api.createTopic.mock.calls.map(
      (call) => call[2] as { idempotencyKey: string; title: string },
    );
    expect(second!.title).toBe("다른 주제");
    expect(second!.idempotencyKey).not.toBe(first!.idempotencyKey);
  });
});
