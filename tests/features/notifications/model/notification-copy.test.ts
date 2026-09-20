import type {
  NotificationArgs,
  NotificationType,
} from "@/core/contracts/server";
import { getNotificationCopy } from "@/features/notifications/model/notification-copy";

describe("getNotificationCopy", () => {
  test("new_topic renders the author display name", () => {
    const copy = getNotificationCopy("new_topic", {
      author_display_name: "은지",
    });
    expect(copy.title).toBe("새 주제 알림");
    expect(copy.body).toBe("은지님이 새 주제를 올렸습니다.");
  });

  test("chat_unread renders the sender display name", () => {
    const copy = getNotificationCopy("chat_unread", {
      sender_display_name: "민수",
    });
    expect(copy.title).toBe("새 메시지");
    expect(copy.body).toBe("민수님이 메시지를 보냈습니다.");
  });

  test("other renders a fixed, generic copy", () => {
    const copy = getNotificationCopy("other", { anything: "ignored" });
    expect(copy).toEqual({ body: "내용을 확인해 보세요.", title: "새 알림" });
  });

  test.each([
    ["missing key", {}],
    ["wrong type", { author_display_name: 42 }],
    ["blank string", { author_display_name: "   " }],
    ["null", { author_display_name: null }],
  ] as const)(
    "new_topic falls back to a generic body when args are malformed: %s",
    (_label, args) => {
      const copy = getNotificationCopy("new_topic", args as NotificationArgs);
      expect(copy.title).toBe("새 주제 알림");
      expect(copy.body).toBe("새 주제가 올라왔습니다.");
    },
  );

  test.each([
    ["missing key", {}],
    ["wrong type", { sender_display_name: true }],
  ] as const)(
    "chat_unread falls back to a generic body when args are malformed: %s",
    (_label, args) => {
      const copy = getNotificationCopy("chat_unread", args as NotificationArgs);
      expect(copy.title).toBe("새 메시지");
      expect(copy.body).toBe("새 메시지가 도착했습니다.");
    },
  );

  test("an unrecognized future type value never crashes and never leaks raw args", () => {
    const copy = getNotificationCopy(
      "unrecognized_future_type" as NotificationType,
      { secret: "should-not-appear", author_display_name: "은지" },
    );
    expect(copy).toEqual({ body: "내용을 확인해 보세요.", title: "새 알림" });
    expect(JSON.stringify(copy)).not.toContain("secret");
    expect(JSON.stringify(copy)).not.toContain("undefined");
  });
});
