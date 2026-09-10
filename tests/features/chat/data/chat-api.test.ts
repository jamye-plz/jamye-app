import { createChatApi } from "@/features/chat/data/chat-api";
import {
  canonicalMessage,
  canonicalMessageWire,
  chatMessage,
  chatMessageWire,
  chatroom,
  chatroomId,
  chatroomWire,
  clientMessageId,
  groupId,
  readMarker,
  readMarkerWire,
} from "../chat-api-fixtures";

describe("M8 chat transport", () => {
  const originalFetch = globalThis.fetch;
  const fetchMock = jest.fn();
  const api = createChatApi("https://api.example.com/");
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
    jest.useRealTimers();
  });

  test("C1 lists group chatrooms, retains the opaque after cursor and exact path", async () => {
    const cursor = "a+/=%? &끝";
    reply(200, { items: [chatroomWire], next_cursor: cursor });
    await expect(
      api.listGroupChatrooms("t", groupId, { after: cursor, limit: 30 }),
    ).resolves.toEqual({ items: [chatroom], nextCursor: cursor });
    const [url, init] = fetchMock.mock.calls[0];
    expect(new URL(url).pathname).toBe(`/api/v1/groups/${groupId}/chatrooms`);
    expect(new URL(url).searchParams.get("after")).toBe(cursor);
    expect(new URL(url).searchParams.get("limit")).toBe("30");
    expect(init).toEqual(
      expect.objectContaining({
        credentials: "omit",
        redirect: "error",
        headers: expect.objectContaining({ Authorization: "Bearer t" }),
      }),
    );
  });

  test("C2 lists chatroom history, retains the opaque before cursor and raw sub-ms timestamp", async () => {
    const cursor = "older-token";
    reply(200, { items: [chatMessageWire], next_cursor: cursor });
    await expect(
      api.listChatroomMessages("t", chatroomId, { before: cursor }),
    ).resolves.toEqual({ items: [chatMessage], nextCursor: cursor });
    expect(chatMessage.createdAt).toBe("2024-01-01T00:00:00.123456Z");
    const [url] = fetchMock.mock.calls[0];
    expect(new URL(url).pathname).toBe(
      `/api/v1/chatrooms/${chatroomId}/messages`,
    );
    expect(new URL(url).searchParams.get("before")).toBe(cursor);
  });

  test("C4 sends a text message with a matching Idempotency-Key and distinguishes 201 new from 200 retry", async () => {
    reply(201, canonicalMessageWire);
    await expect(
      api.sendChatMessage("t", chatroomId, {
        body: "안녕하세요",
        clientMessageId,
      }),
    ).resolves.toEqual({ message: canonicalMessage, status: 201 });
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe(
      `https://api.example.com/api/v1/chatrooms/${chatroomId}/messages`,
    );
    expect(init).toEqual(
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({
          body: "안녕하세요",
          client_msg_id: clientMessageId,
        }),
        headers: expect.objectContaining({
          "Idempotency-Key": clientMessageId,
        }),
      }),
    );

    reply(200, canonicalMessageWire);
    await expect(
      api.sendChatMessage("t", chatroomId, {
        body: "안녕하세요",
        clientMessageId,
      }),
    ).resolves.toEqual({ message: canonicalMessage, status: 200 });
  });

  test("C4 preserves whitespace, newlines and emoji in the body without trimming", async () => {
    const body = "  줄바꿈\n포함 😀  ";
    reply(201, { ...canonicalMessageWire, body });
    await expect(
      api.sendChatMessage("t", chatroomId, { body, clientMessageId }),
    ).resolves.toEqual({
      message: { ...canonicalMessage, body },
      status: 201,
    });
    expect(fetchMock.mock.calls[0][1].body).toBe(
      JSON.stringify({ body, client_msg_id: clientMessageId }),
    );
  });

  test("C4 surfaces 409 as a visible conflict rather than reminting a new id", async () => {
    reply(409, {
      error: {
        code: "idempotency_conflict",
        details: null,
        message: "must not leak",
        request_id: "77777777-7777-4777-8777-777777777777",
      },
    });
    await expect(
      api.sendChatMessage("t", chatroomId, {
        body: "다른 본문",
        clientMessageId,
      }),
    ).rejects.toMatchObject({ status: 409, code: "idempotency_conflict" });
  });

  test("C3 marks a chatroom read with the existing cursor anchor and returns the opaque last_read_cursor string", async () => {
    reply(200, readMarkerWire);
    await expect(
      api.markChatroomRead("t", chatroomId, { cursor: "42" }),
    ).resolves.toEqual(readMarker);
    expect(typeof readMarker.lastReadCursor).toBe("string");
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe(
      `https://api.example.com/api/v1/chatrooms/${chatroomId}/read`,
    );
    expect(init.body).toBe(JSON.stringify({ cursor: "42" }));
  });

  test("C3 rejects a non-positive-decimal cursor before IO", async () => {
    await expect(
      api.markChatroomRead("t", chatroomId, { cursor: "0" }),
    ).rejects.toMatchObject({ status: 422 });
    await expect(
      api.markChatroomRead("t", chatroomId, { cursor: "-1" }),
    ).rejects.toMatchObject({ status: 422 });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  test.each([0, 101, 1.5])(
    "rejects invalid page limit %s before IO",
    async (limit) => {
      await expect(
        api.listGroupChatrooms("t", groupId, { limit }),
      ).rejects.toMatchObject({ status: 422 });
      await expect(
        api.listChatroomMessages("t", chatroomId, { limit }),
      ).rejects.toMatchObject({ status: 422 });
      expect(fetchMock).not.toHaveBeenCalled();
    },
  );

  test.each(["..", "../groups", "not-a-uuid"])(
    "rejects malformed ids %s before IO",
    async (id) => {
      await expect(api.listGroupChatrooms("t", id, {})).rejects.toMatchObject({
        status: 422,
      });
      await expect(api.listChatroomMessages("t", id, {})).rejects.toMatchObject(
        { status: 422 },
      );
      await expect(
        api.markChatroomRead("t", id, { cursor: "1" }),
      ).rejects.toMatchObject({ status: 422 });
      await expect(
        api.sendChatMessage("t", id, { body: "x", clientMessageId }),
      ).rejects.toMatchObject({ status: 422 });
      expect(fetchMock).not.toHaveBeenCalled();
    },
  );

  test("rejects an empty send body before IO", async () => {
    await expect(
      api.sendChatMessage("t", chatroomId, { body: "", clientMessageId }),
    ).rejects.toMatchObject({ status: 422 });
    await expect(
      api.sendChatMessage("t", chatroomId, {
        body: "본문",
        clientMessageId: "not-a-uuid",
      }),
    ).rejects.toMatchObject({ status: 422 });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  test("preserves 403 membership_required, 429 Retry-After and 503 dependency error codes", async () => {
    reply(403, {
      error: {
        code: "membership_required",
        details: null,
        message: "must not leak",
        request_id: "77777777-7777-4777-8777-777777777777",
      },
    });
    await expect(
      api.listGroupChatrooms("t", groupId, {}),
    ).rejects.toMatchObject({ status: 403, code: "membership_required" });

    reply(
      429,
      {
        error: {
          code: "rate_limit_exceeded",
          details: null,
          message: "must not leak",
          request_id: "77777777-7777-4777-8777-777777777777",
        },
      },
      "7",
    );
    await expect(
      api.listChatroomMessages("t", chatroomId, {}),
    ).rejects.toMatchObject({ status: 429, retryAfterSeconds: 7 });

    reply(503, {
      error: {
        code: "dependency_unavailable",
        details: null,
        message: "must not leak",
        request_id: "77777777-7777-4777-8777-777777777777",
      },
    });
    await expect(
      api.sendChatMessage("t", chatroomId, { body: "x", clientMessageId }),
    ).rejects.toMatchObject({ status: 503, code: "dependency_unavailable" });
  });

  test("401 propagates status and code unchanged so authorizedRequest can refresh and retry", async () => {
    reply(401, {
      error: {
        code: "invalid_access_token",
        details: null,
        message: "must not leak",
        request_id: "77777777-7777-4777-8777-777777777777",
      },
    });
    await expect(
      api.listGroupChatrooms("t", groupId, {}),
    ).rejects.toMatchObject({ status: 401, code: "invalid_access_token" });
  });

  test("never logs the bearer token or raw server error details", async () => {
    const spies = ["log", "warn", "error", "info", "debug"] as const;
    const logs = spies.map((method) =>
      jest.spyOn(console, method).mockImplementation(() => undefined),
    );
    try {
      const token = "sensitive-fake-bearer-token";
      reply(200, { items: [chatroomWire], next_cursor: null });
      await api.listGroupChatrooms(token, groupId, {});
      reply(503, {
        error: {
          code: "dependency_unavailable",
          details: null,
          message: "sensitive-raw-server-detail",
          request_id: "fake-request",
        },
      });
      await expect(
        api.listChatroomMessages(token, chatroomId, {}),
      ).rejects.toMatchObject({ status: 503 });
      for (const log of logs) expect(log).not.toHaveBeenCalled();
    } finally {
      for (const log of logs) log.mockRestore();
    }
  });

  test("rejects malformed or wrong-status success without retry", async () => {
    reply(200, { items: [{ id: chatroomId }] });
    await expect(
      api.listGroupChatrooms("t", groupId, {}),
    ).rejects.toMatchObject({ status: 502 });
    reply(204);
    await expect(
      api.sendChatMessage("t", chatroomId, { body: "x", clientMessageId }),
    ).rejects.toMatchObject({ code: "invalid_response_status" });
  });

  test("an already aborted caller causes no IO", async () => {
    const abort = new AbortController();
    abort.abort();
    await expect(
      api.listGroupChatrooms("t", groupId, {}, abort.signal),
    ).rejects.toMatchObject({ status: 0, code: "request_cancelled" });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  test("bounds transport wait and releases the timeout", async () => {
    jest.useFakeTimers();
    fetchMock.mockImplementation(
      (_url, init) =>
        new Promise((_resolve, reject) => {
          init.signal.addEventListener("abort", () =>
            reject(Object.assign(new Error(), { name: "AbortError" })),
          );
        }),
    );
    const pending = expect(
      api.listGroupChatrooms("t", groupId, {}),
    ).rejects.toMatchObject({ status: 408, code: "request_timeout" });
    await jest.advanceTimersByTimeAsync(15000);
    await pending;
    expect(jest.getTimerCount()).toBe(0);
  });
});
