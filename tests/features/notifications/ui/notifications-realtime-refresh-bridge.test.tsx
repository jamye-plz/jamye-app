import { act, render } from "@testing-library/react-native";

import { NotificationsRealtimeRefreshBridge } from "@/features/notifications/ui/notifications-realtime-refresh-bridge";
import type { ChatSyncEvent } from "@/features/notifications/ui/notifications-realtime-refresh-bridge";
import type { NotificationsStore } from "@/features/notifications/model/notifications-store";
import type { ChatReadMarker } from "@/core/contracts/server";

function fakeNotificationsStore(): NotificationsStore {
  return {
    actions: { scheduleRefresh: jest.fn() },
  } as unknown as NotificationsStore;
}

function fakeMarker(lastReadCursor: string): ChatReadMarker {
  return {
    chatroomId: "11111111-1111-4111-8111-111111111111",
    lastReadCursor,
    updatedAt: "2026-09-30T00:00:00Z",
  };
}

function fakeSubscribeSync() {
  const listeners = new Set<(event: ChatSyncEvent) => void>();
  const unsubscribe = jest.fn();
  const subscribeSync = jest.fn((listener: (event: ChatSyncEvent) => void) => {
    listeners.add(listener);
    return unsubscribe;
  });
  return {
    subscribeSync,
    unsubscribe,
    emit: (event: ChatSyncEvent) =>
      listeners.forEach((listener) => listener(event)),
  };
}

describe("NotificationsRealtimeRefreshBridge", () => {
  test("E5/GROUPS-AC1: a realtime 'changed' sync event schedules a refresh", async () => {
    const store = fakeNotificationsStore();
    const sync = fakeSubscribeSync();
    const screen = await render(
      <NotificationsRealtimeRefreshBridge
        subscribeSync={sync.subscribeSync}
        readMarker={null}
        store={store}
      />,
    );
    await act(async () => sync.emit("changed"));
    expect(store.actions.scheduleRefresh).toHaveBeenCalledTimes(1);
    await screen.unmount();
    expect(sync.unsubscribe).toHaveBeenCalled();
  });

  test("does not schedule a refresh for 'connected'/'evicted' sync events", async () => {
    const store = fakeNotificationsStore();
    const sync = fakeSubscribeSync();
    const screen = await render(
      <NotificationsRealtimeRefreshBridge
        subscribeSync={sync.subscribeSync}
        readMarker={null}
        store={store}
      />,
    );
    await act(async () => {
      sync.emit("connected");
      sync.emit("evicted");
    });
    expect(store.actions.scheduleRefresh).not.toHaveBeenCalled();
    await screen.unmount();
  });

  test("E5/GROUPS-AC1: a successful read-marker update (a new marker) schedules a refresh", async () => {
    const store = fakeNotificationsStore();
    const sync = fakeSubscribeSync();
    const screen = await render(
      <NotificationsRealtimeRefreshBridge
        subscribeSync={sync.subscribeSync}
        readMarker={null}
        store={store}
      />,
    );
    expect(store.actions.scheduleRefresh).not.toHaveBeenCalled();
    await screen.rerender(
      <NotificationsRealtimeRefreshBridge
        subscribeSync={sync.subscribeSync}
        readMarker={fakeMarker("cursor-1")}
        store={store}
      />,
    );
    expect(store.actions.scheduleRefresh).toHaveBeenCalledTimes(1);
    await screen.rerender(
      <NotificationsRealtimeRefreshBridge
        subscribeSync={sync.subscribeSync}
        readMarker={fakeMarker("cursor-2")}
        store={store}
      />,
    );
    expect(store.actions.scheduleRefresh).toHaveBeenCalledTimes(2);
    await screen.unmount();
  });

  test("resetting the read marker back to null does not schedule an extra refresh", async () => {
    const store = fakeNotificationsStore();
    const sync = fakeSubscribeSync();
    const marker = fakeMarker("cursor-1");
    const screen = await render(
      <NotificationsRealtimeRefreshBridge
        subscribeSync={sync.subscribeSync}
        readMarker={marker}
        store={store}
      />,
    );
    expect(store.actions.scheduleRefresh).toHaveBeenCalledTimes(1);
    (store.actions.scheduleRefresh as jest.Mock).mockClear();
    await screen.rerender(
      <NotificationsRealtimeRefreshBridge
        subscribeSync={sync.subscribeSync}
        readMarker={null}
        store={store}
      />,
    );
    expect(store.actions.scheduleRefresh).not.toHaveBeenCalled();
    await screen.unmount();
  });
});
