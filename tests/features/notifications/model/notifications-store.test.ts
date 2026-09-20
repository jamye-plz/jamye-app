import { AuthApiError } from "@/core/auth/auth-api";
import type { Notification, NotificationPage } from "@/core/contracts/server";
import { NotificationApiError } from "@/features/notifications/data/notifications-api";
import type { NotificationsApi } from "@/features/notifications/data/notifications-api";
import type { NotificationDestinationResolver } from "@/features/notifications/data/notification-destination-resolver";
import {
  createNotificationsStore,
  initialNotificationsState,
} from "@/features/notifications/model/notifications-store";
import type {
  AuthorizedNotificationsRequest,
  NotificationsPrincipal,
} from "@/features/notifications/model/notifications-store";

const principal: NotificationsPrincipal = {
  epoch: 1,
  origin: "https://api.example.com",
  userId: "11111111-1111-4111-8111-111111111111",
};
const otherPrincipal: NotificationsPrincipal = {
  ...principal,
  userId: "22222222-2222-4222-8222-222222222222",
};
const authorize: AuthorizedNotificationsRequest = (execute, signal) =>
  execute("token", signal ?? new AbortController().signal);

function notification(overrides: Partial<Notification> = {}): Notification {
  return {
    args: {},
    conversationId: "33333333-3333-4333-8333-333333333333",
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
function fakeApi(): jest.Mocked<NotificationsApi> {
  return {
    listNotifications: jest.fn(),
    markNotificationRead: jest.fn(),
  };
}
function fakeResolver(): jest.Mocked<NotificationDestinationResolver> {
  return { resolve: jest.fn() };
}

describe("createNotificationsStore", () => {
  test("starts idle and setPrincipal(null) leaves it idle", () => {
    const store = createNotificationsStore({
      createApi: fakeApi,
      createResolver: fakeResolver,
    });
    expect(store.getState()).toEqual(initialNotificationsState());
    store.setPrincipal(null, null);
    expect(store.getState()).toEqual(initialNotificationsState());
  });

  test("refresh() is a no-op without an active principal", async () => {
    const store = createNotificationsStore({
      createApi: fakeApi,
      createResolver: fakeResolver,
    });
    await store.actions.refresh();
    expect(store.getState().status).toBe("idle");
  });

  test("refresh() loads the first page and exposes the server unread_count", async () => {
    const api = fakeApi();
    api.listNotifications.mockResolvedValueOnce(
      page({ nextCursor: "cursor-1", unreadCount: 3 }),
    );
    const store = createNotificationsStore({
      createApi: () => api,
      createResolver: fakeResolver,
    });
    store.setPrincipal(principal, authorize);
    await store.actions.refresh();
    const state = store.getState();
    expect(state.status).toBe("ready");
    expect(state.items).toHaveLength(1);
    expect(state.unreadCount).toBe(3);
    expect(state.nextCursor).toBe("cursor-1");
    expect(api.listNotifications).toHaveBeenCalledWith(
      "token",
      {},
      expect.anything(),
    );
  });

  test("refresh() failure with no cached items surfaces status error", async () => {
    const api = fakeApi();
    api.listNotifications.mockRejectedValueOnce(
      new NotificationApiError(503, "unavailable"),
    );
    const store = createNotificationsStore({
      createApi: () => api,
      createResolver: fakeResolver,
    });
    store.setPrincipal(principal, authorize);
    await store.actions.refresh();
    expect(store.getState()).toMatchObject({
      error: "unavailable",
      status: "error",
    });
  });

  test("refresh() failure while items already exist keeps status ready with an error flag", async () => {
    const api = fakeApi();
    api.listNotifications.mockResolvedValueOnce(page());
    const store = createNotificationsStore({
      createApi: () => api,
      createResolver: fakeResolver,
    });
    store.setPrincipal(principal, authorize);
    await store.actions.refresh();
    api.listNotifications.mockRejectedValueOnce(
      new NotificationApiError(0, "network_unavailable"),
    );
    await store.actions.refresh();
    expect(store.getState()).toMatchObject({
      error: "network",
      status: "ready",
    });
    expect(store.getState().items).toHaveLength(1);
  });

  test("loadMore() appends unique items and refreshes unread_count from the server", async () => {
    const api = fakeApi();
    api.listNotifications.mockResolvedValueOnce(
      page({ nextCursor: "cursor-1", unreadCount: 2 }),
    );
    const store = createNotificationsStore({
      createApi: () => api,
      createResolver: fakeResolver,
    });
    store.setPrincipal(principal, authorize);
    await store.actions.refresh();
    api.listNotifications.mockResolvedValueOnce(
      page({
        items: [notification({ id: "55555555-5555-4555-8555-555555555555" })],
        nextCursor: null,
        unreadCount: 1,
      }),
    );
    await store.actions.loadMore();
    const state = store.getState();
    expect(state.items).toHaveLength(2);
    expect(state.nextCursor).toBeNull();
    expect(state.unreadCount).toBe(1);
    expect(api.listNotifications).toHaveBeenLastCalledWith(
      "token",
      { after: "cursor-1" },
      expect.anything(),
    );
  });

  test("loadMore() is a no-op when there is no next cursor", async () => {
    const api = fakeApi();
    api.listNotifications.mockResolvedValueOnce(page({ nextCursor: null }));
    const store = createNotificationsStore({
      createApi: () => api,
      createResolver: fakeResolver,
    });
    store.setPrincipal(principal, authorize);
    await store.actions.refresh();
    await store.actions.loadMore();
    expect(api.listNotifications).toHaveBeenCalledTimes(1);
  });

  test("markRead() optimistically flips readAt and decrements unreadCount, kept on success", async () => {
    const api = fakeApi();
    api.listNotifications.mockResolvedValueOnce(page({ unreadCount: 1 }));
    api.markNotificationRead.mockResolvedValueOnce(undefined);
    const store = createNotificationsStore({
      createApi: () => api,
      createResolver: fakeResolver,
    });
    store.setPrincipal(principal, authorize);
    await store.actions.refresh();
    await store.actions.markRead(notification().id);
    const state = store.getState();
    expect(state.unreadCount).toBe(0);
    expect(state.items[0]!.readAt).not.toBeNull();
    expect(api.markNotificationRead).toHaveBeenCalledWith(
      "token",
      notification().id,
      expect.anything(),
    );
  });

  test("markRead() rolls back the optimistic update when N2 fails", async () => {
    const api = fakeApi();
    api.listNotifications.mockResolvedValueOnce(page({ unreadCount: 1 }));
    api.markNotificationRead.mockRejectedValueOnce(
      new NotificationApiError(404, "notification_not_found"),
    );
    const store = createNotificationsStore({
      createApi: () => api,
      createResolver: fakeResolver,
    });
    store.setPrincipal(principal, authorize);
    await store.actions.refresh();
    await store.actions.markRead(notification().id);
    const state = store.getState();
    expect(state.unreadCount).toBe(1);
    expect(state.items[0]!.readAt).toBeNull();
    expect(state.error).toBe("not_found");
  });

  test("markRead() on an id already read locally never calls the API", async () => {
    const api = fakeApi();
    api.listNotifications.mockResolvedValueOnce(
      page({
        items: [notification({ readAt: "2026-01-01T00:00:00.000Z" })],
      }),
    );
    const store = createNotificationsStore({
      createApi: () => api,
      createResolver: fakeResolver,
    });
    store.setPrincipal(principal, authorize);
    await store.actions.refresh();
    await store.actions.markRead(notification().id);
    expect(api.markNotificationRead).not.toHaveBeenCalled();
  });

  test("markRead() for an id not present locally still best-effort calls N2 (push-tap handoff path)", async () => {
    const api = fakeApi();
    api.listNotifications.mockResolvedValueOnce(page());
    api.markNotificationRead.mockResolvedValueOnce(undefined);
    const store = createNotificationsStore({
      createApi: () => api,
      createResolver: fakeResolver,
    });
    store.setPrincipal(principal, authorize);
    await store.actions.refresh();
    await store.actions.markRead("99999999-9999-4999-8999-999999999999");
    expect(api.markNotificationRead).toHaveBeenCalledWith(
      "token",
      "99999999-9999-4999-8999-999999999999",
      expect.anything(),
    );
    // The locally-loaded item is untouched.
    expect(store.getState().items[0]!.readAt).toBeNull();
  });

  test("resolveDestination() delegates through authorize to the resolver", async () => {
    const resolver = fakeResolver();
    resolver.resolve.mockResolvedValueOnce({
      chatroomId: "conv-1",
      groupId: "group-1",
      kind: "main",
      status: "resolved",
      topicId: null,
    });
    const store = createNotificationsStore({
      createApi: fakeApi,
      createResolver: () => resolver,
    });
    store.setPrincipal(principal, authorize);
    const destination = await store.actions.resolveDestination("conv-1");
    expect(destination.status).toBe("resolved");
    expect(resolver.resolve).toHaveBeenCalledWith(
      "token",
      "conv-1",
      expect.anything(),
    );
  });

  test("resolveDestination() without an active principal resolves not_found instead of throwing", async () => {
    const store = createNotificationsStore({
      createApi: fakeApi,
      createResolver: fakeResolver,
    });
    await expect(store.actions.resolveDestination("conv-1")).resolves.toEqual({
      status: "not_found",
    });
  });

  test("setPrincipal() to a different account resets state and rebuilds the api", async () => {
    const apiA = fakeApi();
    apiA.listNotifications.mockResolvedValueOnce(page({ unreadCount: 5 }));
    const createApi = jest
      .fn()
      .mockReturnValueOnce(apiA)
      .mockReturnValue(fakeApi());
    const store = createNotificationsStore({
      createApi,
      createResolver: fakeResolver,
    });
    store.setPrincipal(principal, authorize);
    await store.actions.refresh();
    expect(store.getState().unreadCount).toBe(5);

    store.setPrincipal(otherPrincipal, authorize);
    expect(store.getState()).toEqual(initialNotificationsState());
    expect(createApi).toHaveBeenCalledTimes(2);
  });

  test("setPrincipal() with the same identity is a no-op (no state reset, no api rebuild)", async () => {
    const createApi = jest.fn().mockReturnValue(fakeApi());
    const store = createNotificationsStore({
      createApi,
      createResolver: fakeResolver,
    });
    store.setPrincipal(principal, authorize);
    store.setPrincipal({ ...principal }, authorize);
    expect(createApi).toHaveBeenCalledTimes(1);
  });

  test("subscribe()/dispose() stop delivering further notifications after unsubscribe or dispose", async () => {
    const api = fakeApi();
    api.listNotifications.mockResolvedValue(page());
    const store = createNotificationsStore({
      createApi: () => api,
      createResolver: fakeResolver,
    });
    store.setPrincipal(principal, authorize);
    const listener = jest.fn();
    const unsubscribe = store.subscribe(listener);
    await store.actions.refresh();
    expect(listener).toHaveBeenCalled();
    unsubscribe();
    listener.mockClear();
    await store.actions.refresh();
    expect(listener).not.toHaveBeenCalled();

    // dispose() resets to the initial state (one final notification, same
    // as any other setPrincipal(null) reset) before clearing all listeners.
    const listener2 = jest.fn();
    store.subscribe(listener2);
    store.dispose();
    expect(listener2).toHaveBeenCalledTimes(1);
    listener2.mockClear();
    store.setPrincipal(principal, authorize);
    expect(listener2).not.toHaveBeenCalled();
  });

  test("setPrincipal() with an invalid principal (missing authorize) leaves api unset", async () => {
    const store = createNotificationsStore({
      createApi: fakeApi,
      createResolver: fakeResolver,
    });
    store.setPrincipal(principal, null);
    await store.actions.refresh();
    expect(store.getState().status).toBe("idle");
  });

  test("AuthApiError from authorize maps to the same outcome vocabulary", async () => {
    const failingAuthorize: AuthorizedNotificationsRequest = () =>
      Promise.reject(new AuthApiError(401, "unauthorized"));
    const store = createNotificationsStore({
      createApi: fakeApi,
      createResolver: fakeResolver,
    });
    store.setPrincipal(principal, failingAuthorize);
    await store.actions.refresh();
    expect(store.getState().error).toBe("unauthorized");
  });
});
