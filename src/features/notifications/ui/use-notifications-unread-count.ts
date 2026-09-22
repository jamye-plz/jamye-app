import { useSyncExternalStore } from "react";

import { notificationsStore as defaultNotificationsStore } from "../model/notifications-store";
import type { NotificationsStore } from "../model/notifications-store";

/** Live unread count for the notifications tab badge (ADR 0009 D3). */
export function useNotificationsUnreadCount(
  store: NotificationsStore = defaultNotificationsStore,
): number {
  return useSyncExternalStore(store.subscribe, store.getState, store.getState)
    .unreadCount;
}
