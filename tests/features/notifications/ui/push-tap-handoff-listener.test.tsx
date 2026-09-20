import { act, render } from "@testing-library/react-native";

import type { PushTapHandoff } from "@/features/notifications/platform/push-notifications-adapter";
import { PushTapHandoffListener } from "@/features/notifications/ui/push-tap-handoff-listener";
import type { NotificationsStore } from "@/features/notifications/model/notifications-store";

const mockPush = jest.fn();
jest.mock("expo-router", () => ({
  useRouter: () => ({ push: mockPush }),
}));

let mockPrincipal: { userId: string } | null = null;
const mockAuthorizedRequest = jest.fn();
jest.mock("@/core/providers/session-provider", () => ({
  useSession: () => ({
    authorizedRequest: mockAuthorizedRequest,
    principal: mockPrincipal,
  }),
}));

function handoff(overrides: Partial<PushTapHandoff> = {}): PushTapHandoff {
  return {
    conversationId: "conv-1",
    messageId: null,
    notificationId: "notif-1",
    type: "chat_unread",
    ...overrides,
  };
}
function fakeStore(): jest.Mocked<Pick<NotificationsStore, "actions">> & {
  actions: {
    markRead: jest.Mock;
    refresh: jest.Mock;
    resolveDestination: jest.Mock;
  };
} {
  return {
    setPrincipal: jest.fn(),
    actions: {
      loadMore: jest.fn(),
      markRead: jest.fn().mockResolvedValue(undefined),
      refresh: jest.fn().mockResolvedValue(undefined),
      resolveDestination: jest.fn().mockResolvedValue({
        chatroomId: "conv-1",
        groupId: "group-1",
        kind: "main",
        status: "resolved",
        topicId: null,
      }),
    },
  } as never;
}
function listenerHarness() {
  let responseListener: ((handoff: PushTapHandoff) => void) | null = null;
  let receivedListener: ((handoff: PushTapHandoff) => void) | null = null;
  const unsubscribeResponse = jest.fn();
  const unsubscribeReceived = jest.fn();
  const onNotificationResponse = jest.fn((listener) => {
    responseListener = listener;
    return unsubscribeResponse;
  });
  const onNotificationReceived = jest.fn((listener) => {
    receivedListener = listener;
    return unsubscribeReceived;
  });
  return {
    emitReceived: (h: PushTapHandoff) => receivedListener?.(h),
    emitResponse: (h: PushTapHandoff) => responseListener?.(h),
    onNotificationReceived,
    onNotificationResponse,
    unsubscribeReceived,
    unsubscribeResponse,
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  mockPrincipal = null;
});

describe("PushTapHandoffListener", () => {
  test("registers both adapter listeners on mount and unsubscribes both on unmount", async () => {
    const harness = listenerHarness();
    const store = fakeStore();
    const screen = await render(
      <PushTapHandoffListener
        getLastNotificationResponse={jest.fn().mockResolvedValue(null)}
        onNotificationReceived={harness.onNotificationReceived}
        onNotificationResponse={harness.onNotificationResponse}
        store={store as unknown as NotificationsStore}
      />,
    );
    expect(harness.onNotificationResponse).toHaveBeenCalledTimes(1);
    expect(harness.onNotificationReceived).toHaveBeenCalledTimes(1);
    await screen.unmount();
    expect(harness.unsubscribeResponse).toHaveBeenCalledTimes(1);
    expect(harness.unsubscribeReceived).toHaveBeenCalledTimes(1);
  });

  test("binds the session principal to the store on mount, rebinds on sign-in, and clears on unmount", async () => {
    const harness = listenerHarness();
    const store = fakeStore() as unknown as NotificationsStore & {
      setPrincipal: jest.Mock;
    };
    const props = {
      getLastNotificationResponse: jest.fn().mockResolvedValue(null),
      onNotificationReceived: harness.onNotificationReceived,
      onNotificationResponse: harness.onNotificationResponse,
      store,
    };
    const screen = await render(<PushTapHandoffListener {...props} />);
    expect(store.setPrincipal).toHaveBeenCalledWith(null, null);

    mockPrincipal = { userId: "user-1" };
    await screen.rerender(<PushTapHandoffListener {...props} />);
    expect(store.setPrincipal).toHaveBeenLastCalledWith(
      { userId: "user-1" },
      mockAuthorizedRequest,
    );

    await screen.unmount();
    expect(store.setPrincipal).toHaveBeenLastCalledWith(null, null);
  });

  test("a warm tap whose conversation is no longer reachable opens the inbox instead of failing silently", async () => {
    mockPrincipal = { userId: "user-1" };
    const harness = listenerHarness();
    const store = fakeStore();
    store.actions.resolveDestination.mockResolvedValue({ status: "not_found" });
    await render(
      <PushTapHandoffListener
        getLastNotificationResponse={jest.fn().mockResolvedValue(null)}
        onNotificationReceived={harness.onNotificationReceived}
        onNotificationResponse={harness.onNotificationResponse}
        store={store as unknown as NotificationsStore}
      />,
    );
    await act(async () => {
      harness.emitResponse(handoff());
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    expect(store.actions.markRead).toHaveBeenCalledWith("notif-1");
    expect(mockPush).toHaveBeenCalledWith("/notifications");
  });

  test("a warm tap while signed in marks read, resolves, and navigates", async () => {
    mockPrincipal = { userId: "user-1" };
    const harness = listenerHarness();
    const store = fakeStore();
    await render(
      <PushTapHandoffListener
        getLastNotificationResponse={jest.fn().mockResolvedValue(null)}
        onNotificationReceived={harness.onNotificationReceived}
        onNotificationResponse={harness.onNotificationResponse}
        store={store as unknown as NotificationsStore}
      />,
    );
    await act(async () => {
      harness.emitResponse(handoff());
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    expect(store.actions.markRead).toHaveBeenCalledWith("notif-1");
    expect(mockPush).toHaveBeenCalledWith({
      params: { chatroomId: "conv-1", groupId: "group-1" },
      pathname: "/groups/[groupId]/chatrooms/[chatroomId]",
    });
  });

  test("a warm tap while signed out is ignored and never navigates", async () => {
    mockPrincipal = null;
    const harness = listenerHarness();
    const store = fakeStore();
    await render(
      <PushTapHandoffListener
        getLastNotificationResponse={jest.fn().mockResolvedValue(null)}
        onNotificationReceived={harness.onNotificationReceived}
        onNotificationResponse={harness.onNotificationResponse}
        store={store as unknown as NotificationsStore}
      />,
    );
    await harness.emitResponse(handoff());
    expect(store.actions.markRead).not.toHaveBeenCalled();
    expect(mockPush).not.toHaveBeenCalled();
  });

  test("a foreground receipt triggers store.refresh() and never marks read or navigates", async () => {
    mockPrincipal = { userId: "user-1" };
    const harness = listenerHarness();
    const store = fakeStore();
    await render(
      <PushTapHandoffListener
        getLastNotificationResponse={jest.fn().mockResolvedValue(null)}
        onNotificationReceived={harness.onNotificationReceived}
        onNotificationResponse={harness.onNotificationResponse}
        store={store as unknown as NotificationsStore}
      />,
    );
    await harness.emitReceived(handoff());
    expect(store.actions.refresh).toHaveBeenCalledTimes(1);
    expect(store.actions.markRead).not.toHaveBeenCalled();
    expect(mockPush).not.toHaveBeenCalled();
  });

  test("checks cold start once, only after principal becomes non-null, and navigates on a match", async () => {
    const getLastNotificationResponse = jest.fn().mockResolvedValue(handoff());
    const harness = listenerHarness();
    const store = fakeStore();
    const screen = await render(
      <PushTapHandoffListener
        getLastNotificationResponse={getLastNotificationResponse}
        onNotificationReceived={harness.onNotificationReceived}
        onNotificationResponse={harness.onNotificationResponse}
        store={store as unknown as NotificationsStore}
      />,
    );
    expect(getLastNotificationResponse).not.toHaveBeenCalled();
    mockPrincipal = { userId: "user-1" };
    await screen.rerender(
      <PushTapHandoffListener
        getLastNotificationResponse={getLastNotificationResponse}
        onNotificationReceived={harness.onNotificationReceived}
        onNotificationResponse={harness.onNotificationResponse}
        store={store as unknown as NotificationsStore}
      />,
    );
    expect(getLastNotificationResponse).toHaveBeenCalledTimes(1);
    expect(mockPush).toHaveBeenCalledWith({
      params: { chatroomId: "conv-1", groupId: "group-1" },
      pathname: "/groups/[groupId]/chatrooms/[chatroomId]",
    });
  });

  test("a malformed/missing cold-start response is ignored without crashing", async () => {
    mockPrincipal = { userId: "user-1" };
    const harness = listenerHarness();
    const store = fakeStore();
    await render(
      <PushTapHandoffListener
        getLastNotificationResponse={jest.fn().mockResolvedValue(null)}
        onNotificationReceived={harness.onNotificationReceived}
        onNotificationResponse={harness.onNotificationResponse}
        store={store as unknown as NotificationsStore}
      />,
    );
    expect(mockPush).not.toHaveBeenCalled();
  });
});
