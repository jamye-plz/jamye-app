import {
  NotificationApiError,
  createNotificationsApi,
} from "@/features/notifications/data/notifications-api";
import { parseRetryAfterSeconds } from "@/features/notifications/data/notifications-http";

const notificationId = "11111111-1111-4111-8111-111111111111";

const notificationWire = {
  args: { sender_display_name: "지민" },
  conversation_id: "22222222-2222-4222-8222-222222222222",
  created_at: "2026-09-16T00:00:00Z",
  id: notificationId,
  read_at: null,
  source_cursor: "12",
  topic_id: null,
  type: "chat_unread",
};

const errorEnvelope = (code: string) => ({
  error: {
    code,
    details: null,
    message: code,
    request_id: "33333333-3333-4333-8333-333333333333",
  },
});

describe("M12 notifications transport", () => {
  const originalFetch = globalThis.fetch;
  const fetchMock = jest.fn();
  const api = createNotificationsApi("https://api.example.com/");
  const reply = (
    status: number,
    value: unknown = null,
    retryAfter: string | null = null,
  ) => {
    const json = jest.fn().mockResolvedValue(value);
    fetchMock.mockResolvedValue({
      ok: status >= 200 && status < 300,
      status,
      json,
      headers: { get: () => retryAfter },
    });
    return json;
  };
  beforeEach(() => {
    globalThis.fetch = fetchMock;
    fetchMock.mockReset();
  });
  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  test("N1 lists notifications, maps the page, and keeps unread_count server-authoritative", async () => {
    reply(200, {
      items: [notificationWire],
      next_cursor: "cursor-1",
      unread_count: 3,
    });
    await expect(
      api.listNotifications("t", { after: "cursor-0", limit: 20 }),
    ).resolves.toEqual({
      items: [
        {
          args: { sender_display_name: "지민" },
          conversationId: "22222222-2222-4222-8222-222222222222",
          createdAt: "2026-09-16T00:00:00Z",
          id: notificationId,
          readAt: null,
          sourceCursor: "12",
          topicId: null,
          type: "chat_unread",
        },
      ],
      nextCursor: "cursor-1",
      unreadCount: 3,
    });
    const [url, init] = fetchMock.mock.calls[0];
    expect(new URL(url).pathname).toBe("/api/v1/notifications");
    expect(new URL(url).searchParams.get("after")).toBe("cursor-0");
    expect(new URL(url).searchParams.get("limit")).toBe("20");
    expect(init).toEqual(
      expect.objectContaining({
        credentials: "omit",
        redirect: "error",
        headers: expect.objectContaining({ Authorization: "Bearer t" }),
      }),
    );
  });

  test("N1 rejects limit outside 1..100 locally, without a network call", async () => {
    await expect(
      api.listNotifications("t", { limit: 0 }),
    ).rejects.toMatchObject({ code: "invalid_page_limit", status: 422 });
    await expect(
      api.listNotifications("t", { limit: 101 }),
    ).rejects.toMatchObject({ code: "invalid_page_limit", status: 422 });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  test("N1 surfaces a malformed 200 page as invalid_notification_page_response", async () => {
    reply(200, { items: [notificationWire], next_cursor: null });
    await expect(api.listNotifications("t", {})).rejects.toMatchObject({
      code: "invalid_notification_page_response",
      status: 502,
    });
  });

  test("N2 marks a notification read (204) and hits the exact path", async () => {
    reply(204, null);
    await expect(
      api.markNotificationRead("t", notificationId),
    ).resolves.toBeUndefined();
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe(
      `https://api.example.com/api/v1/notifications/${notificationId}/read`,
    );
    expect(init).toEqual(expect.objectContaining({ method: "POST" }));
  });

  test("N2 rejects a non-UUID id locally as invalid_identifier, without a network call", async () => {
    await expect(
      api.markNotificationRead("t", "not-a-uuid"),
    ).rejects.toMatchObject({ code: "invalid_identifier", status: 422 });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  test("N2 maps a 403 to notification_forbidden distinct from generic request_failed", async () => {
    reply(403, { error: { code: "forbidden" } });
    await expect(
      api.markNotificationRead("t", notificationId),
    ).rejects.toMatchObject({ code: "notification_forbidden", status: 403 });
  });

  test("N2 maps a 404 to notification_not_found distinct from generic request_failed", async () => {
    reply(404, { error: { code: "not_found" } });
    await expect(
      api.markNotificationRead("t", notificationId),
    ).rejects.toMatchObject({ code: "notification_not_found", status: 404 });
  });

  test("N2 leaves other error statuses as generic request_failed when no error envelope is present", async () => {
    reply(500, null);
    await expect(
      api.markNotificationRead("t", notificationId),
    ).rejects.toMatchObject({ code: "request_failed", status: 500 });
  });

  test("shared transport carries a numeric Retry-After only on 429", async () => {
    reply(429, errorEnvelope("rate_limited"), "30");
    await expect(
      api.markNotificationRead("t", notificationId),
    ).rejects.toMatchObject({
      code: "rate_limited",
      retryAfterSeconds: 30,
      status: 429,
    });

    reply(503, errorEnvelope("unavailable"), "30");
    await expect(
      api.markNotificationRead("t", notificationId),
    ).rejects.toMatchObject({ retryAfterSeconds: null, status: 503 });
  });

  test("shared transport ignores a non-numeric or unsafe Retry-After", async () => {
    reply(429, errorEnvelope("rate_limited"), "later");
    await expect(
      api.markNotificationRead("t", notificationId),
    ).rejects.toMatchObject({ retryAfterSeconds: null, status: 429 });
    expect(parseRetryAfterSeconds("99999999999999999999")).toBeNull();
    expect(parseRetryAfterSeconds(null)).toBeNull();
    expect(parseRetryAfterSeconds("12")).toBe(12);
  });

  test("shared transport passes a server error-envelope code through on unmapped statuses", async () => {
    reply(500, errorEnvelope("internal"));
    await expect(
      api.markNotificationRead("t", notificationId),
    ).rejects.toMatchObject({ code: "internal", status: 500 });
  });

  test("shared transport rejects an unexpected success status as invalid_response_status", async () => {
    reply(200, null);
    await expect(
      api.markNotificationRead("t", notificationId),
    ).rejects.toMatchObject({ code: "invalid_response_status", status: 502 });
  });

  test("shared transport maps a fetch failure to network_unavailable", async () => {
    fetchMock.mockRejectedValue(new TypeError("Network request failed"));
    await expect(
      api.markNotificationRead("t", notificationId),
    ).rejects.toMatchObject({ code: "network_unavailable", status: 0 });
  });

  test("shared transport maps a caller abort to request_cancelled without a network round-trip", async () => {
    const controller = new AbortController();
    controller.abort();
    await expect(
      api.markNotificationRead("t", notificationId, controller.signal),
    ).rejects.toMatchObject({ code: "request_cancelled", status: 0 });
  });

  test("markNotificationRead rejects/resolves are instances of NotificationApiError", async () => {
    reply(404, null);
    await expect(
      api.markNotificationRead("t", notificationId),
    ).rejects.toBeInstanceOf(NotificationApiError);
  });
});
