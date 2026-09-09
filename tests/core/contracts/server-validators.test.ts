import {
  parseOAuthCallbackQuery,
  validateErrorEnvelope,
  validateLivenessResponse,
  validateOAuthAuthorizeIn,
  validateOAuthAuthorizeOut,
  validateOAuthExchangeIn,
  validateReadinessResponse,
  validateRefreshIn,
  validateTokenPair,
  validateUser,
} from "@/core/contracts/server";

const VALID_UUID = "11111111-1111-4111-8111-111111111111";
const VALID_DATE_TIME = "2024-01-01T00:00:00Z";
const STATE = "s".repeat(43);
const VERIFIER = "v".repeat(43);

describe("M6-01 server contract runtime validators", () => {
  test("H1 liveness accepts only the live enum", () => {
    expect(validateLivenessResponse({ status: "live" })).toBe(true);
    expect(validateLivenessResponse({ status: "dead" })).toBe(false);
    expect(validateLivenessResponse({})).toBe(false);
  });

  test("H2 readiness types the 503 payload the same as the 200 payload", () => {
    const readyBody = {
      checks: {
        minio: { required: false, status: "degraded" },
        postgres: { required: true, status: "ready" },
        redis: { required: true, status: "ready" },
      },
      status: "ready",
    };
    const notReadyBody = {
      ...readyBody,
      checks: {
        ...readyBody.checks,
        postgres: { required: true, status: "unavailable" },
      },
      status: "not_ready",
    };
    expect(validateReadinessResponse(readyBody)).toBe(true);
    expect(validateReadinessResponse(notReadyBody)).toBe(true);
    expect(
      validateReadinessResponse({
        ...readyBody,
        checks: { ...readyBody.checks, postgres: undefined },
      }),
    ).toBe(false);
    expect(validateReadinessResponse({ ...readyBody, status: "unknown" })).toBe(
      false,
    );
  });

  test("A1 OAuthAuthorizeIn enforces the S256 PKCE constraints", () => {
    const valid = {
      code_challenge: "c".repeat(43),
      code_challenge_method: "S256",
      redirect_uri: "https://api.example/callback",
    };
    expect(validateOAuthAuthorizeIn(valid)).toBe(true);
    expect(
      validateOAuthAuthorizeIn({ ...valid, code_challenge_method: "plain" }),
    ).toBe(false);
    expect(
      validateOAuthAuthorizeIn({ ...valid, code_challenge: "too-short" }),
    ).toBe(false);
    expect(validateOAuthAuthorizeIn({ ...valid, extra: "field" })).toBe(false);
    const { redirect_uri: _redirectUri, ...missingRedirect } = valid;
    expect(validateOAuthAuthorizeIn(missingRedirect)).toBe(false);
  });

  test("A1 OAuthAuthorizeOut requires the fixed 600-second TTL and 43-char state", () => {
    const valid = {
      authorization_url: "https://accounts.google.com/o/oauth2/v2/auth",
      expires_in_seconds: 600,
      state: STATE,
    };
    expect(validateOAuthAuthorizeOut(valid)).toBe(true);
    expect(
      validateOAuthAuthorizeOut({ ...valid, expires_in_seconds: 300 }),
    ).toBe(false);
    expect(validateOAuthAuthorizeOut({ ...valid, state: "too-short" })).toBe(
      false,
    );
    expect(
      validateOAuthAuthorizeOut({ ...valid, authorization_url: "not-a-url" }),
    ).toBe(false);
  });

  test("A2 OAuthExchangeIn enforces the PKCE verifier length and charset", () => {
    const valid = {
      authorization_code: "code",
      code_verifier: VERIFIER,
      redirect_uri: "https://api.example/callback",
      state: STATE,
    };
    expect(validateOAuthExchangeIn(valid)).toBe(true);
    expect(validateOAuthExchangeIn({ ...valid, code_verifier: "short" })).toBe(
      false,
    );
    expect(
      validateOAuthExchangeIn({ ...valid, code_verifier: `${VERIFIER}!` }),
    ).toBe(false);
    expect(validateOAuthExchangeIn({ ...valid, state: "bad-state" })).toBe(
      false,
    );
  });

  test("A2/A3 TokenPair rejects malformed date-time and non-Bearer token types", () => {
    const valid = {
      access_token: "access",
      access_token_expires_at: VALID_DATE_TIME,
      refresh_token: "r".repeat(43),
      refresh_token_expires_at: VALID_DATE_TIME,
      token_type: "Bearer",
    };
    expect(validateTokenPair(valid)).toBe(true);
    expect(validateTokenPair({ ...valid, token_type: "Basic" })).toBe(false);
    expect(
      validateTokenPair({ ...valid, access_token_expires_at: "not-a-date" }),
    ).toBe(false);
    expect(
      validateTokenPair({
        ...valid,
        access_token_expires_at: "2024-13-40T00:00:00Z",
      }),
    ).toBe(false);
    expect(validateTokenPair({ ...valid, refresh_token: "too-short" })).toBe(
      false,
    );
  });

  test("A3 RefreshIn requires the exact 43-character refresh token shape", () => {
    expect(validateRefreshIn({ refresh_token: "r".repeat(43) })).toBe(true);
    expect(validateRefreshIn({ refresh_token: "short" })).toBe(false);
    expect(validateRefreshIn({})).toBe(false);
  });

  test("U1 User rejects malformed UUID and enforces the provider enum plus additionalProperties", () => {
    const valid = {
      avatar_url: null,
      created_at: VALID_DATE_TIME,
      id: VALID_UUID,
      nickname: "n",
      provider: "kakao",
    };
    expect(validateUser(valid)).toBe(true);
    expect(validateUser({ ...valid, id: "not-a-uuid" })).toBe(false);
    expect(validateUser({ ...valid, provider: "apple" })).toBe(false);
    expect(validateUser({ ...valid, extra: true })).toBe(false);
    const { avatar_url: _avatarUrl, ...missingAvatar } = valid;
    expect(validateUser(missingAvatar)).toBe(false);
  });

  test("shared ErrorEnvelope requires a null details field and a request_id UUID", () => {
    const valid = {
      error: {
        code: "not_found",
        details: null,
        message: "Not found.",
        request_id: VALID_UUID,
      },
    };
    expect(validateErrorEnvelope(valid)).toBe(true);
    expect(
      validateErrorEnvelope({ error: { ...valid.error, details: "oops" } }),
    ).toBe(false);
    expect(
      validateErrorEnvelope({ error: { ...valid.error, request_id: "bad" } }),
    ).toBe(false);
  });

  test("A5 is browser-only: the callback query is parsed, never fetched as JSON", () => {
    expect(
      parseOAuthCallbackQuery("kakao", { code: "auth-code", state: STATE }),
    ).toEqual({
      code: "auth-code",
      outcome: "authorized",
      provider: "kakao",
      state: STATE,
    });
    expect(
      parseOAuthCallbackQuery("kakao", {
        error: "access_denied",
        state: STATE,
      }),
    ).toEqual({
      error: "access_denied",
      outcome: "denied",
      provider: "kakao",
      state: STATE,
    });
    expect(
      "issues" in
        (parseOAuthCallbackQuery("kakao", {
          code: "auth-code",
          error: "access_denied",
          state: STATE,
        }) as Record<string, unknown>),
    ).toBe(true);
    expect(
      "issues" in
        (parseOAuthCallbackQuery("kakao", { state: STATE }) as Record<
          string,
          unknown
        >),
    ).toBe(true);
    expect(
      "issues" in
        (parseOAuthCallbackQuery("kakao", {
          code: "auth-code",
          state: "short",
        }) as Record<string, unknown>),
    ).toBe(true);
  });
});
