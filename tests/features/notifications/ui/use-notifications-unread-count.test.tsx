import { act, render } from "@testing-library/react-native";
import { AppState, Text } from "react-native";
import { useNotificationsUnreadCount } from "@/features/notifications/ui/use-notifications-unread-count";
import type { NotificationsStore } from "@/features/notifications/model/notifications-store";
import { initialNotificationsState } from "@/features/notifications/model/notifications-store";

// Spying on the real singleton's method (rather than `jest.mock("react-native",
// ...)`, which breaks jest-expo's own setup -- it needs the real module
// identity, not a re-spread copy) keeps every other RN internal untouched.
let appStateListener: ((state: string) => void) | null = null;
const mockAppStateAddEventListener = jest
  .spyOn(AppState, "addEventListener")
  .mockImplementation((_event, listener) => {
    appStateListener = listener as (state: string) => void;
    return { remove: jest.fn() } as ReturnType<
      typeof AppState.addEventListener
    >;
  });

function fakeStore(unreadCount: number) {
  let state = { ...initialNotificationsState(), unreadCount };
  const listeners = new Set<() => void>();
  const store = {
    actions: { scheduleRefresh: jest.fn() },
    subscribe: (listener: () => void) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    getState: () => state,
    set(next: number) {
      state = { ...state, unreadCount: next };
      listeners.forEach((listener) => listener());
    },
  };
  return store;
}

function Probe({ store }: Readonly<{ store: NotificationsStore }>) {
  return <Text testID="count">{useNotificationsUnreadCount(store)}</Text>;
}

beforeEach(() => {
  appStateListener = null;
  mockAppStateAddEventListener.mockClear();
});

describe("useNotificationsUnreadCount", () => {
  test("reads the live unread count from the store and follows updates", async () => {
    const store = fakeStore(2);
    const screen = await render(
      <Probe store={store as unknown as NotificationsStore} />,
    );
    expect(screen.getByTestId("count").props.children).toBe(2);
    await act(async () => {
      store.set(5);
    });
    expect(screen.getByTestId("count").props.children).toBe(5);
    await screen.unmount();
  });

  test("E5/C5/GROUPS-AC1: an AppState transition to 'active' schedules a refresh", async () => {
    const store = fakeStore(0);
    const screen = await render(
      <Probe store={store as unknown as NotificationsStore} />,
    );
    expect(mockAppStateAddEventListener).toHaveBeenCalledWith(
      "change",
      expect.any(Function),
    );
    store.actions.scheduleRefresh.mockClear();
    await act(async () => appStateListener?.("active"));
    expect(store.actions.scheduleRefresh).toHaveBeenCalledTimes(1);
    await act(async () => appStateListener?.("background"));
    expect(store.actions.scheduleRefresh).toHaveBeenCalledTimes(1);
    await screen.unmount();
  });

  test("E5/C5/GROUPS-AC1: schedules a refresh every 60s while active, and stops on background", async () => {
    jest.useFakeTimers();
    try {
      const store = fakeStore(0);
      const screen = await render(
        <Probe store={store as unknown as NotificationsStore} />,
      );
      store.actions.scheduleRefresh.mockClear();
      await act(async () => appStateListener?.("active"));
      store.actions.scheduleRefresh.mockClear();
      await act(async () => {
        await jest.advanceTimersByTimeAsync(60000);
      });
      expect(store.actions.scheduleRefresh).toHaveBeenCalledTimes(1);
      await act(async () => {
        await jest.advanceTimersByTimeAsync(60000);
      });
      expect(store.actions.scheduleRefresh).toHaveBeenCalledTimes(2);
      await act(async () => appStateListener?.("background"));
      store.actions.scheduleRefresh.mockClear();
      await act(async () => {
        await jest.advanceTimersByTimeAsync(120000);
      });
      expect(store.actions.scheduleRefresh).not.toHaveBeenCalled();
      await screen.unmount();
    } finally {
      jest.useRealTimers();
    }
  });
});
