import {
  AccountApiError,
  createAccountApi,
} from "@/features/account/data/account-api";

const userId = "11111111-1111-4111-8111-111111111111";

const userWire = {
  avatar_url: null,
  created_at: "2026-09-16T00:00:00Z",
  id: userId,
  nickname: "Jamye",
  provider: "kakao",
};

const errorEnvelope = (code: string) => ({
  error: {
    code,
    details: null,
    message: code,
    request_id: "33333333-3333-4333-8333-333333333333",
  },
});

describe("A1 account transport", () => {
  const originalFetch = globalThis.fetch;
  const fetchMock = jest.fn();
  const api = createAccountApi("https://api.example.com/");
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

  test.each(["", "   "])(
    "U2 updateProfile() rejects an empty/whitespace-only nickname %j before any fetch call",
    async (nickname) => {
      await expect(api.updateProfile("t", { nickname })).rejects.toMatchObject({
        code: "invalid_nickname",
        status: 422,
      });
      expect(fetchMock).not.toHaveBeenCalled();
    },
  );

  test("U2 updateProfile() rejects a nickname over 64 chars before any fetch call", async () => {
    await expect(
      api.updateProfile("t", { nickname: "x".repeat(65) }),
    ).rejects.toMatchObject({ code: "invalid_nickname", status: 422 });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  test("U2 updateProfile() rejects an avatarUrl over 512 chars before any fetch call", async () => {
    await expect(
      api.updateProfile("t", { avatarUrl: "x".repeat(513) }),
    ).rejects.toMatchObject({ code: "invalid_avatar_url", status: 422 });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  test("U2 updateProfile() sends PATCH /api/v1/me and maps a valid 200 response", async () => {
    reply(200, { ...userWire, nickname: "새 닉네임" });
    await expect(
      api.updateProfile("t", { nickname: "새 닉네임" }),
    ).resolves.toEqual({
      avatarUrl: null,
      createdAt: "2026-09-16T00:00:00Z",
      id: userId,
      nickname: "새 닉네임",
      provider: "kakao",
    });
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("https://api.example.com/api/v1/me");
    expect(init).toEqual(
      expect.objectContaining({
        method: "PATCH",
        body: JSON.stringify({ nickname: "새 닉네임" }),
      }),
    );
  });

  test("U2 updateProfile() omits avatar_url on the wire body when not provided", async () => {
    reply(200, userWire);
    await api.updateProfile("t", { nickname: "Jamye" });
    const [, init] = fetchMock.mock.calls[0];
    expect(init.body).toBe(JSON.stringify({ nickname: "Jamye" }));
  });

  test("U2 updateProfile() surfaces a malformed 200 response as invalid_profile_response", async () => {
    reply(200, { ...userWire, provider: "unknown_provider" });
    await expect(
      api.updateProfile("t", { nickname: "Jamye" }),
    ).rejects.toMatchObject({ code: "invalid_profile_response", status: 502 });
  });

  test("U3 deleteAccount() sends DELETE /api/v1/me and resolves on 204", async () => {
    reply(204, null);
    await expect(api.deleteAccount("t")).resolves.toBeUndefined();
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("https://api.example.com/api/v1/me");
    expect(init).toEqual(expect.objectContaining({ method: "DELETE" }));
  });

  test("U3 deleteAccount() maps a 409 group_ownership_transfer_required envelope to a distinct AccountApiError", async () => {
    reply(409, errorEnvelope("group_ownership_transfer_required"));
    await expect(api.deleteAccount("t")).rejects.toMatchObject({
      code: "group_ownership_transfer_required",
      status: 409,
    });
  });

  test("U3 deleteAccount() maps 400/401/503 envelopes to their own stable codes, distinct from the 409 blocker", async () => {
    reply(400, errorEnvelope("request_validation_failed"));
    await expect(api.deleteAccount("t")).rejects.toMatchObject({
      code: "request_validation_failed",
      status: 400,
    });
    reply(401, errorEnvelope("authentication_required"));
    await expect(api.deleteAccount("t")).rejects.toMatchObject({
      code: "authentication_required",
      status: 401,
    });
    reply(503, errorEnvelope("database_unavailable"));
    await expect(api.deleteAccount("t")).rejects.toMatchObject({
      code: "database_unavailable",
      status: 503,
    });
  });

  test("U3 deleteAccount() maps a 500 without an error envelope to the generic request_failed fallback", async () => {
    reply(500, null);
    await expect(api.deleteAccount("t")).rejects.toMatchObject({
      code: "request_failed",
      status: 500,
    });
  });

  test("shared transport maps a fetch failure to network_unavailable", async () => {
    fetchMock.mockRejectedValue(new TypeError("Network request failed"));
    await expect(api.deleteAccount("t")).rejects.toMatchObject({
      code: "network_unavailable",
      status: 0,
    });
  });

  test("shared transport maps a caller abort to request_cancelled without a network round-trip", async () => {
    const controller = new AbortController();
    controller.abort();
    await expect(
      api.updateProfile("t", { nickname: "Jamye" }, controller.signal),
    ).rejects.toMatchObject({ code: "request_cancelled", status: 0 });
  });

  test("updateProfile()/deleteAccount() rejections are instances of AccountApiError", async () => {
    reply(500, null);
    await expect(api.deleteAccount("t")).rejects.toBeInstanceOf(
      AccountApiError,
    );
  });

  test("sends a valid avatarUrl as avatar_url and maps the 200 profile (null clears it)", async () => {
    reply(200, { ...userWire, avatar_url: "https://cdn.example/a.png" });
    const profile = await api.updateProfile("token", {
      avatarUrl: "https://cdn.example/a.png",
    });
    expect(profile.avatarUrl).toBe("https://cdn.example/a.png");
    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(init.method).toBe("PATCH");
    expect(JSON.parse(String(init.body))).toEqual({
      avatar_url: "https://cdn.example/a.png",
    });

    reply(200, userWire);
    await api.updateProfile("token", { avatarUrl: null });
    const [, clearInit] = fetchMock.mock.calls[1] as [string, RequestInit];
    expect(JSON.parse(String(clearInit.body))).toEqual({ avatar_url: null });
  });
});
