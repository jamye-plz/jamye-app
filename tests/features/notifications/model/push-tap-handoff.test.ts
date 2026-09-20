import type { PushTapHandoff } from "@/features/notifications/platform/push-notifications-adapter";
import type { NotificationDestination } from "@/features/notifications/data/notification-destination-resolver";
import { createPushTapHandoff } from "@/features/notifications/model/push-tap-handoff";
import type { PushTapHandoffDeps } from "@/features/notifications/model/push-tap-handoff";

function handoff(overrides: Partial<PushTapHandoff> = {}): PushTapHandoff {
  return {
    conversationId: "conv-1",
    messageId: null,
    notificationId: "notif-1",
    type: "chat_unread",
    ...overrides,
  };
}
function resolved(
  overrides: Partial<
    Extract<NotificationDestination, { status: "resolved" }>
  > = {},
): NotificationDestination {
  return {
    chatroomId: "conv-1",
    groupId: "group-1",
    kind: "main",
    status: "resolved",
    topicId: null,
    ...overrides,
  };
}
function deps(overrides: Partial<PushTapHandoffDeps> = {}) {
  return {
    getLastNotificationResponse: jest.fn().mockResolvedValue(null),
    markRead: jest.fn().mockResolvedValue(undefined),
    resolveDestination: jest.fn().mockResolvedValue(resolved()),
    ...overrides,
  } as unknown as PushTapHandoffDeps & {
    markRead: jest.Mock;
    resolveDestination: jest.Mock;
    getLastNotificationResponse: jest.Mock;
  };
}

describe("createPushTapHandoff.handle", () => {
  test("marks read, resolves, and navigates to the main chatroom route", async () => {
    const d = deps();
    const controller = createPushTapHandoff(d);
    const outcome = await controller.handle(handoff());
    expect(d.markRead).toHaveBeenCalledWith("notif-1");
    expect(d.resolveDestination).toHaveBeenCalledWith("conv-1");
    expect(outcome).toEqual({
      route: {
        params: { chatroomId: "conv-1", groupId: "group-1" },
        pathname: "/groups/[groupId]/chatrooms/[chatroomId]",
      },
      status: "navigate",
    });
  });

  test("a chat notification in a topic conversation opens the topic's chatroom directly", async () => {
    const d = deps({
      resolveDestination: jest
        .fn()
        .mockResolvedValue(resolved({ kind: "topic", topicId: "topic-1" })),
    });
    const controller = createPushTapHandoff(d);
    const outcome = await controller.handle(handoff({ type: "chat_unread" }));
    expect(outcome).toEqual({
      route: {
        params: { chatroomId: "conv-1", groupId: "group-1" },
        pathname: "/groups/[groupId]/chatrooms/[chatroomId]",
      },
      status: "navigate",
    });
  });

  test("a new-topic notification opens the topic page", async () => {
    const d = deps({
      resolveDestination: jest
        .fn()
        .mockResolvedValue(resolved({ kind: "topic", topicId: "topic-1" })),
    });
    const controller = createPushTapHandoff(d);
    const outcome = await controller.handle(handoff({ type: "new_topic" }));
    expect(outcome).toEqual({
      route: {
        params: { groupId: "group-1", topicId: "topic-1" },
        pathname: "/groups/[groupId]/topics/[topicId]",
      },
      status: "navigate",
    });
  });

  test.each(["unauthorized", "not_found"] as const)(
    "reports inaccessible without navigating when the resolver says %s",
    async (status) => {
      const d = deps({
        resolveDestination: jest.fn().mockResolvedValue({ status }),
      });
      const controller = createPushTapHandoff(d);
      const outcome = await controller.handle(handoff());
      expect(outcome).toEqual({ status: "inaccessible" });
    },
  );

  test("markRead failure is swallowed (best-effort) and routing still proceeds", async () => {
    const d = deps({
      markRead: jest.fn().mockRejectedValue(new Error("boom")),
    });
    const controller = createPushTapHandoff(d);
    const outcome = await controller.handle(handoff());
    expect(outcome.status).toBe("navigate");
  });

  test("dedupes a repeated notification_id: the second call is ignored and has no side effects", async () => {
    const d = deps();
    const controller = createPushTapHandoff(d);
    await controller.handle(handoff());
    const outcome = await controller.handle(handoff());
    expect(outcome).toEqual({ status: "ignored" });
    expect(d.markRead).toHaveBeenCalledTimes(1);
    expect(d.resolveDestination).toHaveBeenCalledTimes(1);
  });

  test("two different notification ids are each handled independently", async () => {
    const d = deps();
    const controller = createPushTapHandoff(d);
    await controller.handle(handoff({ notificationId: "notif-1" }));
    await controller.handle(handoff({ notificationId: "notif-2" }));
    expect(d.markRead).toHaveBeenCalledTimes(2);
  });
});

describe("createPushTapHandoff.checkColdStart", () => {
  test("gated on the caller-supplied auth-ready snapshot: returns null and never calls the adapter when not ready", async () => {
    const d = deps();
    const controller = createPushTapHandoff(d);
    const outcome = await controller.checkColdStart(false);
    expect(outcome).toBeNull();
    expect(d.getLastNotificationResponse).not.toHaveBeenCalled();
  });

  test("resolves null when there was no cold-start response", async () => {
    const d = deps();
    const controller = createPushTapHandoff(d);
    const outcome = await controller.checkColdStart(true);
    expect(outcome).toBeNull();
    expect(d.getLastNotificationResponse).toHaveBeenCalledTimes(1);
  });

  test("delegates to handle() when a cold-start response exists", async () => {
    const d = deps({
      getLastNotificationResponse: jest.fn().mockResolvedValue(handoff()),
    });
    const controller = createPushTapHandoff(d);
    const outcome = await controller.checkColdStart(true);
    expect(outcome?.status).toBe("navigate");
    expect(d.markRead).toHaveBeenCalledWith("notif-1");
  });

  test("checks the adapter at most once even if called again while ready", async () => {
    const d = deps({
      getLastNotificationResponse: jest.fn().mockResolvedValue(handoff()),
    });
    const controller = createPushTapHandoff(d);
    await controller.checkColdStart(true);
    const second = await controller.checkColdStart(true);
    expect(second).toBeNull();
    expect(d.getLastNotificationResponse).toHaveBeenCalledTimes(1);
  });

  test("a cold-start handoff and a later warm tap for the same id are deduped", async () => {
    const d = deps({
      getLastNotificationResponse: jest.fn().mockResolvedValue(handoff()),
    });
    const controller = createPushTapHandoff(d);
    await controller.checkColdStart(true);
    const warm = await controller.handle(handoff());
    expect(warm).toEqual({ status: "ignored" });
    expect(d.markRead).toHaveBeenCalledTimes(1);
  });
});
