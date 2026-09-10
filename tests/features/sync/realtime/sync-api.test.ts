import {
  createSyncApi,
  realtimeSocketUrl,
} from "@/features/sync/realtime/sync-api";

const room = "11111111-1111-4111-8111-111111111111";
const origin = "https://api.example";
const ticket = {
  ticket: "t".repeat(43),
  expires_at: "2030-01-01T00:00:00Z",
  contract_version: "1",
};

describe("M9 authenticated delta and ticket transport", () => {
  const originalFetch = globalThis.fetch;
  const fetchMock = jest.fn();
  const api = createSyncApi(origin);
  function reply(
    status: number,
    payload: unknown,
    retryAfter: string | null = null,
  ) {
    fetchMock.mockResolvedValue({
      status,
      ok: status >= 200 && status < 300,
      json: async () => payload,
      headers: { get: () => retryAfter },
    });
  }
  beforeEach(() => {
    globalThis.fetch = fetchMock;
    fetchMock.mockReset();
  });
  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  test("S1 sends versioned bearer auth and preserves the opaque cursor", async () => {
    const cursor = "끝+/= ?opaque";
    reply(200, { items: [], next_cursor: null });
    await expect(
      api.listEvents("access", room, { after: cursor, limit: 100 }),
    ).resolves.toEqual({ items: [], next_cursor: null });
    const [rawUrl, init] = fetchMock.mock.calls[0];
    const url = new URL(rawUrl);
    expect(url.pathname).toBe(`/api/v1/conversations/${room}/events`);
    expect(url.searchParams.get("after")).toBe(cursor);
    expect(url.searchParams.get("limit")).toBe("100");
    expect(init).toMatchObject({
      credentials: "omit",
      redirect: "error",
      headers: {
        Authorization: "Bearer access",
        "X-Jamye-Contract-Version": "1",
      },
    });
  });

  test("R1 requires 201 and builds a ticket-only wss URL", async () => {
    reply(201, ticket);
    await expect(api.issueTicket("access")).resolves.toEqual(ticket);
    expect(fetchMock.mock.calls[0][0]).toBe(
      `${origin}/api/v1/realtime/tickets`,
    );
    expect(fetchMock.mock.calls[0][1]).toMatchObject({ method: "POST" });
    expect(fetchMock.mock.calls[0][1].body).toBeUndefined();
    const url = new URL(realtimeSocketUrl(origin, "one/use+ticket"));
    expect(url.protocol).toBe("wss:");
    expect(url.searchParams.get("ticket")).toBe("one/use+ticket");
    expect([...url.searchParams.keys()]).toEqual(["ticket"]);
  });

  test.each([401, 403, 426, 429, 503])(
    "preserves status %s without exposing raw response details",
    async (status) => {
      reply(
        status,
        {
          error: {
            code: "request_failed",
            message: "secret upstream detail",
            details: null,
            request_id: room,
          },
        },
        "7",
      );
      await expect(api.listEvents("access", room, {})).rejects.toMatchObject({
        status,
        code: "request_failed",
        retryAfterSeconds: status === 429 ? 7 : null,
      });
      await expect(api.issueTicket("access")).rejects.not.toThrow(
        "secret upstream detail",
      );
    },
  );

  test("rejects malformed success shapes/status and invalid inputs", async () => {
    reply(200, ticket);
    await expect(api.issueTicket("access")).rejects.toMatchObject({
      status: 502,
    });
    reply(201, { ticket: "bad" });
    await expect(api.issueTicket("access")).rejects.toMatchObject({
      status: 502,
    });
    reply(200, { items: ["unknown"], next_cursor: null });
    await expect(api.listEvents("access", room, {})).rejects.toMatchObject({
      status: 502,
    });
    fetchMock.mockClear();
    await expect(
      api.listEvents("access", "../escape", {}),
    ).rejects.toMatchObject({ status: 422 });
    await expect(
      api.listEvents("access", room, { limit: 0 }),
    ).rejects.toMatchObject({ status: 422 });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  test("maps network failure and caller abort without leaking credentials", async () => {
    fetchMock.mockRejectedValue(new Error("access token must never escape"));
    await expect(api.issueTicket("access")).rejects.toMatchObject({
      status: 0,
      code: "network_unavailable",
    });
    const caller = new AbortController();
    caller.abort();
    fetchMock.mockClear();
    await expect(
      api.issueTicket("access", caller.signal),
    ).rejects.toMatchObject({ code: "request_cancelled" });
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
