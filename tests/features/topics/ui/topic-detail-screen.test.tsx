import { fireEvent, render } from "@testing-library/react-native";
import type { ComponentType, ReactNode } from "react";
import { AppState } from "react-native";
import { AppThemeProvider } from "@/core/theme/theme-provider";
import { TopicsProvider } from "@/features/topics/model/topics-provider";
import { TopicDetailScreen } from "@/features/topics/ui/topic-detail-screen";
import { withTopicChatBeneath } from "@/features/topics/ui/use-topic-chat-beneath";
import { authorize, topicsHarness } from "../topics-harness";
import { groupId, otherId, roomId, topicId } from "../topics-fixtures";
import { TopicsApiError } from "@/features/topics/data/topics-api";
import type { HeaderActionsProps } from "@/shared/ui/header-actions.types";

// M15/AC4/AC6/AC5: the author-only HeaderActions menu (편집/삭제), the
// "deleted" StandardStateView state, and ConfirmAlert all render through
// @expo/ui/swift-ui on iOS. Merges the established per-component patterns
// (tests/shared/ui/standard-state-view.test.tsx, confirm-alert.test.tsx)
// since all three render in this one screen; TopicMediaGallery/TopicTagsView
// (also reachable from this screen) import nothing from this module (only
// `buttonStyle` from its /modifiers submodule, covered below), so a full
// replacement here is safe.
jest.mock("@expo/ui/swift-ui", () => {
  const { Pressable, Text, View } =
    jest.requireActual<typeof import("react-native")>("react-native");
  const AnyPressable = Pressable as unknown as ComponentType<
    Record<string, unknown>
  >;
  type MockChildren = Readonly<{ children?: ReactNode; testID?: string }>;
  function VStack({ children, testID }: MockChildren) {
    return <View testID={testID}>{children}</View>;
  }
  function ProgressView() {
    return <View testID="progress-view" />;
  }
  function ContentUnavailableView(
    props: Readonly<{
      description?: string;
      systemImage?: string;
      title?: string;
    }>,
  ) {
    return (
      <View accessibilityHint={props.systemImage} testID="content-unavailable">
        <Text accessibilityRole="header">{props.title}</Text>
        {props.description ? <Text>{props.description}</Text> : null}
      </View>
    );
  }
  function Button(
    props: Readonly<{
      label?: string;
      modifiers?: unknown[];
      onPress?: () => void;
      role?: string;
    }>,
  ) {
    return (
      <AnyPressable
        accessibilityHint={props.role}
        accessibilityLabel={props.label}
        accessibilityRole="button"
        modifiers={props.modifiers}
        onPress={props.onPress}
        testID={`button-${props.label}`}
      />
    );
  }
  function Alert(
    props: Readonly<{
      children?: ReactNode;
      isPresented?: boolean;
      testID?: string;
      title?: string;
    }>,
  ) {
    // M15 device regression: the delete ConfirmAlert once mounted outside a
    // Host, which fails at the native boundary. `require` (not
    // `jest.requireMock`) returns the same "@expo/ui" mock instance the
    // screen imports, so the Host context matches.
    // eslint-disable-next-line @typescript-eslint/no-require-imports -- jest.mock factories cannot use ES import
    const hostGuard = require("@expo/ui") as {
      useMockHostGuard: (component: string) => void;
    };
    hostGuard.useMockHostGuard("Alert");
    if (!props.isPresented) return null;
    return (
      <View testID={props.testID ?? "alert"}>
        <Text accessibilityRole="header">{props.title}</Text>
        {props.children}
      </View>
    );
  }
  const slot = () =>
    function MockSlot({ children }: MockChildren) {
      return <View>{children}</View>;
    };
  Alert.Trigger = slot();
  Alert.Actions = slot();
  Alert.Message = slot();
  function Spacer() {
    return <View testID="spacer" />;
  }
  return {
    Alert,
    Button,
    ContentUnavailableView,
    ProgressView,
    Spacer,
    Text,
    VStack,
  };
});
jest.mock("@expo/ui/swift-ui/modifiers", () => ({
  buttonStyle: (style: string) => ({ $type: "buttonStyle", style }),
  fixedSize: (params: unknown) => ({ $type: "fixedSize", params }),
  frame: (params: unknown) => ({ $type: "frame", params }),
}));

// M15/AC4 (device round r2 coordinator fix): a thin spy wrapper -- not a
// replacement -- around the real (iOS) HeaderActions, recording every
// `actions` prop it is rendered with while still rendering the real
// component underneath. Every existing test below that opens the real
// 편집/삭제 menu via getByRole is unaffected (same component, same props,
// same output); this only adds an observable side channel for the one thing
// queryByRole alone cannot distinguish -- HeaderActions staying *mounted*
// with an empty actions array after delete vs. being unmounted (both render
// zero visible menu items on iOS, but only the Android headerRight bug the
// coordinator's device sweep found cares about which one actually happened).
const mockHeaderActionsCalls: (readonly unknown[])[] = [];
jest.mock("@/shared/ui/header-actions", () => {
  const actual = jest.requireActual<
    typeof import("@/shared/ui/header-actions")
  >("@/shared/ui/header-actions");
  return {
    ...actual,
    HeaderActions: (props: HeaderActionsProps) => {
      mockHeaderActionsCalls.push(props.actions);
      return <actual.HeaderActions {...props} />;
    },
  };
});

let lastStackScreenOptions: Record<string, unknown> | undefined;
const mockLoadRooms = jest.fn().mockResolvedValue(undefined);
const mockCloseRooms = jest.fn();
// M15/AC8 (r2-17): captures the `showGroupHome` navigation a successful
// author delete now triggers (real `showGroupHome` -- not mocked -- calls
// `router.dismissTo(...)`, so this is the one router method it needs).
const mockDismissTo = jest.fn();
// M17/U13: the root stack as `useTopicChatBeneath` reads and resets it.
const mockNavigationReset = jest.fn();
let mockNavigationState: Readonly<Record<string, unknown>> | undefined;
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
  useNavigation: () => ({
    getState: () => mockNavigationState,
    reset: mockNavigationReset,
  }),
  useRouter: () => ({
    dismissTo: mockDismissTo,
    push: jest.fn(),
    replace: jest.fn(),
  }),
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
    mockNavigationState = undefined;
    AppState.currentState = "active";
    mockHeaderActionsCalls.length = 0;
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

  describe("M17/U13: back from a topic opened from its announcement", () => {
    const CHATROOM = "groups/[groupId]/chatrooms/[chatroomId]";
    const TOPIC = "groups/[groupId]/topics/[topicId]";
    function rootStack(beneath: Readonly<Record<string, unknown>>) {
      return {
        index: 2,
        key: "root",
        routeNames: ["(tabs)", CHATROOM, TOPIC],
        routes: [
          { key: "tabs", name: "(tabs)" },
          { key: "beneath", ...beneath },
          { key: "detail", name: TOPIC, params: { groupId, topicId } },
        ],
        stale: false,
        type: "stack",
      };
    }

    test("swaps the group's main chat beneath the detail for the topic's own chat, keeping every other route", async () => {
      mockNavigationState = rootStack({
        name: CHATROOM,
        params: { chatroomId: otherId, groupId },
      });
      const f = await setup();
      await f.screen.findByText("오늘 이야기");
      expect(mockNavigationReset).toHaveBeenCalledTimes(1);
      expect(mockNavigationReset.mock.calls[0]![0]).toEqual({
        ...rootStack({}),
        routes: [
          { key: "tabs", name: "(tabs)" },
          { name: CHATROOM, params: { chatroomId: roomId, groupId } },
          { key: "detail", name: TOPIC, params: { groupId, topicId } },
        ],
      });
    });

    test("leaves the stack alone when the topic was opened from its own chat", async () => {
      mockNavigationState = rootStack({
        name: CHATROOM,
        params: { chatroomId: roomId, groupId },
      });
      const f = await setup();
      await f.screen.findByText("오늘 이야기");
      expect(mockNavigationReset).not.toHaveBeenCalled();
    });

    test("withTopicChatBeneath only swaps a same-group chatroom directly beneath the top-most matching detail", () => {
      const target = { chatroomId: roomId, groupId, topicId };
      const detail = { key: "d", name: TOPIC, params: { groupId, topicId } };
      const otherGroup = "77777777-7777-4777-8777-777777777777";
      expect(withTopicChatBeneath([detail], target)).toBeNull();
      expect(
        withTopicChatBeneath([{ key: "t", name: "(tabs)" }, detail], target),
      ).toBeNull();
      expect(
        withTopicChatBeneath(
          [
            {
              key: "c",
              name: CHATROOM,
              params: { chatroomId: otherId, groupId: otherGroup },
            },
            detail,
          ],
          target,
        ),
      ).toBeNull();
      expect(
        withTopicChatBeneath(
          [
            {
              key: "c",
              name: CHATROOM,
              params: { chatroomId: otherId, groupId },
            },
            detail,
            { key: "g", name: "groups/[groupId]/gallery", params: { groupId } },
          ],
          target,
        ),
      ).toEqual([
        { name: CHATROOM, params: { chatroomId: roomId, groupId } },
        detail,
        { key: "g", name: "groups/[groupId]/gallery", params: { groupId } },
      ]);
    });
  });

  test("no tags renders 태그 없음 instead of an empty chip row", async () => {
    const f = topicsHarness();
    f.api.getTopic.mockResolvedValue(f.topic);
    f.api.listTags.mockResolvedValue({ items: [], nextCursor: null });
    const rendered = await setup(f);
    await rendered.screen.findByText("태그 없음");
  });

  test("편집 (now a HeaderActions menu item, M15/AC4) switches the native header title to 주제 편집 and back on 취소", async () => {
    const f = await setup();
    await fireEvent.press(f.screen.getByRole("menuitem", { name: "편집" }));
    expect(lastStackScreenOptions?.title).toBe("주제 편집");
    expect(f.screen.getByTestId("topic-edit-form-stub")).toBeTruthy();
    await fireEvent.press(f.screen.getByRole("button", { name: "취소" }));
    expect(lastStackScreenOptions?.title).toBe("주제");
    expect(f.screen.queryByTestId("topic-edit-form-stub")).toBeNull();
  });

  describe("M15 AC4/AC5/AC6/E11: header menu, delete confirm and the deleted state", () => {
    test("an author sees a 주제 메뉴 with 편집 and 삭제; a non-author sees no menu at all", async () => {
      const author = await setup();
      expect(
        author.screen.getByRole("button", { name: "주제 메뉴" }),
      ).toBeTruthy();
      expect(
        author.screen.getByRole("menuitem", { name: "편집" }),
      ).toBeTruthy();
      expect(
        author.screen.getByRole("menuitem", { name: "삭제" }),
      ).toBeTruthy();

      const nonAuthor = await setup(topicsHarness({ userId: otherId }));
      expect(
        nonAuthor.screen.queryByRole("button", { name: "주제 메뉴" }),
      ).toBeNull();
      expect(
        nonAuthor.screen.queryByRole("menuitem", { name: "편집" }),
      ).toBeNull();
      expect(
        nonAuthor.screen.queryByRole("menuitem", { name: "삭제" }),
      ).toBeNull();
    });

    test("a topic-detail 404 renders the 삭제된 주제입니다. state instead of a retryable error (E5)", async () => {
      const f = topicsHarness();
      f.api.getTopic.mockRejectedValue(
        new TopicsApiError(404, "topic_not_found"),
      );
      const rendered = await setup(f);
      await rendered.screen.findByText("삭제된 주제입니다.");
      expect(rendered.screen.queryByText("다시 시도")).toBeNull();
      expect(
        rendered.screen.queryByRole("button", { name: "주제 메뉴" }),
      ).toBeNull();
    });

    test("삭제 opens ConfirmAlert with the exact E10 copy; confirming calls T8, reaches the deleted state, and navigates to the group's topic list (AC8)", async () => {
      const f = await setup();
      // M15/AC4 (device round r2 coordinator fix): the author menu is up
      // (non-empty actions) before delete -- the baseline this test's final
      // assertion below contrasts against.
      expect(mockHeaderActionsCalls.at(-1)?.length).toBeGreaterThan(0);
      await fireEvent.press(f.screen.getByRole("menuitem", { name: "삭제" }));
      expect(f.screen.getByText("주제를 삭제할까요?")).toBeTruthy();
      expect(
        f.screen.getByText(
          "주제 대화방의 메시지와 사진·동영상도 모든 사람에게서 삭제됩니다.",
        ),
      ).toBeTruthy();
      await fireEvent.press(f.screen.getByRole("button", { name: "삭제" }));
      expect(f.api.deleteTopic).toHaveBeenCalledWith(
        "test-token",
        groupId,
        topicId,
        expect.anything(),
      );
      await f.screen.findByText("삭제된 주제입니다.");
      // M15/AC4 (device round r2 coordinator fix): HeaderActions is still
      // rendered (mounted) with an empty actions array after delete instead
      // of being unmounted -- the exact regression. An unmounted
      // HeaderActions would leave `mockHeaderActionsCalls` at its
      // last-non-empty entry from before delete (nothing re-records), which
      // is indistinguishable from the fixed behavior via queryByRole alone
      // since both render zero visible menu items on iOS.
      expect(mockHeaderActionsCalls.at(-1)).toHaveLength(0);
      // M15/AC8 (r2-17, device re-check 2026-09-29): a successful T8 from
      // this header-menu delete goes straight back to the group's topic
      // list -- `showGroupHome` (the real implementation, not mocked) calls
      // `router.dismissTo` with exactly these params, which also pops a
      // chatroom underneath this detail (list -> chat -> detail) back to
      // the list in one hop.
      expect(mockDismissTo).toHaveBeenCalledWith(
        { params: { groupId }, pathname: "/groups/[groupId]" },
        { withAnchor: true },
      );
    });

    test("취소 dismisses the alert without calling T8", async () => {
      const f = await setup();
      await fireEvent.press(f.screen.getByRole("menuitem", { name: "삭제" }));
      await fireEvent.press(f.screen.getByRole("button", { name: "취소" }));
      expect(f.api.deleteTopic).not.toHaveBeenCalled();
      expect(f.screen.queryByText("주제를 삭제할까요?")).toBeNull();
      expect(mockDismissTo).not.toHaveBeenCalled();
    });

    test("a failed T8 does not navigate to the group's topic list, stays on the detail, and shows the error inline (AC8, coordinator review)", async () => {
      const f = await setup();
      f.api.deleteTopic.mockRejectedValueOnce(
        new TopicsApiError(409, "topic_delete_conflict"),
      );
      await fireEvent.press(f.screen.getByRole("menuitem", { name: "삭제" }));
      await fireEvent.press(f.screen.getByRole("button", { name: "삭제" }));
      // Coordinator review: the header-menu delete used to be silent on
      // failure outside editing (`mutationErrorText` only ever reached
      // `TopicEditForm`). `findByText` on the now-visible inline error is
      // both this test's settlement proxy (mirrors
      // tests/features/groups/ui/group-detail.test.tsx's "I6" delete test,
      // which waits on the API mock instead since it has no new text of its
      // own to wait on) and the assertion that AC8's "show the existing
      // error" is actually true now.
      await f.screen.findByText(
        "이전 생성 시도와 충돌합니다. 결과를 확인한 뒤 같은 요청을 재시도해 주세요.",
      );
      expect(f.screen.getByTestId("topic-article")).toBeTruthy();
      expect(f.screen.queryByText("삭제된 주제입니다.")).toBeNull();
      expect(mockDismissTo).not.toHaveBeenCalled();
    });

    test("the inline delete error never shows while editing (coordinator review)", async () => {
      const f = await setup();
      f.api.deleteTopic.mockRejectedValueOnce(
        new TopicsApiError(409, "topic_delete_conflict"),
      );
      await fireEvent.press(f.screen.getByRole("menuitem", { name: "삭제" }));
      await fireEvent.press(f.screen.getByRole("button", { name: "삭제" }));
      await f.screen.findByText(
        "이전 생성 시도와 충돌합니다. 결과를 확인한 뒤 같은 요청을 재시도해 주세요.",
      );
      // `!editing` gate: entering edit mode (the form owns error display via
      // `mutationErrorText` instead, unaffected) hides this screen's own
      // inline error. `openEdit()` also calls the store's existing
      // `clearMutation()` first (unrelated to this change), so this
      // particular transition clears the error two independent ways at
      // once -- the next test isolates the `!editing` gate itself by
      // reaching the deleted state instead of editing.
      await fireEvent.press(f.screen.getByRole("menuitem", { name: "편집" }));
      expect(
        f.screen.queryByText(
          "이전 생성 시도와 충돌합니다. 결과를 확인한 뒤 같은 요청을 재시도해 주세요.",
        ),
      ).toBeNull();
    });

    test("retrying the delete after a failure clears the inline error once it succeeds, and navigates (coordinator review)", async () => {
      const f = await setup();
      f.api.deleteTopic.mockRejectedValueOnce(
        new TopicsApiError(409, "topic_delete_conflict"),
      );
      await fireEvent.press(f.screen.getByRole("menuitem", { name: "삭제" }));
      await fireEvent.press(f.screen.getByRole("button", { name: "삭제" }));
      await f.screen.findByText(
        "이전 생성 시도와 충돌합니다. 결과를 확인한 뒤 같은 요청을 재시도해 주세요.",
      );
      // Retry: `f.api.deleteTopic` now resolves again (the harness's
      // default, `mockRejectedValueOnce` only intercepted the first call).
      // "must clear once a later mutation starts/succeeds": the same
      // store-derived `state.mutation` this screen reads resets to
      // `status: "pending"` the instant `startMutation("delete")` runs
      // (before this second attempt even settles), same as
      // `mutationErrorText` already relies on for the edit form.
      await fireEvent.press(f.screen.getByRole("menuitem", { name: "삭제" }));
      await fireEvent.press(f.screen.getByRole("button", { name: "삭제" }));
      await f.screen.findByText("삭제된 주제입니다.");
      expect(
        f.screen.queryByText(
          "이전 생성 시도와 충돌합니다. 결과를 확인한 뒤 같은 요청을 재시도해 주세요.",
        ),
      ).toBeNull();
      expect(mockDismissTo).toHaveBeenCalledWith(
        { params: { groupId }, pathname: "/groups/[groupId]" },
        { withAnchor: true },
      );
    });
  });
});
