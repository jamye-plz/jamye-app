import {
  isKnownOAuthProvider,
  mapLiveness,
  mapOAuthAuthorization,
  mapReadiness,
  mapTokenPair,
  mapUserProfile,
} from "@/core/contracts/server";

describe("M6-01 server contract domain mappers", () => {
  test("maps liveness and readiness wire payloads to camelCase domain shapes", () => {
    expect(mapLiveness({ status: "live" })).toEqual({ status: "live" });
    expect(
      mapReadiness({
        checks: {
          minio: { required: false, status: "degraded" },
          postgres: { required: true, status: "ready" },
          redis: { required: true, status: "ready" },
        },
        status: "ready",
      }),
    ).toEqual({
      dependencies: {
        minio: { required: false, status: "degraded" },
        postgres: { required: true, status: "ready" },
        redis: { required: true, status: "ready" },
      },
      status: "ready",
    });
  });

  test("maps OAuthAuthorizeOut wire fields to the domain authorization shape", () => {
    expect(
      mapOAuthAuthorization({
        authorization_url: "https://kauth.kakao.com/oauth/authorize",
        expires_in_seconds: 600,
        state: "s".repeat(43),
      }),
    ).toEqual({
      authorizationUrl: "https://kauth.kakao.com/oauth/authorize",
      expiresInSeconds: 600,
      state: "s".repeat(43),
    });
  });

  test("maps TokenPair wire fields onto the existing auth TokenPair domain type", () => {
    expect(
      mapTokenPair({
        access_token: "access",
        access_token_expires_at: "2024-01-01T00:00:00Z",
        refresh_token: "r".repeat(43),
        refresh_token_expires_at: "2024-02-01T00:00:00Z",
        token_type: "Bearer",
      }),
    ).toEqual({
      accessToken: "access",
      accessTokenExpiresAt: "2024-01-01T00:00:00Z",
      refreshToken: "r".repeat(43),
      refreshTokenExpiresAt: "2024-02-01T00:00:00Z",
    });
  });

  test("maps User wire fields onto the existing auth UserProfile domain type", () => {
    expect(
      mapUserProfile({
        avatar_url: null,
        created_at: "2024-01-01T00:00:00Z",
        id: "11111111-1111-4111-8111-111111111111",
        nickname: "nick",
        provider: "google",
      }),
    ).toEqual({
      avatarUrl: null,
      createdAt: "2024-01-01T00:00:00Z",
      id: "11111111-1111-4111-8111-111111111111",
      nickname: "nick",
      provider: "google",
    });
  });

  test("recognizes only the two supported OAuth providers", () => {
    expect(isKnownOAuthProvider("kakao")).toBe(true);
    expect(isKnownOAuthProvider("google")).toBe(true);
    expect(isKnownOAuthProvider("apple")).toBe(false);
  });
});
