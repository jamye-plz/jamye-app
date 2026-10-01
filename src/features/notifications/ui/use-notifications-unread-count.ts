import { useEffect, useSyncExternalStore } from "react";
import { AppState } from "react-native";

import { notificationsStore as defaultNotificationsStore } from "../model/notifications-store";
import type { NotificationsStore } from "../model/notifications-store";

const FOREGROUND_REFRESH_INTERVAL_MS = 60000;

/**
 * Live unread count for the notifications tab badge (ADR 0009 D3).
 *
 * E5/C5/U3/GROUPS-AC1: this hook is mounted exactly once, at the tab
 * layout root (`(tabs)/_layout.tsx`), for as long as the badge is visible
 * -- effectively the whole signed-in app lifetime -- so it also owns two of
 * N1's scheduled-refresh triggers: AppState re-entering `active`, and a
 * 60-second interval that only runs while `active` (cleared the instant the
 * app backgrounds). Both call the store's debounced, single-flight
 * `scheduleRefresh()`, not `refresh()` directly. The remaining triggers
 * (notifications/groups tab focus, topic.deleted) are wired at their own
 * existing call sites.
 */
export function useNotificationsUnreadCount(
  store: NotificationsStore = defaultNotificationsStore,
): number {
  useEffect(() => {
    let interval: ReturnType<typeof setInterval> | null = null;
    const startInterval = () => {
      if (interval !== null) return;
      interval = setInterval(() => {
        store.actions.scheduleRefresh();
      }, FOREGROUND_REFRESH_INTERVAL_MS);
    };
    const stopInterval = () => {
      if (interval === null) return;
      clearInterval(interval);
      interval = null;
    };
    if (AppState.currentState === "active") startInterval();
    const subscription = AppState.addEventListener("change", (next) => {
      if (next === "active") {
        store.actions.scheduleRefresh();
        startInterval();
      } else {
        stopInterval();
      }
    });
    return () => {
      stopInterval();
      subscription.remove();
    };
  }, [store]);
  return useSyncExternalStore(store.subscribe, store.getState, store.getState)
    .unreadCount;
}
