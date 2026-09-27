import { fireEvent, render } from "@testing-library/react-native";
import { AppState } from "react-native";
import { AppThemeProvider } from "@/core/theme/theme-provider";
import { TopicsProvider } from "@/features/topics/model/topics-provider";
import { TopicDetailScreen } from "@/features/topics/ui/topic-detail-screen";
import { authorize, topicsHarness } from "../topics-harness";
import { groupId, topicId } from "../topics-fixtures";

let lastStackScreenOptions: Record<string, unknown> | undefined;
const mockLoadRooms = jest.fn().mockResolvedValue(undefined);
const mockCloseRooms = jest.fn();
jest.mock("expo-router", () => ({
  Stack: {
    Screen: (props: { options?: Record<string, unknown> }) => {
      lastStackScreenOptions = props.options;
      return null;
    },
    ...jest
      .requireActual<typeof import("../../../support/stack-toolbar-mock")>(
        "../../../support/stack-toolbar-mock",
      )
      .createStackToolbarMock(),
  },
  useLocalSearchParams: () => ({}),
  useRouter: () => ({ push: jest.fn(), replace: jest.fn() }),
  useFocusEffect: (callback: () => void | (() => void)) => {
    const React = jest.requireActual<typeof import("react")>("react");
    React.useEffect(callback, [callback]);
  },
}));
// task-app-gallery (D4): TopicMediaGallery -> ... -> media-image-viewer.tsx
// imports react-native-reanimated at module scope, which crashes under jest
// without a manual mock (matches tests/features/media/ui/media-image-viewer.test.tsx's
// own mock; react-native-gesture-handler is already handled by the jest-expo preset).
jest.mock("react-native-reanimated", () => {
  const React = jest.requireActual<typeof import("react")>("react");
  const { Image } =
    jest.requireActual<typeof import("react-native")>("react-native");
  return {
    __esModule: true,
    default: {
      Image,
      createAnimatedComponent: (component: unknown) => component,
    },
    useAnimatedStyle: () => ({}),
    useSharedValue: (initial: number) => {
      const ref = React.useRef<{
        get: () => number;
        set: (next: number) => void;
      } | null>(null);
      if (!ref.current) {
        let value = initial;
        ref.current = {
          get: () => value,
          set: (next: number) => {
            value = next;
          },
        };
      }
      return ref.current;
    },
  };
});
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
// D2's integrated form has its own coverage (topics-screens.test.tsx's save
// flow, and its own future dedicated test); this file only needs a title
// field to drive the "편집" header title change and the busy/error text.
jest.mock("@/features/topics/ui/topic-edit-form", () => {
  const React = jest.requireActual<typeof import("react")>("react");
  const { Text, View } =
    jest.requireActual<typeof import("react-native")>("react-native");
  const TopicEditForm = React.forwardRef(function TopicEditForm(
    props: { errorText?: string },
    ref: React.Ref<{ submit: () => void }>,
  ) {
    React.useImperativeHandle(ref, () => ({ submit: () => {} }));
    return (
      <View testID="topic-edit-form-stub">
        {props.errorText ? <Text>{props.errorText}</Text> : null}
      </View>
    );
  });
  return { TopicEditForm };
});

describe("TopicDetailScreen article structure (D1) and edit-mode header (D2)", () => {
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

  test("article header shows title, byline (author + created-at) and body", async () => {
    const f = await setup();
    expect(lastStackScreenOptions?.title).toBe("주제");
    expect(f.screen.getByText("오늘 이야기")).toBeTruthy();
    expect(f.screen.getByText("작성자")).toBeTruthy();
    expect(f.screen.getByText("#여행")).toBeTruthy();
  });

  test("no tags renders 태그 없음 instead of an empty chip row", async () => {
    const f = topicsHarness();
    f.api.getTopic.mockResolvedValue(f.topic);
    f.api.listTags.mockResolvedValue({ items: [], nextCursor: null });
    const rendered = await setup(f);
    await rendered.screen.findByText("태그 없음");
  });

  test("편집 switches the native header title to 주제 편집 and back on 취소", async () => {
    const f = await setup();
    await fireEvent.press(f.screen.getByRole("button", { name: "주제 편집" }));
    expect(lastStackScreenOptions?.title).toBe("주제 편집");
    expect(f.screen.getByTestId("topic-edit-form-stub")).toBeTruthy();
    await fireEvent.press(f.screen.getByRole("button", { name: "취소" }));
    expect(lastStackScreenOptions?.title).toBe("주제");
    expect(f.screen.queryByTestId("topic-edit-form-stub")).toBeNull();
  });
});
