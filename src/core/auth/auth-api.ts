import type { OAuthProvider, TokenPair, UserProfile } from "./types";

export class AuthApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
  ) {
    super(code);
  }
}

export type AuthApi = Readonly<{
  authorize: (
    provider: OAuthProvider,
    input: Readonly<{ redirectUri: string; challenge: string }>,
  ) => Promise<
    Readonly<{
      authorizationUrl: string;
      state: string;
      expiresInSeconds: number;
    }>
  >;
  exchange: (
    provider: OAuthProvider,
    input: Readonly<{
      authorizationCode: string;
      state: string;
      verifier: string;
      redirectUri: string;
    }>,
  ) => Promise<TokenPair>;
  refresh: (refreshToken: string) => Promise<TokenPair>;
  profile: (accessToken: string) => Promise<UserProfile>;
  logout: (accessToken: string) => Promise<void>;
}>;

export function createAuthApi(origin: string): AuthApi {
  const request = async (path: string, init: RequestInit = {}) => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 15_000);
    try {
      const response = await fetch(`${origin}${path}`, {
        ...init,
        signal: controller.signal,
        headers: {
          Accept: "application/json",
          ...(init.body ? { "Content-Type": "application/json" } : {}),
          ...(init.headers ?? {}),
        },
      });
      const payload: unknown =
        response.status === 204
          ? null
          : await response.json().catch((error: unknown) => {
              if (error instanceof Error && error.name === "AbortError")
                throw error;
              return null;
            });
      if (!response.ok) {
        const code =
          isRecord(payload) &&
          isRecord(payload.error) &&
          typeof payload.error.code === "string"
            ? payload.error.code
            : "request_failed";
        throw new AuthApiError(response.status, code);
      }
      return payload;
    } catch (error) {
      if (error instanceof AuthApiError) throw error;
      if (error instanceof Error && error.name === "AbortError")
        throw new AuthApiError(408, "request_timeout");
      throw new AuthApiError(0, "network_unavailable");
    } finally {
      clearTimeout(timer);
    }
  };
  return {
    async authorize(provider, input) {
      const value = await request(`/api/v1/auth/oauth/${provider}/authorize`, {
        method: "POST",
        body: JSON.stringify({
          redirect_uri: input.redirectUri,
          code_challenge: input.challenge,
          code_challenge_method: "S256",
        }),
      });
      if (
        !isRecord(value) ||
        typeof value.authorization_url !== "string" ||
        !isProviderAuthorizationUrl(value.authorization_url, provider) ||
        typeof value.state !== "string" ||
        !/^[A-Za-z0-9_-]{43}$/.test(value.state) ||
        value.expires_in_seconds !== 600
      )
        throw new AuthApiError(502, "invalid_authorize_response");
      return {
        authorizationUrl: value.authorization_url,
        state: value.state,
        expiresInSeconds: value.expires_in_seconds,
      };
    },
    async exchange(provider, input) {
      const value = await request(`/api/v1/auth/oauth/${provider}/exchange`, {
        method: "POST",
        body: JSON.stringify({
          authorization_code: input.authorizationCode,
          state: input.state,
          code_verifier: input.verifier,
          redirect_uri: input.redirectUri,
        }),
      });
      return parseTokenPair(value);
    },
    async refresh(refreshToken) {
      const value = await request("/api/v1/auth/refresh", {
        method: "POST",
        body: JSON.stringify({ refresh_token: refreshToken }),
      });
      return parseTokenPair(value);
    },
    async profile(accessToken) {
      const value = await request("/api/v1/me", {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      if (
        !isRecord(value) ||
        !["id", "provider", "nickname", "created_at"].every(
          (key) => typeof value[key] === "string",
        ) ||
        !(typeof value.avatar_url === "string" || value.avatar_url === null)
      )
        throw new AuthApiError(502, "invalid_profile_response");
      return {
        id: value.id as string,
        provider: value.provider as string,
        nickname: value.nickname as string,
        avatarUrl: value.avatar_url as string | null,
        createdAt: value.created_at as string,
      };
    },
    async logout(accessToken) {
      await request("/api/v1/auth/logout", {
        method: "POST",
        headers: { Authorization: `Bearer ${accessToken}` },
      });
    },
  };
}

function parseTokenPair(value: unknown): TokenPair {
  if (
    !isRecord(value) ||
    value.token_type !== "Bearer" ||
    ![
      "access_token",
      "access_token_expires_at",
      "refresh_token",
      "refresh_token_expires_at",
    ].every((key) => typeof value[key] === "string" && value[key].length > 0)
  )
    throw new AuthApiError(502, "invalid_token_response");
  return {
    accessToken: value.access_token as string,
    accessTokenExpiresAt: value.access_token_expires_at as string,
    refreshToken: value.refresh_token as string,
    refreshTokenExpiresAt: value.refresh_token_expires_at as string,
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isProviderAuthorizationUrl(
  value: string,
  provider: OAuthProvider,
): boolean {
  try {
    const parsed = new URL(value);
    if (parsed.username || parsed.password || parsed.hash) return false;
    return provider === "kakao"
      ? parsed.origin === "https://kauth.kakao.com" &&
          parsed.pathname === "/oauth/authorize"
      : parsed.origin === "https://accounts.google.com" &&
          parsed.pathname === "/o/oauth2/v2/auth";
  } catch {
    return false;
  }
}
