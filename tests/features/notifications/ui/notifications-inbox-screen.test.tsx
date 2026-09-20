import { act, fireEvent, render } from "@testing-library/react-native";

import { AppThemeProvider } from "@/core/theme/theme-provider";
import type { Notification, NotificationPage } from "@/core/contracts/server";
import { NotificationApiError } from "@/features/notifications/data/notifications-api";
import type { NotificationsApi } from "@/features/notifications/data/notifications-api";
import type {
  NotificationDestination,
  NotificationDestinationResolver,
} from "@/features/notifications/data/notification-destination-resolver";
import { createNotificationsStore } from "@/features/notifications/model/notifications-store";
import type { AuthorizedNotificationsRequest } from "@/features/notifications/model/notifications-store";
import { NotificationsInboxScreen } from "@/features/notifications/ui/notifications-inbox-screen";

const mockPush = jest.fn();
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

beforeEach(() => jest.clearAllMocks());

describe("NotificationsInboxScreen", () => {
  test("shows the loading notice, then the fetched row's rendered copy", async () => {
    const api = fakeApi();
    let resolvePage: (value: NotificationPage) => void = () => {};
    api.listNotifications.mockReturnValueOnce(
      new Promise((resolve) => {
        resolvePage = resolve;
      }),
    );
    const { store } = setup(api);
    const screen = await renderScreen(store);
    expect(screen.getByText("알림 불러오는 중…")).toBeTruthy();
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

  test("renders an error with a retry button that re-fetches", async () => {
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
    await fireEvent.press(
      screen.getByRole("button", { name: "알림 다시 불러오기" }),
    );
    expect(await screen.findByText("아직 알림이 없습니다.")).toBeTruthy();
  });

  test("unread rows are labeled distinctly (not color-only) and read rows are not", async () => {
    const api = fakeApi();
    api.listNotifications.mockResolvedValueOnce(
      page({
        items: [
          notification({ id: "unread-1", readAt: null }),
          notification({
            id: "read-1",
            readAt: "2026-01-01T00:00:00.000Z",
          }),
        ],
        unreadCount: 1,
      }),
    );
    const { store } = setup(api);
    const screen = await renderScreen(store);
    expect(
      await screen.findByRole("button", {
        name: "새 메시지, 민수님이 메시지를 보냈습니다., 읽지 않음",
      }),
    ).toBeTruthy();
    expect(
      screen.getByRole("button", {
        name: "새 메시지, 민수님이 메시지를 보냈습니다.",
      }),
    ).toBeTruthy();
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
      await screen.findByRole("button", {
        name: "새 메시지, 민수님이 메시지를 보냈습니다., 읽지 않음",
      }),
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

  test("shows a busy indicator on the tapped row and ignores re-taps until the destination resolves", async () => {
    const api = fakeApi();
    api.listNotifications.mockResolvedValueOnce(page());
    api.markNotificationRead.mockResolvedValueOnce(undefined);
    let finishResolve: (value: NotificationDestination) => void = () =>
      undefined;
    const resolver: jest.Mocked<NotificationDestinationResolver> = {
      resolve: jest.fn<
        Promise<NotificationDestination>,
        Parameters<NotificationDestinationResolver["resolve"]>
      >(
        () =>
          new Promise<NotificationDestination>((resolve) => {
            finishResolve = resolve;
          }),
      ),
    };
    const { store } = setup(api, resolver);
    const screen = await renderScreen(store);
    const row = await screen.findByRole("button", {
      name: "새 메시지, 민수님이 메시지를 보냈습니다., 읽지 않음",
    });
    await fireEvent.press(row);
    expect(
      await screen.findByTestId(`notification-row-busy-${notification().id}`),
    ).toBeTruthy();
    expect(screen.getByRole("button", { busy: true })).toBeTruthy();

    await fireEvent.press(row);
    expect(resolver.resolve).toHaveBeenCalledTimes(1);

    await act(async () => {
      finishResolve({
        chatroomId: "conv-1",
        groupId: "group-1",
        kind: "main",
        status: "resolved",
        topicId: null,
      });
    });
    expect(
      screen.queryByTestId(`notification-row-busy-${notification().id}`),
    ).toBeNull();
    expect(mockPush).toHaveBeenCalledTimes(1);
  });

  test("tapping a row whose destination is unauthorized shows the inaccessible message and never navigates", async () => {
    const api = fakeApi();
    api.listNotifications.mockResolvedValueOnce(page());
    api.markNotificationRead.mockResolvedValueOnce(undefined);
    const resolver: jest.Mocked<NotificationDestinationResolver> = {
      resolve: jest.fn().mockResolvedValueOnce({ status: "unauthorized" }),
    };
    const { store } = setup(api, resolver);
    const screen = await renderScreen(store);
    await fireEvent.press(
      await screen.findByRole("button", {
        name: "새 메시지, 민수님이 메시지를 보냈습니다., 읽지 않음",
      }),
    );
    expect(
      await screen.findByText("더 이상 접근할 수 없는 알림입니다."),
    ).toBeTruthy();
    expect(mockPush).not.toHaveBeenCalled();
  });

  test("a row with no conversationId is immediately treated as inaccessible without resolving", async () => {
    const api = fakeApi();
    api.listNotifications.mockResolvedValueOnce(
      page({ items: [notification({ conversationId: null })] }),
    );
    api.markNotificationRead.mockResolvedValueOnce(undefined);
    const resolver: jest.Mocked<NotificationDestinationResolver> = {
      resolve: jest.fn(),
    };
    const { store } = setup(api, resolver);
    const screen = await renderScreen(store);
    await fireEvent.press(
      await screen.findByRole("button", {
        name: "새 메시지, 민수님이 메시지를 보냈습니다., 읽지 않음",
      }),
    );
    expect(resolver.resolve).not.toHaveBeenCalled();
    expect(
      await screen.findByText("더 이상 접근할 수 없는 알림입니다."),
    ).toBeTruthy();
  });

  test("shows a load-more button when a next cursor exists and requests the next page on press", async () => {
    const api = fakeApi();
    api.listNotifications.mockResolvedValueOnce(
      page({ nextCursor: "cursor-1" }),
    );
    const { store } = setup(api);
    const screen = await renderScreen(store);
    api.listNotifications.mockResolvedValueOnce(
      page({
        items: [notification({ id: "second" })],
        nextCursor: null,
      }),
    );
    await fireEvent.press(
      await screen.findByRole("button", { name: "알림 더 보기" }),
    );
    expect(api.listNotifications).toHaveBeenLastCalledWith(
      "token",
      { after: "cursor-1" },
      expect.anything(),
    );
  });
});
