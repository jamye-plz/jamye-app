import type {
  NotificationArgs,
  NotificationType,
} from "@/core/contracts/server";
import {
  getNotificationContextLine,
  getNotificationCopy,
  getNotificationKind,
} from "@/features/notifications/model/notification-copy";

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

describe("getNotificationKind", () => {
  test.each([
    ["new_topic", "newTopic"],
    ["chat_unread", "newMessage"],
    ["other", "other"],
    ["unrecognized_future_type", "other"],
  ] as const)("%s -> %s", (type, expected) => {
    expect(getNotificationKind(type as NotificationType)).toBe(expected);
  });
});

describe("getNotificationContextLine (N3/S1/E5)", () => {
  test("group name and topic title render as 'group · topic'", () => {
    expect(
      getNotificationContextLine({
        group_name: "우리 그룹",
        topic_title: "주말 모임",
      }),
    ).toBe("우리 그룹 · 주말 모임");
  });

  test("group name alone renders without the topic separator", () => {
    expect(getNotificationContextLine({ group_name: "우리 그룹" })).toBe(
      "우리 그룹",
    );
  });

  test.each([
    ["missing group_name", {}],
    ["non-string group_name", { group_name: 42 }],
    ["null group_name", { group_name: null }],
  ] as const)("no line when %s (E5)", (_label, args) => {
    expect(getNotificationContextLine(args as NotificationArgs)).toBeNull();
  });

  test("a non-string topic_title is dropped but the group name still renders (E5)", () => {
    expect(
      getNotificationContextLine({
        group_name: "우리 그룹",
        topic_title: 42,
      } as unknown as NotificationArgs),
    ).toBe("우리 그룹");
  });
});
