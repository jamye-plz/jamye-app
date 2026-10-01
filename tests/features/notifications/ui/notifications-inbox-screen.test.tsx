import { act, fireEvent, render, within } from "@testing-library/react-native";
import type { ReactNode } from "react";

import { AppThemeProvider } from "@/core/theme/theme-provider";
import type { Notification, NotificationPage } from "@/core/contracts/server";
import { NotificationApiError } from "@/features/notifications/data/notifications-api";
import type { NotificationsApi } from "@/features/notifications/data/notifications-api";
import type { NotificationDestinationResolver } from "@/features/notifications/data/notification-destination-resolver";
import { createNotificationsStore } from "@/features/notifications/model/notifications-store";
import type { AuthorizedNotificationsRequest } from "@/features/notifications/model/notifications-store";
import { NotificationsInboxScreen } from "@/features/notifications/ui/notifications-inbox-screen";

// This screen's iOS row/list is built directly from `@expo/ui/swift-ui`
// (`List`, `ListItem`'s host, `Button`/`ContextMenu`/`SwipeActions`,
// `ContentUnavailableView`/`ProgressView`/`VStack` via `StandardStateView`
// and `LoadSentinel`), so this file's mock must cover every swift-ui export
// those shared components + this row use, not just this row's own needs.
jest.mock("@expo/ui/swift-ui", () => {
  const {
    Pressable,
    Text: RNText,
    View,
  } = jest.requireActual<typeof import("react-native")>("react-native");
  type MockChildren = Readonly<{ children?: ReactNode }>;
  function Button(
    props: Readonly<{
      label?: string;
      modifiers?: unknown[];
      onPress?: () => void;
      role?: string;
      systemImage?: string;
    }>,
  ) {
    return (
      <Pressable
        accessibilityHint={props.role}
        accessibilityLabel={props.label}
        accessibilityRole="button"
        onPress={props.onPress}
        testID={props.systemImage ? `symbol-${props.systemImage}` : undefined}
      >
        <RNText>{props.label}</RNText>
      </Pressable>
    );
  }
  // System-feedback (N4) Alert -- same mock shape as
  // `tests/shared/ui/system-feedback.test.tsx` (the kit's own test for this
  // exact upstream component).
  function Alert(
    props: Readonly<{
      children?: ReactNode;
      isPresented?: boolean;
      testID?: string;
      title?: string;
    }>,
  ) {
    if (!props.isPresented) return null;
    return (
      <View testID={props.testID ?? "alert"}>
        <RNText accessibilityRole="header">{props.title}</RNText>
        {props.children}
      </View>
    );
  }
  const alertSlot = () =>
    function MockAlertSlot({ children }: MockChildren) {
      return <View>{children}</View>;
    };
  Alert.Trigger = alertSlot();
  Alert.Actions = alertSlot();
  Alert.Message = alertSlot();
  function ContentUnavailableView(
    props: Readonly<{ description?: string; title?: string }>,
  ) {
    return (
      <View>
        <RNText accessibilityRole="header">{props.title}</RNText>
        {props.description ? <RNText>{props.description}</RNText> : null}
      </View>
    );
  }
  function ProgressView() {
    return <View testID="progress-view" />;
  }
  function VStack({
    children,
    testID,
  }: MockChildren & Readonly<{ testID?: string; spacing?: number }>) {
    return <View testID={testID}>{children}</View>;
  }
  function Text({ children }: MockChildren) {
    return <RNText>{children}</RNText>;
  }
  function List({
    children,
    testID,
  }: MockChildren & Readonly<{ testID?: string; modifiers?: unknown[] }>) {
    return <View testID={testID}>{children}</View>;
  }
  const box = (testID: string) =>
    function MockBox({ children }: MockChildren) {
      return <View testID={testID}>{children}</View>;
    };
  const SwipeActions = box("swipe-actions") as ReturnType<typeof box> & {
    Actions: (
      props: MockChildren & { edge?: "leading" | "trailing" },
    ) => React.JSX.Element;
  };
  SwipeActions.Actions = function MockSwipeActionsGroup({
    children,
    edge = "trailing",
  }) {
    return <View testID={`swipe-actions-${edge}`}>{children}</View>;
  };
  const ContextMenu = box("context-menu") as ReturnType<typeof box> & {
    Items: ReturnType<typeof box>;
    Trigger: ReturnType<typeof box>;
  };
  ContextMenu.Items = box("context-menu-items");
  ContextMenu.Trigger = box("context-menu-trigger");
  return {
    Alert,
    Button,
    ContentUnavailableView,
    ContextMenu,
    List,
    ProgressView,
    Spacer: box("spacer"),
    SwipeActions,
    Text,
    VStack,
  };
});
jest.mock("@expo/ui/swift-ui/modifiers", () => ({
  accessibilityLabel: (label: string) => ({
    $type: "accessibilityLabel",
    label,
  }),
  bold: () => ({ $type: "bold" }),
  buttonStyle: (style: string) => ({ $type: "buttonStyle", style }),
  disabled: (value: boolean) => ({ $type: "disabled", value }),
  fixedSize: (config: unknown) => ({ $type: "fixedSize", config }),
  font: (config: unknown) => ({ $type: "font", config }),
  foregroundStyle: (style: unknown) => ({ $type: "foregroundStyle", style }),
  frame: (config: unknown) => ({ $type: "frame", config }),
  listStyle: (style: string) => ({ $type: "listStyle", style }),
  onAppear: (handler: () => void) => ({ $type: "onAppear", handler }),
  refreshable: (handler: () => Promise<void>) => ({
    $type: "refreshable",
    handler,
  }),
}));

const mockPush = jest.fn();
let mockParams: Record<string, string> = {};
jest.mock("expo-router", () => ({
  Stack: {
    Screen: (props: { options?: { title?: string } }) => {
      const { Text } =
        jest.requireActual<typeof import("react-native")>("react-native");
      return props.options?.title ? (
        <Text accessibilityRole="header">{props.options.title}</Text>
      ) : null;
    },
  },
  useFocusEffect: (callback: () => void | (() => void)) => {
    const React = jest.requireActual<typeof import("react")>("react");
    React.useEffect(callback, [callback]);
  },
  useLocalSearchParams: () => mockParams,
  useRouter: () => ({ push: mockPush }),
}));

const principal = {
  epoch: 1,
  origin: "https://api.example.com",
  userId: "11111111-1111-4111-8111-111111111111",
};
const authorize: AuthorizedNotificationsRequest = (execute, signal) =>
  execute("token", signal ?? new AbortController().signal);

function notification(overrides: Partial<Notification> = {}): Notification {
  return {
    args: { sender_display_name: "민수" },
    conversationId: "conv-1",
    createdAt: "2026-01-01T00:00:00.000Z",
    id: "44444444-4444-4444-8444-444444444444",
    readAt: null,
    sourceCursor: null,
    topicId: null,
    type: "chat_unread",
    ...overrides,
  };
}
function page(overrides: Partial<NotificationPage> = {}): NotificationPage {
  return {
    items: [notification()],
    nextCursor: null,
    unreadCount: 1,
    ...overrides,
  };
}

function setup(
  api: jest.Mocked<NotificationsApi>,
  resolver: jest.Mocked<NotificationDestinationResolver> = {
    resolve: jest.fn(),
  },
) {
  const store = createNotificationsStore({
    createApi: () => api,
    createResolver: () => resolver,
  });
  store.setPrincipal(principal, authorize);
  return { resolver, store };
}
function fakeApi(): jest.Mocked<NotificationsApi> {
  return { listNotifications: jest.fn(), markNotificationRead: jest.fn() };
}

async function renderScreen(
  store: ReturnType<typeof createNotificationsStore>,
) {
  return render(
    <AppThemeProvider>
      <NotificationsInboxScreen store={store} />
    </AppThemeProvider>,
  );
}

beforeEach(() => {
  jest.clearAllMocks();
  mockParams = {};
});

describe("NotificationsInboxScreen (iOS)", () => {
  test("first load shows the standard loading state, then the fetched row's rendered copy (no more banner)", async () => {
    const api = fakeApi();
    let resolvePage: (value: NotificationPage) => void = () => {};
    api.listNotifications.mockReturnValueOnce(
      new Promise((resolve) => {
        resolvePage = resolve;
      }),
    );
    const { store } = setup(api);
    const screen = await renderScreen(store);
    expect(screen.getByTestId("notifications-loading")).toBeTruthy();
    expect(screen.queryByText("알림 불러오는 중…")).toBeNull();
    await act(async () => resolvePage(page()));
    expect(screen.getByText("새 메시지")).toBeTruthy();
    expect(screen.getByText("민수님이 메시지를 보냈습니다.")).toBeTruthy();
  });

  test("renders the empty state once the list is ready with no items", async () => {
    const api = fakeApi();
    api.listNotifications.mockResolvedValueOnce(
      page({ items: [], unreadCount: 0 }),
    );
    const { store } = setup(api);
    const screen = await renderScreen(store);
    expect(await screen.findByText("아직 알림이 없습니다.")).toBeTruthy();
    expect(
      screen.getByText("새 소식이 도착하면 여기에 표시됩니다."),
    ).toBeTruthy();
  });

  test("renders an error state with no rows and a retry action that re-fetches", async () => {
    const api = fakeApi();
    api.listNotifications.mockRejectedValueOnce(
      new NotificationApiError(503, "unavailable"),
    );
    const { store } = setup(api);
    const screen = await renderScreen(store);
    expect(
      await screen.findByText(
        "서버를 사용할 수 없습니다. 잠시 후 다시 시도해 주세요.",
      ),
    ).toBeTruthy();
    api.listNotifications.mockResolvedValueOnce(
      page({ items: [], unreadCount: 0 }),
    );
    await fireEvent.press(screen.getByRole("button", { name: "다시 시도" }));
    expect(await screen.findByText("아직 알림이 없습니다.")).toBeTruthy();
  });

  test("shows the N3 group/topic context line only when args carry it, and never for legacy args", async () => {
    const api = fakeApi();
    api.listNotifications.mockResolvedValueOnce(
      page({
        items: [
          notification({
            args: {
              group_name: "우리 그룹",
              sender_display_name: "민수",
              topic_title: "주말 모임",
            },
            id: "with-context",
          }),
          notification({
            args: { group_name: "우리 그룹", sender_display_name: "민수" },
            id: "group-only",
          }),
          notification({
            args: { sender_display_name: "민수" },
            id: "legacy",
          }),
        ],
      }),
    );
    const { store } = setup(api);
    const screen = await renderScreen(store);
    expect(await screen.findByText("우리 그룹 · 주말 모임")).toBeTruthy();
    expect(screen.getByText("우리 그룹")).toBeTruthy();
  });

  test("tapping a resolvable row marks it read and navigates to the main chatroom route", async () => {
    const api = fakeApi();
    api.listNotifications.mockResolvedValueOnce(page());
    api.markNotificationRead.mockResolvedValueOnce(undefined);
    const resolver: jest.Mocked<NotificationDestinationResolver> = {
      resolve: jest.fn().mockResolvedValueOnce({
        chatroomId: "conv-1",
        groupId: "group-1",
        kind: "main",
        status: "resolved",
        topicId: null,
      }),
    };
    const { store } = setup(api, resolver);
    const screen = await renderScreen(store);
    await fireEvent.press(
      await screen.findByTestId(`notification-row-${notification().id}`),
    );
    expect(api.markNotificationRead).toHaveBeenCalledWith(
      "token",
      notification().id,
      expect.anything(),
    );
    expect(mockPush).toHaveBeenCalledWith({
      params: { chatroomId: "conv-1", groupId: "group-1" },
      pathname: "/groups/[groupId]/chatrooms/[chatroomId]",
    });
  });

  test("an 'other' notification marks read but never navigates and shows no notice", async () => {
    const api = fakeApi();
    api.listNotifications.mockResolvedValueOnce(
      page({ items: [notification({ type: "other" })] }),
    );
    api.markNotificationRead.mockResolvedValueOnce(undefined);
    const resolver: jest.Mocked<NotificationDestinationResolver> = {
      resolve: jest.fn(),
    };
    const { store } = setup(api, resolver);
    const screen = await renderScreen(store);
    await fireEvent.press(
      await screen.findByTestId(`notification-row-${notification().id}`),
    );
    expect(api.markNotificationRead).toHaveBeenCalled();
    expect(resolver.resolve).not.toHaveBeenCalled();
    expect(mockPush).not.toHaveBeenCalled();
  });

  test("tapping a row whose destination is unauthorized shows the inaccessible system notice and never navigates", async () => {
    const api = fakeApi();
    api.listNotifications.mockResolvedValueOnce(page());
    api.markNotificationRead.mockResolvedValueOnce(undefined);
    const resolver: jest.Mocked<NotificationDestinationResolver> = {
      resolve: jest.fn().mockResolvedValueOnce({ status: "unauthorized" }),
    };
    const { store } = setup(api, resolver);
    const screen = await renderScreen(store);
    await fireEvent.press(
      await screen.findByTestId(`notification-row-${notification().id}`),
    );
    expect(
      await screen.findByText("더 이상 접근할 수 없는 알림입니다."),
    ).toBeTruthy();
    expect(mockPush).not.toHaveBeenCalled();
  });

  test("a resolve failure (network) shows 'can't open' with a retry action that reopens the same row", async () => {
    const api = fakeApi();
    api.listNotifications.mockResolvedValueOnce(page());
    api.markNotificationRead.mockResolvedValue(undefined);
    const resolver: jest.Mocked<NotificationDestinationResolver> = {
      resolve: jest
        .fn()
        .mockRejectedValueOnce(new Error("network"))
        .mockResolvedValueOnce({
          chatroomId: "conv-1",
          groupId: "group-1",
          kind: "main",
          status: "resolved",
          topicId: null,
        }),
    };
    const { store } = setup(api, resolver);
    const screen = await renderScreen(store);
    await fireEvent.press(
      await screen.findByTestId(`notification-row-${notification().id}`),
    );
    expect(await screen.findByText("알림을 열 수 없습니다.")).toBeTruthy();
    await fireEvent.press(screen.getByRole("button", { name: "다시 시도" }));
    expect(mockPush).toHaveBeenCalledWith({
      params: { chatroomId: "conv-1", groupId: "group-1" },
      pathname: "/groups/[groupId]/chatrooms/[chatroomId]",
    });
  });

  test("N2: an unread row's leading swipe and context menu both mark it read; a read row gets neither", async () => {
    const api = fakeApi();
    api.listNotifications.mockResolvedValueOnce(
      page({
        items: [
          notification({ id: "unread-1", readAt: null }),
          notification({ id: "read-1", readAt: "2026-01-01T00:00:00.000Z" }),
        ],
      }),
    );
    api.markNotificationRead.mockResolvedValue(undefined);
    const { store } = setup(api);
    const screen = await renderScreen(store);
    await screen.findByTestId("notification-row-unread-1");
    expect(screen.getAllByTestId("swipe-actions-leading")).toHaveLength(1);
    expect(screen.queryByTestId("notification-row-read-1")).toBeTruthy();
    // Only the unread row gets a context menu at all (the read row's
    // `NotificationRow` returns the bare, unwrapped row).
    const menu = within(screen.getByTestId("context-menu-items"));
    expect(menu.getByRole("button", { name: "읽음으로 표시" })).toBeTruthy();
    const leadingSwipe = within(screen.getByTestId("swipe-actions-leading"));
    await fireEvent.press(leadingSwipe.getByRole("button", { name: "읽음" }));
    expect(api.markNotificationRead).toHaveBeenCalledWith(
      "token",
      "unread-1",
      expect.anything(),
    );
    // Marking it read optimistically flips `unread`, so the swipe/menu
    // affordance disappears from what was the "unread-1" row.
    expect(await screen.findByTestId("notification-row-unread-1")).toBeTruthy();
    expect(screen.queryByTestId("swipe-actions-leading")).toBeNull();
  });

  test("push-tap handoff: an 'inaccessible' route param shows the notice exactly once", async () => {
    mockParams = { pushOpenFailure: "inaccessible" };
    const api = fakeApi();
    api.listNotifications.mockResolvedValueOnce(page({ items: [] }));
    const { store } = setup(api);
    const screen = await renderScreen(store);
    expect(
      await screen.findByText("더 이상 접근할 수 없는 알림입니다."),
    ).toBeTruthy();
  });

  test("push-tap handoff: a 'failed' route param shows the retry notice and refreshes on retry", async () => {
    mockParams = { pushOpenFailure: "failed" };
    const api = fakeApi();
    api.listNotifications.mockResolvedValue(page({ items: [] }));
    const { store } = setup(api);
    const screen = await renderScreen(store);
    expect(await screen.findByText("알림을 열 수 없습니다.")).toBeTruthy();
    api.listNotifications.mockClear();
    await fireEvent.press(screen.getByRole("button", { name: "다시 시도" }));
    expect(api.listNotifications).toHaveBeenCalled();
  });

  test("a quiet focus refresh keeps existing rows on screen without any loading banner", async () => {
    const api = fakeApi();
    api.listNotifications.mockResolvedValue(page());
    const { store } = setup(api);
    const screen = await renderScreen(store);
    await screen.findByText("새 메시지");
    await act(async () => {
      await store.actions.refresh();
    });
    expect(screen.getByText("새 메시지")).toBeTruthy();
    expect(screen.queryByText("알림 불러오는 중…")).toBeNull();
    expect(screen.queryByTestId("notifications-loading")).toBeNull();
  });

  test("shows the auto-load sentinel when a next cursor exists", async () => {
    const api = fakeApi();
    api.listNotifications.mockResolvedValueOnce(
      page({ nextCursor: "cursor-1" }),
    );
    const { store } = setup(api);
    const screen = await renderScreen(store);
    expect(await screen.findByTestId("notifications-load-more")).toBeTruthy();
  });
});
