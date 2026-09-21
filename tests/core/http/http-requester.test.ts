import { HttpAbortedError } from "@/core/http/http-client";
import {
  createHttpRequester,
  parseRetryAfterSeconds,
} from "@/core/http/http-requester";

/**
 * Characterization tests for the shared HTTP boilerplate that
 * notifications-api.ts, push-installations-api.ts and account-api.ts all
 * build their feature-specific transports on top of. Modeled on
 * tests/features/notifications/data/push-installations-api.test.ts and
 * notifications-api.test.ts's fetch-mocking style, but exercises
 * createHttpRequester directly (with a throwaway error class) instead of
 * through a feature API, so this file pins the shared module's own
 * behavior independent of any one caller.
 */

class TestApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    readonly retryAfterSeconds: number | null = null,
  ) {
    super(code);
  }
}

const errorEnvelope = (code: string) => ({
  error: {
    code,
    details: null,
    message: code,
    request_id: "33333333-3333-4333-8333-333333333333",
  },
});

describe("createHttpRequester (shared fetch/timeout/abort/status-mapping transport)", () => {
  const originalFetch = globalThis.fetch;
  const fetchMock = jest.fn();
  const request = createHttpRequester(
    "https://api.example.com/",
    (status, code, retryAfterSeconds = null) =>
      new TestApiError(status, code, retryAfterSeconds),
    (error): error is TestApiError => error instanceof TestApiError,
  );

  const reply = (
    status: number,
    value: unknown = null,
    retryAfter: string | null = null,
    jsonImpl?: jest.Mock,
  ) => {
    const json = jsonImpl ?? jest.fn().mockResolvedValue(value);
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

  test("resolves the payload and status for a successful expected-status JSON response", async () => {
    reply(200, { ok: true });
    await expect(
      request("/api/v1/thing", "token", { method: "GET" }, undefined, [200]),
    ).resolves.toEqual({ payload: { ok: true }, status: 200 });
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("https://api.example.com/api/v1/thing");
    expect(init).toEqual(
      expect.objectContaining({
        method: "GET",
        credentials: "omit",
        redirect: "error",
        headers: expect.objectContaining({
          Accept: "application/json",
          Authorization: "Bearer token",
        }),
      }),
    );
  });

  test("omits Content-Type when init.body is absent, and sets it when a body is present", async () => {
    reply(204, null);
    await request(
      "/api/v1/thing",
      "token",
      { method: "DELETE" },
      undefined,
      [204],
    );
    const [, getInit] = fetchMock.mock.calls[0];
    expect(getInit.headers["Content-Type"]).toBeUndefined();

    reply(200, { ok: true });
    await request(
      "/api/v1/thing",
      "token",
      { method: "PATCH", body: JSON.stringify({ a: 1 }) },
      undefined,
      [200],
    );
    const [, postInit] = fetchMock.mock.calls[1];
    expect(postInit.headers["Content-Type"]).toBe("application/json");
  });

  test("throws invalid_response_status (502) when an ok response's status is not in expectedStatuses", async () => {
    reply(201, { ok: true });
    await expect(
      request("/api/v1/thing", "token", { method: "POST" }, undefined, [200]),
    ).rejects.toMatchObject({ status: 502, code: "invalid_response_status" });
  });

  test("decodes a valid ErrorEnvelope body into the caller's error class with its code", async () => {
    reply(422, errorEnvelope("invalid_nickname"));
    await expect(
      request("/api/v1/me", "token", { method: "PATCH" }, undefined, [200]),
    ).rejects.toMatchObject({ status: 422, code: "invalid_nickname" });
  });

  test("falls back to request_failed when the non-ok body is null (no error envelope present)", async () => {
    reply(500, null);
    await expect(
      request("/api/v1/me", "token", { method: "DELETE" }, undefined, [204]),
    ).rejects.toMatchObject({ status: 500, code: "request_failed" });
  });

  test("falls back to request_failed when the non-ok response body is not valid JSON", async () => {
    const json = jest
      .fn()
      .mockRejectedValue(new SyntaxError("Unexpected token"));
    reply(500, undefined, null, json);
    await expect(
      request("/api/v1/me", "token", { method: "DELETE" }, undefined, [204]),
    ).rejects.toMatchObject({ status: 500, code: "request_failed" });
  });

  test("carries retryAfterSeconds only for a 429 response, parsed from the Retry-After header", async () => {
    reply(429, errorEnvelope("rate_limited"), "30");
    await expect(
      request("/api/v1/me", "token", { method: "PATCH" }, undefined, [200]),
    ).rejects.toMatchObject({
      status: 429,
      code: "rate_limited",
      retryAfterSeconds: 30,
    });

    reply(503, errorEnvelope("unavailable"), "30");
    await expect(
      request("/api/v1/me", "token", { method: "PATCH" }, undefined, [200]),
    ).rejects.toMatchObject({ status: 503, retryAfterSeconds: null });
  });

  test("ignores a non-numeric Retry-After header on a 429 (retryAfterSeconds stays null)", async () => {
    reply(429, errorEnvelope("rate_limited"), "later");
    await expect(
      request("/api/v1/me", "token", { method: "PATCH" }, undefined, [200]),
    ).rejects.toMatchObject({ status: 429, retryAfterSeconds: null });
  });

  test("rejects immediately with request_cancelled when the caller AbortSignal is already aborted (no fetch call)", async () => {
    const controller = new AbortController();
    controller.abort();
    await expect(
      request(
        "/api/v1/me",
        "token",
        { method: "DELETE" },
        controller.signal,
        [204],
      ),
    ).rejects.toMatchObject({ status: 0, code: "request_cancelled" });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  test("propagates a live caller AbortSignal through to fetch's init.signal", async () => {
    reply(204, null);
    const controller = new AbortController();
    await request(
      "/api/v1/me",
      "token",
      { method: "DELETE" },
      controller.signal,
      [204],
    );
    const [, init] = fetchMock.mock.calls[0];
    expect(init.signal).toBeInstanceOf(AbortSignal);
    expect(init.signal.aborted).toBe(false);
  });

  test("rejects with network_unavailable when fetch itself rejects (no response shape at all)", async () => {
    fetchMock.mockRejectedValue(new TypeError("Failed to fetch"));
    await expect(
      request("/api/v1/me", "token", { method: "GET" }, undefined, [200]),
    ).rejects.toMatchObject({ status: 0, code: "network_unavailable" });
  });

  test("re-throws an already-decoded TError unchanged instead of re-wrapping it", async () => {
    fetchMock.mockRejectedValue(new TestApiError(409, "already_decoded"));
    await expect(
      request("/api/v1/me", "token", { method: "GET" }, undefined, [200]),
    ).rejects.toMatchObject({ status: 409, code: "already_decoded" });
  });

  test("maps the transport's own timeout abort to request_timeout (408)", async () => {
    fetchMock.mockRejectedValue(new HttpAbortedError("timeout"));
    await expect(
      request("/api/v1/me", "token", { method: "GET" }, undefined, [200]),
    ).rejects.toMatchObject({ status: 408, code: "request_timeout" });
  });
});
describe("parseRetryAfterSeconds", () => {
  test("parses a digits-only header into a safe integer", () => {
    expect(parseRetryAfterSeconds("120")).toBe(120);
    expect(parseRetryAfterSeconds("0")).toBe(0);
    expect(parseRetryAfterSeconds("12")).toBe(12);
  });

  test("returns null for a missing, non-numeric, or unsafe header", () => {
    expect(parseRetryAfterSeconds(null)).toBeNull();
    expect(parseRetryAfterSeconds("later")).toBeNull();
    expect(parseRetryAfterSeconds("-5")).toBeNull();
    expect(parseRetryAfterSeconds("12.5")).toBeNull();
    expect(parseRetryAfterSeconds("99999999999999999999")).toBeNull();
  });
});
