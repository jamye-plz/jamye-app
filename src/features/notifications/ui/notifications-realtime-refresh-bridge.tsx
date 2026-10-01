import { useEffect } from "react";

import type { ChatReadMarker } from "@/core/contracts/server";

import { notificationsStore as defaultNotificationsStore } from "../model/notifications-store";
import type { NotificationsStore } from "../model/notifications-store";

export type ChatSyncEvent = "changed" | "connected" | "evicted";

/**
 * E5/C5/U3/GROUPS-AC1: the two remaining scheduled-refresh triggers this
 * badge needs, beyond `useNotificationsUnreadCount`'s AppState-active/60s
 * interval and the existing tab-focus/`topic.deleted` call sites --
 *  - realtime `message.created`/`topic.created`: folded into the connected
 *    chat store's broad "changed" sync signal, the same fan-out
 *    `topics-provider.tsx`'s own `subscribeSync` listener already consumes
 *    for `store.actions.signal()` (`connected-chat-store.ts`'s `onChanged`
 *    fires that event for every durably-applied delta, message and topic
 *    creates included).
 *  - a successful chat read-marker update: `readMarker` only changes
 *    reference on `createConnectedChatRead`'s `mark()` success path inside
 *    `connected-chat-store.ts` (a room-close reset or a failed attempt both
 *    leave the previous marker object untouched), so a reference change
 *    here is exactly "a read marker update just succeeded".
 * Both call the store's debounced, single-flight `scheduleRefresh()`, never
 * `refresh()` directly. Mounted inside `ConnectedChatProvider`'s subtree by
 * `app-providers.tsx`'s `TopicsStoreBridge`, which already holds
 * `useConnectedChat()`'s value for its own `watchGroup`/`subscribeSync`
 * props -- this reuses that same context read instead of adding a second
 * `useConnectedChat()` consumer.
 */
export function NotificationsRealtimeRefreshBridge({
  subscribeSync,
  readMarker,
  store = defaultNotificationsStore,
}: Readonly<{
  subscribeSync: (listener: (event: ChatSyncEvent) => void) => () => void;
  readMarker: ChatReadMarker | null;
  store?: NotificationsStore;
}>) {
  useEffect(
    () =>
      subscribeSync((event) => {
        if (event === "changed") store.actions.scheduleRefresh();
      }),
    [subscribeSync, store],
  );
  useEffect(() => {
    if (readMarker !== null) store.actions.scheduleRefresh();
  }, [readMarker, store]);
  return null;
}
