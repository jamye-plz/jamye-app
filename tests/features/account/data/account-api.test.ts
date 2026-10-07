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
  // U4's presigned PUT must resolve to the configured media origin.
  const avatarApi = createAccountApi(
    "https://api.example.com/",
    "https://media.example.com",
  );
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

  test("APPCON-AC5: Kakao/Google deleteAccount() (no Apple proof) still sends no body", async () => {
    reply(204, null);
    await api.deleteAccount("t");
    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(init.body).toBeUndefined();
  });

  test("APPCON-AC5: an Apple proof becomes the snake_case JSON U3 body with a Content-Type header", async () => {
    reply(204, null);
    await api.deleteAccount("t", {
      identityToken: "identity-token",
      authorizationCode: "authorization-code",
      rawNonce: "raw-nonce",
    });
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://api.example.com/api/v1/me");
    expect(init.method).toBe("DELETE");
    expect(JSON.parse(String(init.body))).toEqual({
      identity_token: "identity-token",
      authorization_code: "authorization-code",
      raw_nonce: "raw-nonce",
    });
    expect((init.headers as Record<string, string>)["Content-Type"]).toBe(
      "application/json",
    );
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

  test("sends a valid avatarUrl as avatar_url and maps the 200 profile", async () => {
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
  });

  // AV-AC1: U2 treats `avatar_url: null` as "leave unchanged" (a no-op); the
  // empty string is the only value that clears the avatar.
  test("AV-AC1: clearing the avatar sends the empty string, never null", async () => {
    reply(200, userWire);
    const profile = await api.updateProfile("token", { avatarUrl: "" });
    expect(profile.avatarUrl).toBeNull();
    const [, clearInit] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(clearInit.method).toBe("PATCH");
    expect(JSON.parse(String(clearInit.body))).toEqual({ avatar_url: "" });
    expect(String(clearInit.body)).not.toContain("null");
  });

  test("AV-AC1: a legacy null avatarUrl is normalised to the empty-string clear on the wire", async () => {
    reply(200, userWire);
    await api.updateProfile("token", { avatarUrl: null });
    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(JSON.parse(String(init.body))).toEqual({ avatar_url: "" });
  });

  describe("AV-AC8 U4/U5 avatar upload", () => {
    const uploadId = "44444444-4444-4444-8444-444444444444";
    const intentWire = {
      upload_id: uploadId,
      presigned_put: {
        url: "https://media.example.com/avatars/put?sig=abc",
        expires_in: 900,
      },
    };

    test("U4 startAvatarUpload() POSTs content_type image/jpeg with the byte size and maps the 201 intent", async () => {
      reply(201, intentWire);
      const intent = await avatarApi.startAvatarUpload("token", 45_000);
      const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
      expect(url).toBe("https://api.example.com/api/v1/me/avatar/uploads");
      expect(init.method).toBe("POST");
      expect(JSON.parse(String(init.body))).toEqual({
        content_type: "image/jpeg",
        byte_size: 45_000,
      });
      expect((init.headers as Record<string, string>).Authorization).toBe(
        "Bearer token",
      );
      expect(intent).toEqual({
        uploadId,
        put: {
          url: "https://media.example.com/avatars/put?sig=abc",
          expiresIn: 900,
        },
      });
    });

    test.each([0, -1, 1.5, 1_048_577])(
      "U4 startAvatarUpload() rejects byte size %p locally before any fetch call",
      async (byteSize) => {
        await expect(
          avatarApi.startAvatarUpload("token", byteSize),
        ).rejects.toMatchObject({ status: 422, code: "invalid_avatar_size" });
        expect(fetchMock).not.toHaveBeenCalled();
      },
    );

    test("U4 startAvatarUpload() rejects a 201 body that fails the AvatarUploadIntent schema", async () => {
      reply(201, { upload_id: uploadId });
      await expect(
        avatarApi.startAvatarUpload("token", 1000),
      ).rejects.toMatchObject({
        status: 502,
        code: "invalid_avatar_upload_response",
      });
    });

    test.each([
      [401, "authentication_required"],
      [422, "request_validation_failed"],
      [429, "rate_limit_exceeded"],
      [503, "object_storage_degraded"],
    ])(
      "U4 startAvatarUpload() surfaces %i %s as an AccountApiError",
      async (status, code) => {
        reply(status, errorEnvelope(code), status === 429 ? "7" : null);
        const failure = await avatarApi
          .startAvatarUpload("token", 1000)
          .catch((error: unknown) => error);
        expect(failure).toBeInstanceOf(AccountApiError);
        expect(failure).toMatchObject({ status, code });
        if (status === 429)
          expect(failure).toMatchObject({ retryAfterSeconds: 7 });
      },
    );

    // VERIFY fix 1: the avatar PUT URL is checked against the media origin
    // exactly like the chat media flow (media-api.ts), before any PUT.
    test.each([
      ["another host", "https://evil.example.net/avatars/put?sig=abc"],
      ["a lookalike subdomain", "https://media.example.com.evil.net/put"],
      ["cleartext http", "http://media.example.com/avatars/put?sig=abc"],
      ["another port", "https://media.example.com:8443/avatars/put?sig=abc"],
      ["userinfo", "https://user:secret@media.example.com/avatars/put?sig=abc"],
      ["a fragment", "https://media.example.com/avatars/put?sig=abc#frag"],
    ])(
      "U4 startAvatarUpload() rejects a presigned PUT URL on %s as an invalid response",
      async (_label, url) => {
        reply(201, {
          ...intentWire,
          presigned_put: { ...intentWire.presigned_put, url },
        });
        const failure = await avatarApi
          .startAvatarUpload("token", 1000)
          .catch((error: unknown) => error);
        expect(failure).toBeInstanceOf(AccountApiError);
        expect(failure).toMatchObject({
          status: 502,
          code: "invalid_media_origin_url",
        });
      },
    );

    test("U4 startAvatarUpload() accepts a PUT URL on the media origin with signed query bytes unchanged", async () => {
      const url =
        "https://media.example.com/avatars/put?X-Amz-Signature=a%2Fb%3D&x=1";
      reply(201, {
        ...intentWire,
        presigned_put: { ...intentWire.presigned_put, url },
      });
      const intent = await avatarApi.startAvatarUpload("token", 1000);
      expect(intent.put.url).toBe(url);
    });

    test("U4 startAvatarUpload() fails closed before any fetch when no media origin was configured", async () => {
      await expect(api.startAvatarUpload("token", 1000)).rejects.toMatchObject({
        status: 502,
        code: "invalid_media_origin_url",
      });
      expect(fetchMock).not.toHaveBeenCalled();
    });

    test.each([
      "http://media.example.com",
      "https://media.example.com/path",
      "https://user@media.example.com",
      "not a url",
    ])("createAccountApi() rejects a malformed media origin %p", (origin) => {
      expect(() =>
        createAccountApi("https://api.example.com/", origin),
      ).toThrow();
    });

    test("createAccountApi() accepts a media origin with a trailing slash", async () => {
      const trailing = createAccountApi(
        "https://api.example.com/",
        "https://media.example.com/",
      );
      reply(201, intentWire);
      await expect(
        trailing.startAvatarUpload("token", 1000),
      ).resolves.toMatchObject({ uploadId });
    });

    test("U5 finalizeAvatarUpload() POSTs an empty JSON object to the upload's finalize path and maps the User", async () => {
      reply(200, {
        ...userWire,
        avatar_url: "https://api.example.com/api/v1/avatars/abc",
      });
      const profile = await api.finalizeAvatarUpload("token", uploadId);
      const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
      expect(url).toBe(
        `https://api.example.com/api/v1/me/avatar/uploads/${uploadId}/finalize`,
      );
      expect(init.method).toBe("POST");
      expect(JSON.parse(String(init.body))).toEqual({});
      expect(profile.avatarUrl).toBe(
        "https://api.example.com/api/v1/avatars/abc",
      );
    });

    test("U5 finalizeAvatarUpload() rejects a non-uuid upload id locally before any fetch call", async () => {
      await expect(
        api.finalizeAvatarUpload("token", "../../me"),
      ).rejects.toMatchObject({ status: 422, code: "invalid_identifier" });
      expect(fetchMock).not.toHaveBeenCalled();
    });

    test("U5 finalizeAvatarUpload() rejects a 200 body that is not a User", async () => {
      reply(200, { ok: true });
      await expect(
        api.finalizeAvatarUpload("token", uploadId),
      ).rejects.toMatchObject({
        status: 502,
        code: "invalid_profile_response",
      });
    });

    test.each([
      [401, "authentication_required"],
      [404, "avatar_upload_not_found"],
      [409, "avatar_upload_not_pending"],
      [422, "avatar_object_invalid"],
      [422, "request_validation_failed"],
      [503, "object_storage_degraded"],
    ])(
      "U5 finalizeAvatarUpload() surfaces %i %s as an AccountApiError",
      async (status, code) => {
        reply(status, errorEnvelope(code));
        await expect(
          api.finalizeAvatarUpload("token", uploadId),
        ).rejects.toMatchObject({ status, code });
      },
    );
  });
});
