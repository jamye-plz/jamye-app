import {
  AuthApiError,
  createAuthApi,
  isCallerCancelled,
} from "@/core/auth/auth-api";

const state = "s".repeat(43);
const token = {
  token_type: "Bearer",
  access_token: "access",
  access_token_expires_at: "2030-01-01T00:00:00Z",
  refresh_token: "r".repeat(43),
  refresh_token_expires_at: "2031-01-01T00:00:00Z",
};

describe("auth API contract", () => {
  const originalFetch = globalThis.fetch;
  const fetchMock = jest.fn();
  beforeEach(() => {
    fetchMock.mockReset();
    globalThis.fetch = fetchMock;
  });
  afterEach(() => {
    globalThis.fetch = originalFetch;
    jest.useRealTimers();
  });
  test("canonicalizes the HTTPS origin and forbids credential-bearing redirects", async () => {
    fetchMock.mockResolvedValue({ ok: true, status: 204 });
    await createAuthApi("https://API.Example:443/").logout("access");
    expect(fetchMock).toHaveBeenCalledWith(
      "https://api.example/api/v1/auth/logout",
      expect.objectContaining({ credentials: "omit", redirect: "error" }),
    );
    expect(() => createAuthApi("http://api.example")).toThrow();
    expect(() => createAuthApi("https://secret@api.example")).toThrow();
    expect(() => createAuthApi("https://api.example/untrusted-path")).toThrow();
  });

  test("logout requires the contracted bodyless 204 rather than any successful status", async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({}),
    });
    await expect(
      createAuthApi("https://api.example").logout("access"),
    ).rejects.toMatchObject({
      status: 502,
      code: "invalid_response_status",
    });
  });
  test.each(["headers", "body"])(
    "times out a stalled response at %s",
    async (phase) => {
      jest.useFakeTimers();
      fetchMock.mockImplementation((_url: string, init: RequestInit) => {
        const stalled = new Promise<never>((_resolve, reject) => {
          init.signal?.addEventListener("abort", () => {
            const error = new Error("aborted");
            error.name = "AbortError";
            reject(error);
          });
        });
        return phase === "headers"
          ? stalled
          : Promise.resolve({ ok: true, status: 200, json: () => stalled });
      });
      const result = expect(
        createAuthApi("https://api.example").profile("access"),
      ).rejects.toMatchObject({ status: 408, code: "request_timeout" });
      await jest.advanceTimersByTimeAsync(15_000);
      await result;
      expect(jest.getTimerCount()).toBe(0);
    },
  );
  test("distinguishes caller cancellation from a timeout on the same composed deadline", async () => {
    const controller = new AbortController();
    fetchMock.mockImplementation((_url: string, init: RequestInit) => {
      return new Promise<never>((_resolve, reject) => {
        init.signal?.addEventListener("abort", () => {
          const error = new Error("aborted");
          error.name = "AbortError";
          reject(error);
        });
      });
    });
    const pending = createAuthApi("https://api.example").profile(
      "access",
      controller.signal,
    );
    controller.abort();
    await expect(pending).rejects.toMatchObject({
      status: 0,
      code: "request_cancelled",
    });
    await pending.catch((error) => {
      expect(isCallerCancelled(error)).toBe(true);
    });
  });
  test("preserves status when an error response has no JSON envelope", async () => {
    fetchMock.mockResolvedValue({
      ok: false,
      status: 503,
      json: async () => {
        throw new SyntaxError("not JSON");
      },
    });
    await expect(
      createAuthApi("https://api.example").profile("access"),
    ).rejects.toMatchObject({ status: 503, code: "request_failed" });
  });
  test("accepts the fixed Google authorization URL and rejects wrong paths and URL credentials", async () => {
    const api = createAuthApi("https://api.example");
    const input = {
      redirectUri: "https://api.example/api/v1/auth/oauth/google/callback",
      challenge: "c".repeat(43),
    };
    fetchMock.mockResolvedValueOnce(
      response({
        authorization_url: "https://accounts.google.com/o/oauth2/v2/auth",
        state,
        expires_in_seconds: 600,
      }),
    );
    await expect(api.authorize("google", input)).resolves.toMatchObject({
      state,
    });
    for (const url of [
      "https://accounts.google.com/other",
      "https://user@accounts.google.com/o/oauth2/v2/auth",
      "not-a-url",
    ]) {
      fetchMock.mockResolvedValueOnce(
        response({ authorization_url: url, state, expires_in_seconds: 600 }),
      );
      await expect(api.authorize("google", input)).rejects.toMatchObject({
        code: "invalid_authorize_response",
      });
    }
  });
  test("sends exact snake_case authorize, exchange, refresh, profile, and logout requests", async () => {
    fetchMock
      .mockResolvedValueOnce(
        response({
          authorization_url: "https://kauth.kakao.com/oauth/authorize?x=1",
          state,
          expires_in_seconds: 600,
        }),
      )
      .mockResolvedValueOnce(response(token))
      .mockResolvedValueOnce(response(token))
      .mockResolvedValueOnce(
        response({
          id: "3f0a3f1e-2f2a-4a3e-9c3b-1f8f9d3a2b4c",
          provider: "kakao",
          nickname: "name",
          avatar_url: null,
          created_at: "2020-01-01T00:00:00Z",
        }),
      )
      .mockResolvedValueOnce(noContent());
    const api = createAuthApi("https://jamye-api.ridewithmin.com");
    await api.authorize("kakao", {
      redirectUri:
        "https://jamye-api.ridewithmin.com/api/v1/auth/oauth/kakao/callback",
      challenge: "c".repeat(43),
    });
    await api.exchange("kakao", {
      authorizationCode: "code",
      state,
      verifier: "v".repeat(43),
      redirectUri:
        "https://jamye-api.ridewithmin.com/api/v1/auth/oauth/kakao/callback",
    });
    await api.refresh("r".repeat(43));
    await api.profile("access");
    await api.logout("access");
    expect(fetchMock.mock.calls.map(([url]) => url)).toEqual([
      "https://jamye-api.ridewithmin.com/api/v1/auth/oauth/kakao/authorize",
      "https://jamye-api.ridewithmin.com/api/v1/auth/oauth/kakao/exchange",
      "https://jamye-api.ridewithmin.com/api/v1/auth/refresh",
      "https://jamye-api.ridewithmin.com/api/v1/me",
      "https://jamye-api.ridewithmin.com/api/v1/auth/logout",
    ]);
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({
      redirect_uri:
        "https://jamye-api.ridewithmin.com/api/v1/auth/oauth/kakao/callback",
      code_challenge: "c".repeat(43),
      code_challenge_method: "S256",
    });
    expect(JSON.parse(fetchMock.mock.calls[1][1].body)).toEqual({
      authorization_code: "code",
      state,
      code_verifier: "v".repeat(43),
      redirect_uri:
        "https://jamye-api.ridewithmin.com/api/v1/auth/oauth/kakao/callback",
    });
    expect(fetchMock.mock.calls[3][1].headers.Authorization).toBe(
      "Bearer access",
    );
  });
  test("rejects arbitrary authorization URLs and maps timeout or error responses without body leaks", async () => {
    fetchMock.mockResolvedValueOnce(
      response({
        authorization_url: "https://evil.example/authorize",
        state,
        expires_in_seconds: 600,
      }),
    );
    await expect(
      createAuthApi("https://api.example").authorize("kakao", {
        redirectUri: "https://callback",
        challenge: "c".repeat(43),
      }),
    ).rejects.toEqual(
      expect.objectContaining({ code: "invalid_authorize_response" }),
    );
    fetchMock.mockResolvedValueOnce({
      ok: false,
      status: 401,
      json: async () => ({
        error: {
          code: "authentication_required",
          message: "Authentication required.",
          request_id: "11111111-1111-4111-8111-111111111111",
          details: null,
        },
      }),
    });
    await expect(
      createAuthApi("https://api.example").profile("x"),
    ).rejects.toEqual(
      expect.objectContaining({ status: 401, code: "authentication_required" }),
    );
    expect(AuthApiError).toBeDefined();
  });

  test("does not trust error codes from a malformed error envelope", async () => {
    fetchMock.mockResolvedValue({
      ok: false,
      status: 401,
      json: async () => ({ error: { code: "unvalidated-payload" } }),
    });
    await expect(
      createAuthApi("https://api.example").profile("access"),
    ).rejects.toMatchObject({
      status: 401,
      code: "request_failed",
    });
  });
  test("rejects malformed token/profile data and maps network failure", async () => {
    fetchMock.mockResolvedValueOnce(response({ token_type: "Bearer" }));
    await expect(
      createAuthApi("https://api.example").refresh("r".repeat(43)),
    ).rejects.toEqual(
      expect.objectContaining({ code: "invalid_token_response" }),
    );
    fetchMock.mockResolvedValueOnce(
      response({
        id: "id",
        provider: "kakao",
        nickname: "name",
        created_at: "date",
        avatar_url: 1,
      }),
    );
    await expect(
      createAuthApi("https://api.example").profile("x"),
    ).rejects.toEqual(
      expect.objectContaining({ code: "invalid_profile_response" }),
    );
    fetchMock.mockRejectedValueOnce(new Error("offline"));
    await expect(
      createAuthApi("https://api.example").logout("x"),
    ).rejects.toEqual(expect.objectContaining({ code: "network_unavailable" }));
  });
  test("rejects a malformed U1 UUID, non-43-char rotating refresh token, and an out-of-range date-time", async () => {
    fetchMock.mockResolvedValueOnce(
      response({
        id: "not-a-uuid",
        provider: "kakao",
        nickname: "name",
        avatar_url: null,
        created_at: "2020-01-01T00:00:00Z",
      }),
    );
    await expect(
      createAuthApi("https://api.example").profile("x"),
    ).rejects.toEqual(
      expect.objectContaining({ code: "invalid_profile_response" }),
    );
    fetchMock.mockResolvedValueOnce(
      response({ ...token, refresh_token: "too-short" }),
    );
    await expect(
      createAuthApi("https://api.example").refresh("r".repeat(43)),
    ).rejects.toEqual(
      expect.objectContaining({ code: "invalid_token_response" }),
    );
    fetchMock.mockResolvedValueOnce(
      response({
        id: "3f0a3f1e-2f2a-4a3e-9c3b-1f8f9d3a2b4c",
        provider: "kakao",
        nickname: "name",
        avatar_url: null,
        created_at: "2020-02-30T00:00:00Z",
      }),
    );
    await expect(
      createAuthApi("https://api.example").profile("x"),
    ).rejects.toEqual(
      expect.objectContaining({ code: "invalid_profile_response" }),
    );
  });
});

function response(body: unknown) {
  return { ok: true, status: 200, json: async () => body } as Response;
}
function noContent() {
  return { ok: true, status: 204, json: async () => null } as Response;
}
