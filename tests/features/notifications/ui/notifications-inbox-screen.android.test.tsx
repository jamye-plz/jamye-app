import { act, fireEvent, render, within } from "@testing-library/react-native";
import React from "react";
import type { ReactNode } from "react";

import { AppThemeProvider } from "@/core/theme/theme-provider";
import type { Notification, NotificationPage } from "@/core/contracts/server";
import { NotificationApiError } from "@/features/notifications/data/notifications-api";
import type { NotificationsApi } from "@/features/notifications/data/notifications-api";
import type { NotificationDestinationResolver } from "@/features/notifications/data/notification-destination-resolver";
import { createNotificationsStore } from "@/features/notifications/model/notifications-store";
import type {
  AuthorizedNotificationsRequest,
  NotificationsStore,
} from "@/features/notifications/model/notifications-store";

// Row-level jetpack-compose primitives this row uses directly, mirroring the
// proven mock in `tests/shared/ui/action-list-item.android.test.tsx`.
jest.mock("@expo/ui/jetpack-compose", () => {
  const { Pressable, Text, View } =
    jest.requireActual<typeof import("react-native")>("react-native");
  type MockChildren = Readonly<{ children?: ReactNode }>;
  function DropdownMenu(
    props: Readonly<{ children?: ReactNode; expanded?: boolean }>,
  ) {
    return (
      <View
        accessibilityState={{ expanded: Boolean(props.expanded) }}
        testID="dropdown-menu"
      >
        {props.children}
      </View>
    );
  }
  function MockSlot({ children }: MockChildren) {
    return <View>{children}</View>;
  }
  DropdownMenu.Trigger = MockSlot;
  DropdownMenu.Items = MockSlot;
  function DropdownMenuItem(
    props: Readonly<{
      children?: ReactNode;
      enabled?: boolean;
      onClick?: () => void;
    }>,
  ) {
    return (
      <Pressable
        accessibilityRole="menuitem"
        accessibilityState={{ disabled: props.enabled === false }}
        onPress={props.onClick}
      >
        {props.children}
      </Pressable>
    );
  }
  DropdownMenuItem.LeadingIcon = MockSlot;
  DropdownMenuItem.Text = MockSlot;
  function Icon(
    props: Readonly<{ contentDescription?: string; tint?: string }>,
  ) {
    return (
      <View
        accessibilityHint={props.tint}
        accessibilityLabel={props.contentDescription}
      />
    );
  }
  function IconButton(
    props: Readonly<{ children?: ReactNode; onClick?: () => void }>,
  ) {
    return (
      <Pressable accessibilityRole="button" onPress={props.onClick}>
        {props.children}
      </Pressable>
    );
  }
  function ComposeText(
    props: Readonly<{ children?: ReactNode; color?: string }>,
  ) {
    return <Text style={{ color: props.color }}>{props.children}</Text>;
  }
  // Regression guard: React Native content hosted in a LazyColumn row slot
  // kept the Android UI thread in a measure loop on device, so the row must
  // stay Compose-only (DESIGN.md §4).
  function RNHostView(): never {
    throw new Error("notification rows must not host React Native views");
  }
  // `modifiers` carry the row's tap/long-press and testID the way Compose
  // modifiers do; the mock reads them back.
  function ListItem(
    props: Readonly<{
      children?: ReactNode;
      modifiers?: readonly {
        $type?: string;
        onClick?: () => void;
        onLongClick?: () => void;
        tag?: string;
      }[];
    }>,
  ) {
    const clicks = props.modifiers?.find(
      (modifier) => modifier.$type === "combinedClickable",
    );
    const testID = props.modifiers?.find(
      (modifier) => modifier.$type === "testID",
    )?.tag;
    return (
      <Pressable
        accessibilityRole="button"
        onLongPress={clicks?.onLongClick}
        onPress={clicks?.onClick}
        testID={testID}
      >
        {props.children}
      </Pressable>
    );
  }
  ListItem.LeadingContent = MockSlot;
  ListItem.HeadlineContent = MockSlot;
  ListItem.SupportingContent = MockSlot;
  ListItem.TrailingContent = MockSlot;
  function BadgedBox({ children }: MockChildren) {
    return <View testID="unread-badged-box">{children}</View>;
  }
  BadgedBox.Badge = MockSlot;
  function Badge() {
    return <View testID="unread-badge" />;
  }
  function CircularProgressIndicator(
    props: Readonly<{
      modifiers?: readonly { $type?: string; tag?: string }[];
    }>,
  ) {
    const testID = props.modifiers?.find(
      (modifier) => modifier.$type === "testID",
    )?.tag;
    return <View testID={testID} />;
  }
  return {
    Badge,
    BadgedBox,
    CircularProgressIndicator,
    Column: MockSlot,
    DropdownMenu,
    DropdownMenuItem,
    Icon,
    IconButton,
    ListItem,
    RNHostView,
    Text: ComposeText,
  };
});
jest.mock("@expo/ui/jetpack-compose/modifiers", () => ({
  combinedClickable: (handlers: {
    onClick?: () => void;
    onLongClick?: () => void;
  }) => ({ $type: "combinedClickable", ...handlers }),
  size: (width: number, height: number) => ({ $type: "size", height, width }),
  testID: (tag: string) => ({ $type: "testID", tag }),
}));

// jest always resolves an extensionless `@/shared/ui/system-feedback` import
// as iOS (`system-feedback.ios.tsx`, a SwiftUI `Alert`), even from inside
// this `.android.tsx` screen loaded via `jest.requireActual`; mock the
// module itself with a simple RN stand-in instead of also re-mocking
// `@expo/ui/swift-ui`'s Alert here.
jest.mock("@/shared/ui/system-feedback", () => {
  const ReactActual = jest.requireActual<typeof import("react")>("react");
  const { Text, View } =
    jest.requireActual<typeof import("react-native")>("react-native");
  // No named type alias here -- babel-plugin-jest-hoist's out-of-scope
  // check flags a `type X = ...` declared inside a mock factory even though
  // it is erased before runtime, so every annotation below is inline.
  const Ctx = ReactActual.createContext<
    | {
        showNotice: (notice: {
          message: string;
          actionLabel?: string;
          onAction?: () => void;
        }) => void;
      }
    | undefined
  >(undefined);
  function SystemFeedbackHost({
    children,
  }: Readonly<{ children?: ReactNode }>) {
    const [notice, setNotice] = ReactActual.useState<{
      message: string;
      actionLabel?: string;
      onAction?: () => void;
    } | null>(null);
    return (
      <Ctx.Provider value={{ showNotice: setNotice }}>
        {children}
        {notice ? (
          <View testID="system-feedback-notice">
            <Text>{notice.message}</Text>
            {notice.actionLabel ? (
              <Text
                accessibilityRole="button"
                onPress={() => {
                  const onAction = notice.onAction;
                  setNotice(null);
                  onAction?.();
                }}
              >
                {notice.actionLabel}
              </Text>
            ) : (
              <Text accessibilityRole="button" onPress={() => setNotice(null)}>
                확인
              </Text>
            )}
          </View>
        ) : null}
      </Ctx.Provider>
    );
  }
  function useSystemFeedback() {
    const ctx = ReactActual.useContext(Ctx);
    if (!ctx)
      throw new Error(
        "useSystemFeedback must be used inside SystemFeedbackHost.",
      );
    return ctx;
  }
  return { SystemFeedbackHost, useSystemFeedback };
});

// Shared C1 building blocks each carry their own jetpack-compose primitives
// and their own test suites (round 1); this screen's own tests only need to
// verify which state/props it hands them, so they are mocked as simple RN
// stand-ins rather than re-mocking every primitive those files use.
jest.mock("@/shared/ui/standard-state-view", () => {
  const { Text, View } =
    jest.requireActual<typeof import("react-native")>("react-native");
  return {
    StandardStateView: (props: {
      kind: "loading" | "empty" | "error";
      title?: string;
      description?: string;
      testID?: string;
      actions?: readonly { label: string; onPress: () => void }[];
    }) => (
      <View testID={props.testID}>
        {props.title ? (
          <Text accessibilityRole="header">{props.title}</Text>
        ) : null}
        {props.description ? <Text>{props.description}</Text> : null}
        {props.actions?.map((action) => (
          <Text
            accessibilityRole="button"
            key={action.label}
            onPress={action.onPress}
          >
            {action.label}
          </Text>
        ))}
      </View>
    ),
  };
});
jest.mock("@/shared/ui/native-list", () => {
  const { View } =
    jest.requireActual<typeof import("react-native")>("react-native");
  return {
    NativeList: ({
      children,
      testID,
    }: Readonly<{ children?: ReactNode; testID?: string }>) => (
      <View testID={testID}>{children}</View>
    ),
  };
});
jest.mock("@/shared/ui/load-sentinel", () => {
  const { View } =
    jest.requireActual<typeof import("react-native")>("react-native");
  return {
    LoadSentinel: ({ testID }: Readonly<{ testID?: string }>) => (
      <View testID={testID} />
    ),
  };
});
const mockShowSnackbar = jest
  .fn()
  .mockResolvedValue("dismissed" as "dismissed" | "actionPerformed");
jest.mock("@/shared/ui/snackbar-host.android", () => {
  const ReactActual = jest.requireActual<typeof import("react")>("react");
  const { View } =
    jest.requireActual<typeof import("react-native")>("react-native");
  return {
    AndroidSnackbarHost: ReactActual.forwardRef(
      (
        props: { testID?: string },
        ref: React.Ref<{ showSnackbar: typeof mockShowSnackbar }>,
      ) => {
        ReactActual.useImperativeHandle(ref, () => ({
          showSnackbar: mockShowSnackbar,
        }));
        return <View testID={props.testID} />;
      },
    ),
    SNACKBAR_DEFAULT_RETRY_LABEL: "다시 시도",
  };
});

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
    const ReactActual = jest.requireActual<typeof import("react")>("react");
    ReactActual.useEffect(callback, [callback]);
  },
  useLocalSearchParams: () => mockParams,
  useRouter: () => ({ push: mockPush }),
}));

function loadScreen() {
  return jest.requireActual<{
    NotificationsInboxScreen: (
      props: Readonly<{ store?: NotificationsStore }>,
    ) => React.JSX.Element;
  }>(
    "../../../../src/features/notifications/ui/notifications-inbox-screen.android.tsx",
  ).NotificationsInboxScreen;
}

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
  const NotificationsInboxScreen = loadScreen();
  return render(
    <AppThemeProvider>
      <NotificationsInboxScreen store={store} />
    </AppThemeProvider>,
  );
}

beforeEach(() => {
  jest.clearAllMocks();
  mockShowSnackbar.mockResolvedValue("dismissed");
  mockParams = {};
});

describe("NotificationsInboxScreen (Android)", () => {
  test("first load shows the standard loading state, then the fetched row's rendered copy", async () => {
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
  });

  test("shows the N3 group/topic context line only when args carry it", async () => {
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
          }),
        ],
      }),
    );
    const { store } = setup(api);
    const screen = await renderScreen(store);
    expect(await screen.findByText("우리 그룹 · 주말 모임")).toBeTruthy();
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

  test("an 'other' notification marks read but never navigates", async () => {
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

  test("N1: only an unread row gets the badge (a bare BadgedBox would draw a default one)", async () => {
    const api = fakeApi();
    api.listNotifications.mockResolvedValueOnce(
      page({
        items: [
          notification({ id: "unread-1", readAt: null }),
          notification({ id: "read-1", readAt: "2026-01-01T00:00:00.000Z" }),
        ],
      }),
    );
    const { store } = setup(api);
    const screen = await renderScreen(store);
    const unreadRow = within(
      await screen.findByTestId("notification-row-unread-1"),
    );
    const readRow = within(screen.getByTestId("notification-row-read-1"));
    expect(unreadRow.getByTestId("unread-badge")).toBeTruthy();
    expect(unreadRow.getByLabelText("읽지 않음")).toBeTruthy();
    expect(readRow.queryByTestId("unread-badged-box")).toBeNull();
    expect(readRow.queryByLabelText("읽지 않음")).toBeNull();
  });

  test("N2: an unread row's long-press/⋮ menu marks it read; a read row has neither", async () => {
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
    expect(screen.getAllByTestId("dropdown-menu")).toHaveLength(1);
    const menu = within(screen.getByTestId("dropdown-menu"));
    await fireEvent.press(
      menu.getByRole("menuitem", { name: "읽음으로 표시" }),
    );
    expect(api.markNotificationRead).toHaveBeenCalledWith(
      "token",
      "unread-1",
      expect.anything(),
    );
  });

  test("tapping a row whose destination is unauthorized shows the inaccessible system notice", async () => {
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

  test("F4/GROUPS-AC7: a resolver/network error while rows already exist shows a single feedback notice with a retry", async () => {
    const api = fakeApi();
    api.listNotifications
      .mockResolvedValueOnce(page())
      .mockRejectedValueOnce(new NotificationApiError(503, "unavailable"));
    const { store } = setup(api);
    const screen = await renderScreen(store);
    await screen.findByText("새 메시지");
    await act(async () => {
      await store.actions.refresh();
    });
    const notice = await screen.findByTestId("system-feedback-notice");
    expect(
      within(notice).getByText(
        "서버를 사용할 수 없습니다. 잠시 후 다시 시도해 주세요.",
      ),
    ).toBeTruthy();
    expect(within(notice).getByText("다시 시도")).toBeTruthy();
    expect(mockShowSnackbar).not.toHaveBeenCalled();
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
