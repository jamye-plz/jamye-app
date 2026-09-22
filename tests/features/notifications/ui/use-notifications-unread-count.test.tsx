import { act, render } from "@testing-library/react-native";
import { Text } from "react-native";
import { useNotificationsUnreadCount } from "@/features/notifications/ui/use-notifications-unread-count";
import type { NotificationsStore } from "@/features/notifications/model/notifications-store";
import { initialNotificationsState } from "@/features/notifications/model/notifications-store";

function fakeStore(unreadCount: number) {
  let state = { ...initialNotificationsState(), unreadCount };
  const listeners = new Set<() => void>();
  const store = {
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
  });
});
