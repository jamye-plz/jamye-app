import { AuthApiError } from "@/core/auth/auth-api";
import { parsePublicApiOrigin } from "@/core/config/public-env";
import type { Notification } from "@/core/contracts/server";
import { createChatApi } from "@/features/chat/data/chat-api";
import { createGroupsApi } from "@/features/groups/data/groups-api";
import { createNotificationDestinationResolver } from "../data/notification-destination-resolver";
import type {
  CachedChatroomLocation,
  LocalChatroomCachePort,
  NotificationDestination,
  NotificationDestinationResolver,
} from "../data/notification-destination-resolver";
import {
  createNotificationsApi,
  NotificationApiError,
} from "../data/notifications-api";
import type { NotificationsApi } from "../data/notifications-api";

export type NotificationsListStatus = "idle" | "loading" | "ready" | "error";
export type NotificationsErrorOutcome =
  | "network"
  | "unauthorized"
  | "forbidden"
  | "not_found"
  | "validation"
  | "invalid_response"
  | "unavailable"
  | "unknown";

export type NotificationsState = Readonly<{
  status: NotificationsListStatus;
  items: readonly Notification[];
  nextCursor: string | null;
  unreadCount: number;
  loadingMore: boolean;
  error: NotificationsErrorOutcome | null;
}>;

export function initialNotificationsState(): NotificationsState {
  return {
    error: null,
    items: [],
    loadingMore: false,
    nextCursor: null,
    status: "idle",
    unreadCount: 0,
  };
}

export type NotificationsPrincipal = Readonly<{
  origin: string;
  userId: string;
  epoch: number;
}>;

/** Only adapters/composition supply this callback; views consume store actions. */
export type AuthorizedNotificationsRequest = <T>(
  execute: (token: string, signal: AbortSignal) => Promise<T>,
  signal?: AbortSignal,
) => Promise<T>;

export type NotificationsStoreActions = Readonly<{
  refresh: () => Promise<void>;
  loadMore: () => Promise<void>;
  markRead: (notificationId: string) => Promise<void>;
  resolveDestination: (
    conversationId: string,
  ) => Promise<NotificationDestination>;
}>;

export type NotificationsStore = Readonly<{
  getState: () => NotificationsState;
  setPrincipal: (
    principal: NotificationsPrincipal | null,
    authorize: AuthorizedNotificationsRequest | null,
  ) => void;
  subscribe: (listener: () => void) => () => void;
  dispose: () => void;
  actions: NotificationsStoreActions;
}>;

function outcome(error: unknown): NotificationsErrorOutcome {
  if (error instanceof NotificationApiError) {
    if (error.code === "notification_forbidden") return "forbidden";
    if (error.code === "notification_not_found") return "not_found";
    if (error.status === 0 || error.status === 408) return "network";
    if (error.status === 401) return "unauthorized";
    if (error.status === 422) return "validation";
    if (error.status === 502) return "invalid_response";
    if (error.status >= 500) return "unavailable";
  }
  if (error instanceof AuthApiError) {
    if (error.status === 0 || error.status === 408) return "network";
    if (error.status === 401) return "unauthorized";
    if (error.status >= 500) return "unavailable";
  }
  return "unknown";
}

function mergeUnique(items: readonly Notification[]): readonly Notification[] {
  const result = new Map<string, Notification>();
  for (const item of items) result.set(item.id, item);
  return [...result.values()];
}

export type NotificationsStoreDeps = Readonly<{
  createApi: (origin: string) => NotificationsApi;
  createResolver: (origin: string) => NotificationDestinationResolver;
}>;

/** Singleton belongs to one principal/epoch at a time; `setPrincipal` resets
 * all in-memory list/read state on every account change (device-scoped
 * process, account-scoped data). */
export function createNotificationsStore(
  deps: NotificationsStoreDeps,
): NotificationsStore {
  let identity = "";
  let api: NotificationsApi | null = null;
  let resolver: NotificationDestinationResolver | null = null;
  let authorize: AuthorizedNotificationsRequest | null = null;
  let state = initialNotificationsState();
  const listeners = new Set<() => void>();
  const requests = new Map<string, AbortController>();

  function publish(next: NotificationsState): void {
    state = next;
    listeners.forEach((listener) => listener());
  }
  function cancel(key: string): void {
    requests.get(key)?.abort();
    requests.delete(key);
  }
  function cancelAll(): void {
    for (const key of [...requests.keys()]) cancel(key);
  }
  function begin(key: string) {
    if (!api || !authorize) return null;
    cancel(key);
    const controller = new AbortController();
    requests.set(key, controller);
    const currentAuthorize = authorize;
    return {
      current: () =>
        requests.get(key) === controller && !controller.signal.aborted,
      finish() {
        if (requests.get(key) === controller) requests.delete(key);
      },
      run<T>(
        execute: (token: string, signal: AbortSignal) => Promise<T>,
      ): Promise<T> {
        return currentAuthorize(execute, controller.signal);
      },
    };
  }

  function setPrincipal(
    next: NotificationsPrincipal | null,
    executor: AuthorizedNotificationsRequest | null,
  ): void {
    const origin = next ? parsePublicApiOrigin(next.origin) : "";
    const valid = Boolean(
      next &&
      executor &&
      next.userId.length > 0 &&
      Number.isSafeInteger(next.epoch),
    );
    const key = valid
      ? JSON.stringify([origin, next!.userId, next!.epoch])
      : "";
    authorize = valid ? executor : null;
    if (key === identity) return;
    cancelAll();
    identity = key;
    api = valid ? deps.createApi(origin) : null;
    resolver = valid ? deps.createResolver(origin) : null;
    publish(initialNotificationsState());
  }

  async function refresh(): Promise<void> {
    const ticket = begin("list");
    if (!ticket) return;
    publish({ ...state, error: null, loadingMore: false, status: "loading" });
    try {
      const page = await ticket.run((token, signal) =>
        api!.listNotifications(token, {}, signal),
      );
      if (!ticket.current()) return;
      publish({
        error: null,
        items: page.items,
        loadingMore: false,
        nextCursor: page.nextCursor,
        status: "ready",
        unreadCount: page.unreadCount,
      });
    } catch (error) {
      if (!ticket.current()) return;
      publish({
        ...state,
        error: outcome(error),
        loadingMore: false,
        status: state.items.length ? "ready" : "error",
      });
    } finally {
      ticket.finish();
    }
  }

  async function loadMore(): Promise<void> {
    if (
      state.status !== "ready" ||
      state.loadingMore ||
      state.nextCursor === null
    )
      return;
    const ticket = begin("list");
    if (!ticket) return;
    const after = state.nextCursor;
    publish({ ...state, error: null, loadingMore: true });
    try {
      const page = await ticket.run((token, signal) =>
        api!.listNotifications(token, { after }, signal),
      );
      if (!ticket.current()) return;
      publish({
        error: null,
        items: mergeUnique([...state.items, ...page.items]),
        loadingMore: false,
        nextCursor: page.nextCursor,
        status: "ready",
        unreadCount: page.unreadCount,
      });
    } catch (error) {
      if (!ticket.current()) return;
      publish({ ...state, error: outcome(error), loadingMore: false });
    } finally {
      ticket.finish();
    }
  }

  async function markRead(notificationId: string): Promise<void> {
    const target = state.items.find((item) => item.id === notificationId);
    if (target && target.readAt !== null) return;
    const previousItems = state.items;
    const previousUnread = state.unreadCount;
    if (target) {
      publish({
        ...state,
        items: state.items.map((item) =>
          item.id === notificationId
            ? { ...item, readAt: new Date().toISOString() }
            : item,
        ),
        unreadCount: Math.max(0, state.unreadCount - 1),
      });
    }
    const ticket = begin(`read:${notificationId}`);
    if (!ticket) {
      // No active principal/api: nothing to call, and nothing to keep
      // optimistically -- revert any local mutation above.
      if (target)
        publish({
          ...state,
          items: previousItems,
          unreadCount: previousUnread,
        });
      return;
    }
    try {
      await ticket.run((token, signal) =>
        api!.markNotificationRead(token, notificationId, signal),
      );
    } catch (error) {
      if (!ticket.current()) return;
      publish(
        target
          ? {
              ...state,
              error: outcome(error),
              items: previousItems,
              unreadCount: previousUnread,
            }
          : { ...state, error: outcome(error) },
      );
    } finally {
      ticket.finish();
    }
  }

  async function resolveDestination(
    conversationId: string,
  ): Promise<NotificationDestination> {
    if (!resolver || !authorize) return { status: "not_found" };
    const currentResolver = resolver;
    const currentAuthorize = authorize;
    return currentAuthorize((token, signal) =>
      currentResolver.resolve(token, conversationId, signal),
    );
  }

  return {
    actions: { loadMore, markRead, refresh, resolveDestination },
    dispose() {
      setPrincipal(null, null);
      listeners.clear();
    },
    getState: () => state,
    setPrincipal,
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}

/**
 * In-process-memory-only `LocalChatroomCachePort`: satisfies the resolver's
 * cache seam without touching the real account-scoped SQLite
 * `connected_chatrooms` table (out of this task's file scope; flagged as a
 * risk by A1). Resets naturally on every `setPrincipal` identity change
 * (a fresh cache per account/origin, never a cross-account leak), and the
 * resolver's own cache-miss fallback (G2+C1 scan) keeps correctness even
 * with an empty cache after every app restart -- only the "no network call
 * on a warm cache hit" optimization is unavailable across restarts.
 */
function createInMemoryChatroomCache(): LocalChatroomCachePort {
  const cache = new Map<string, CachedChatroomLocation>();
  return {
    async findByChatroomId(chatroomId) {
      return cache.get(chatroomId) ?? null;
    },
    async upsertChatroom(location) {
      cache.set(location.chatroomId, location);
    },
  };
}

function createDefaultNotificationsResolver(
  origin: string,
): NotificationDestinationResolver {
  return createNotificationDestinationResolver(
    createInMemoryChatroomCache(),
    createChatApi(origin),
    createGroupsApi(origin),
  );
}

/**
 * App-wide production singleton, mirroring the `installationIdStore`
 * precedent (`platform/installation-id-store.ts`): registering the store's
 * factories here has no eager side effect (no fetch client is built until a
 * real principal reaches `setPrincipal`), so importing this module is safe
 * everywhere, including from tests that only exercise `createNotificationsStore`
 * directly with fakes. `push-tap-handoff-listener.tsx` drives `setPrincipal`
 * on every session change; `group-list-screen.tsx` and
 * `notifications-inbox-screen.tsx` read live state via
 * `useSyncExternalStore(notificationsStore.subscribe, notificationsStore.getState)`.
 */
export const notificationsStore: NotificationsStore = createNotificationsStore({
  createApi: createNotificationsApi,
  createResolver: createDefaultNotificationsResolver,
});
