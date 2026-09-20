import type { PushTapHandoff } from "@/features/notifications/platform/push-notifications-adapter";
import type { NotificationDestination } from "@/features/notifications/data/notification-destination-resolver";

/**
 * Pure orchestration for one tapped/cold-started push notification: parse ->
 * best-effort mark-read -> resolve destination -> a route to push, or an
 * `inaccessible`/`ignored` outcome. No React, no native module imports (the
 * adapter's plain-value `PushTapHandoff`/cold-start function are the only
 * platform-adjacent inputs, injected by the caller -- this file never
 * imports `expo-notifications` itself).
 */
// A true discriminated union (not one flat `pathname` union sharing a
// generic `params` record): each `pathname` literal is paired with its own
// exact param shape so `router.push(route)` matches expo-router's typed Href.
export type PushTapRoute =
  | Readonly<{
      pathname: "/groups/[groupId]/chatrooms/[chatroomId]";
      params: Readonly<{ groupId: string; chatroomId: string }>;
    }>
  | Readonly<{
      pathname: "/groups/[groupId]/topics/[topicId]";
      params: Readonly<{ groupId: string; topicId: string }>;
    }>;

export type PushTapOutcome =
  | Readonly<{ status: "navigate"; route: PushTapRoute }>
  | Readonly<{ status: "inaccessible" }>
  // Already handled (duplicate notification_id, e.g. cold-start + a warm tap
  // for the same notification, or the same cold-start check re-entering).
  | Readonly<{ status: "ignored" }>;

export type PushTapHandoffDeps = Readonly<{
  markRead: (notificationId: string) => Promise<void>;
  resolveDestination: (
    conversationId: string,
  ) => Promise<NotificationDestination>;
  getLastNotificationResponse: () => Promise<PushTapHandoff | null>;
}>;

function routeFor(destination: NotificationDestination): PushTapRoute | null {
  if (destination.status !== "resolved") return null;
  return destination.kind === "topic"
    ? {
        params: {
          groupId: destination.groupId,
          topicId: destination.topicId ?? "",
        },
        pathname: "/groups/[groupId]/topics/[topicId]",
      }
    : {
        params: {
          chatroomId: destination.chatroomId,
          groupId: destination.groupId,
        },
        pathname: "/groups/[groupId]/chatrooms/[chatroomId]",
      };
}

export function createPushTapHandoff(deps: PushTapHandoffDeps) {
  const seenNotificationIds = new Set<string>();
  let coldStartChecked = false;

  async function handle(handoff: PushTapHandoff): Promise<PushTapOutcome> {
    if (seenNotificationIds.has(handoff.notificationId))
      return { status: "ignored" };
    seenNotificationIds.add(handoff.notificationId);
    // Best-effort: a failed mark-read must never block routing to the
    // resolved destination (the user still tapped a real notification).
    await deps.markRead(handoff.notificationId).catch(() => {});
    const destination = await deps.resolveDestination(handoff.conversationId);
    const route = routeFor(destination);
    return route ? { route, status: "navigate" } : { status: "inaccessible" };
  }

  /**
   * Gated on the caller-supplied `isAuthReady` snapshot (taken at call time,
   * not read from a stored closure -- the caller owns observing session
   * changes) and runs at most once per instance (per app/session mount),
   * regardless of how many times or with what `isAuthReady` value a caller
   * invokes this again afterward.
   */
  async function checkColdStart(
    isAuthReady: boolean,
  ): Promise<PushTapOutcome | null> {
    if (coldStartChecked || !isAuthReady) return null;
    coldStartChecked = true;
    const handoff = await deps.getLastNotificationResponse();
    if (!handoff) return null;
    return handle(handoff);
  }

  return { checkColdStart, handle };
}

export type PushTapHandoffController = ReturnType<typeof createPushTapHandoff>;
