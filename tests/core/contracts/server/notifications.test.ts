import {
  mapNotification,
  mapNotificationPage,
  validateNotification,
  validateNotificationPage,
} from "@/core/contracts/server";

const id = "11111111-1111-4111-8111-111111111111";
const conversationId = "22222222-2222-4222-8222-222222222222";
const topicId = "33333333-3333-4333-8333-333333333333";

const notificationWire = {
  args: { sender_display_name: "지민" },
  conversation_id: conversationId,
  created_at: "2026-09-16T00:00:00Z",
  id,
  read_at: null,
  source_cursor: "12",
  topic_id: null,
  type: "chat_unread",
};

describe("M12 Notification/NotificationPage wire contract", () => {
  test("N1 validateNotification accepts a valid chat_unread row with a single sender_display_name key", () => {
    expect(validateNotification(notificationWire)).toBe(true);
  });

  test("N1 validateNotification accepts a valid new_topic row with a single author_display_name key", () => {
    expect(
      validateNotification({
        ...notificationWire,
        args: { author_display_name: "수아" },
        conversation_id: null,
        topic_id: topicId,
        type: "new_topic",
      }),
    ).toBe(true);
  });

  test("N1 validateNotification accepts type=other and rejects unknown types/extra properties", () => {
    expect(
      validateNotification({ ...notificationWire, args: {}, type: "other" }),
    ).toBe(true);
    expect(
      validateNotification({ ...notificationWire, type: "unknown_type" }),
    ).toBe(false);
    expect(validateNotification({ ...notificationWire, extra: "nope" })).toBe(
      false,
    );
  });

  test("N1 validateNotification rejects a missing required field", () => {
    const { read_at: _readAt, ...withoutReadAt } = notificationWire;
    expect(validateNotification(withoutReadAt)).toBe(false);
  });

  test("N1 mapNotification maps to camelCase and preserves null defaults verbatim", () => {
    expect(mapNotification(notificationWire as never)).toEqual({
      args: { sender_display_name: "지민" },
      conversationId,
      createdAt: "2026-09-16T00:00:00Z",
      id,
      readAt: null,
      sourceCursor: "12",
      topicId: null,
      type: "chat_unread",
    });
  });

  test("N1 validateNotificationPage/mapNotificationPage round-trip and never locally aggregate unread_count", () => {
    const page = {
      items: [notificationWire],
      next_cursor: "cursor-1",
      unread_count: 4,
    };
    expect(validateNotificationPage(page)).toBe(true);
    expect(mapNotificationPage(page as never)).toEqual({
      items: [mapNotification(notificationWire as never)],
      nextCursor: "cursor-1",
      unreadCount: 4,
    });
  });

  test("N1 validateNotificationPage rejects a negative unread_count", () => {
    expect(
      validateNotificationPage({
        items: [],
        next_cursor: null,
        unread_count: -1,
      }),
    ).toBe(false);
  });
});
