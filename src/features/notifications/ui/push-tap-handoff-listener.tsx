import { useRouter } from "expo-router";
import { useCallback, useEffect, useRef, useState } from "react";

import { useSession } from "@/core/providers/session-provider";
import {
  getLastNotificationResponse as defaultGetLastNotificationResponse,
  onNotificationReceived as defaultOnNotificationReceived,
  onNotificationResponse as defaultOnNotificationResponse,
} from "@/features/notifications/platform/push-notifications-adapter";
import type { PushTapHandoff } from "@/features/notifications/platform/push-notifications-adapter";

import { notificationsStore as defaultNotificationsStore } from "../model/notifications-store";
import type { NotificationsStore } from "../model/notifications-store";
import { createPushTapHandoff } from "../model/push-tap-handoff";
import type { PushTapOutcome } from "../model/push-tap-handoff";

type Unsubscribe = () => void;

/**
 * Mounted once inside `AppProviders` (never per-screen). Binds the
 * notifications-store singleton to the session principal (the only
 * production caller of `store.setPrincipal`) and wires A2's adapter
 * listeners into A3's pure handoff model:
 *  - `onNotificationResponse` (warm/background tap) -> parse+resolve+navigate
 *  - `onNotificationReceived` (foreground receipt, no tap) -> `store.refresh()`
 *    so the group list's unread badge stays live even while no notifications
 *    screen is mounted (r2 completeness requirement).
 *  - `getLastNotificationResponse` (cold start) is checked once, only after
 *    `session.principal` is non-null (never while signed out/mid-restore).
 *
 * Never imports `expo-notifications` directly -- only this module's default
 * parameters reach into the platform adapter, and every default is
 * overridable by a test-supplied prop.
 */
export function PushTapHandoffListener({
  store = defaultNotificationsStore,
  onNotificationResponse = defaultOnNotificationResponse,
  onNotificationReceived = defaultOnNotificationReceived,
  getLastNotificationResponse = defaultGetLastNotificationResponse,
  createHandoff = createPushTapHandoff,
}: Readonly<{
  store?: NotificationsStore;
  onNotificationResponse?: (
    listener: (handoff: PushTapHandoff) => void,
  ) => Unsubscribe;
  onNotificationReceived?: (
    listener: (handoff: PushTapHandoff) => void,
  ) => Unsubscribe;
  getLastNotificationResponse?: () => Promise<PushTapHandoff | null>;
  createHandoff?: typeof createPushTapHandoff;
}> = {}) {
  const { principal, authorizedRequest } = useSession();
  const router = useRouter();
  // Bind the notifications-store singleton to the session identity. The
  // first bind happens synchronously during the first render (lazy
  // initializer, mirroring groups-provider.tsx) so screen effects that call
  // `store.actions.refresh()` in the same commit already see an authorized
  // store; later identity changes (sign-in, account switch, sign-out) rebind
  // through the effect below, and unmount clears the binding.
  const authorize = principal ? authorizedRequest : null;
  useState(() => {
    store.setPrincipal(principal, authorize);
    return null;
  });
  useEffect(() => {
    store.setPrincipal(principal, authorize);
  }, [store, principal, authorize]);
  useEffect(() => () => store.setPrincipal(null, null), [store]);
  const principalRef = useRef(principal);
  // Keep the "latest value" ref in sync after every commit (never during
  // render itself -- react-hooks/refs forbids that), so the async listener
  // callback below can read the current principal without depending on a
  // stale render-time closure.
  useEffect(() => {
    principalRef.current = principal;
  });

  // `useState`'s lazy initializer runs exactly once per mount, so the
  // controller (and its dedupe/cold-start-once state) is built a single
  // time. Its deps never close over a ref (react-hooks/refs forbids passing
  // a ref-derived closure into a function call during render) -- the
  // auth-ready snapshot for `checkColdStart` is instead passed as a plain
  // boolean argument at call time, below.
  const [controller] = useState(() =>
    createHandoff({
      getLastNotificationResponse,
      markRead: (notificationId) => store.actions.markRead(notificationId),
      resolveDestination: (conversationId) =>
        store.actions.resolveDestination(conversationId),
    }),
  );

  const applyOutcome = useCallback(
    (outcome: PushTapOutcome | null) => {
      if (outcome?.status === "navigate") router.push(outcome.route);
      // A tapped notification whose conversation is no longer reachable still
      // gets a visible response: open the inbox, where the row explains it.
      else if (outcome?.status === "inaccessible")
        router.push("/notifications");
    },
    [router],
  );

  useEffect(() => {
    const unsubscribeResponse = onNotificationResponse((handoff) => {
      // Never navigate while signed out or mid-restore, matching the same
      // gate `checkColdStart()` applies internally for cold-start handoffs.
      if (principalRef.current === null) return;
      void controller.handle(handoff).then(applyOutcome);
    });
    const unsubscribeReceived = onNotificationReceived(() => {
      void store.actions.refresh();
    });
    return () => {
      unsubscribeResponse();
      unsubscribeReceived();
    };
  }, [
    onNotificationResponse,
    onNotificationReceived,
    store,
    controller,
    applyOutcome,
  ]);

  useEffect(() => {
    void controller.checkColdStart(principal !== null).then(applyOutcome);
  }, [principal, controller, applyOutcome]);

  return null;
}
