import { parsePublicApiOrigin } from "@/core/config/public-env";
import {
  mapOAuthAuthorization,
  mapTokenPair,
  mapUserProfile,
  validateOAuthAuthorizeOut,
  validateErrorEnvelope,
  validateTokenPair,
  validateUser,
} from "@/core/contracts/server";
import {
  HttpAbortedError,
  REQUEST_TIMEOUT_MS,
  withTimeoutSignal,
} from "@/core/http/http-client";

import type { OAuthProvider, TokenPair, UserProfile } from "./types";

export class AuthApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
  ) {
    super(code);
  }
}

export function isCallerCancelled(error: unknown): boolean {
  return (
    error instanceof AuthApiError &&
    error.status === 0 &&
    error.code === "request_cancelled"
  );
}

export type AuthApi = Readonly<{
  authorize: (
    provider: OAuthProvider,
    input: Readonly<{ redirectUri: string; challenge: string }>,
    signal?: AbortSignal,
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
    signal?: AbortSignal,
  ) => Promise<TokenPair>;
  refresh: (refreshToken: string, signal?: AbortSignal) => Promise<TokenPair>;
  profile: (accessToken: string, signal?: AbortSignal) => Promise<UserProfile>;
  logout: (accessToken: string, signal?: AbortSignal) => Promise<void>;
}>;

export function createAuthApi(origin: string): AuthApi {
  const apiOrigin = parsePublicApiOrigin(origin);
  const request = async (
    path: string,
    init: RequestInit = {},
    signal?: AbortSignal,
    expectedStatus = 200,
  ) => {
    try {
      const { status, ok, payload } = await withTimeoutSignal(
        signal,
        REQUEST_TIMEOUT_MS,
        async (composedSignal) => {
          const response = await fetch(`${apiOrigin}${path}`, {
            ...init,
            credentials: "omit",
            redirect: "error",
            signal: composedSignal,
            headers: {
              Accept: "application/json",
              ...(init.body ? { "Content-Type": "application/json" } : {}),
              ...(init.headers ?? {}),
            },
          });
          const body: unknown =
            response.status === 204
              ? null
              : await response.json().catch((error: unknown) => {
                  if (error instanceof Error && error.name === "AbortError")
                    throw error;
                  return null;
                });
          return { status: response.status, ok: response.ok, payload: body };
        },
      );
      if (!ok) {
        const code = validateErrorEnvelope(payload)
          ? payload.error.code
          : "request_failed";
        throw new AuthApiError(status, code);
      }
      if (status !== expectedStatus)
        throw new AuthApiError(502, "invalid_response_status");
      return payload;
    } catch (error) {
      if (error instanceof AuthApiError) throw error;
      if (error instanceof HttpAbortedError)
        throw error.by === "caller"
          ? new AuthApiError(0, "request_cancelled")
          : new AuthApiError(408, "request_timeout");
      throw new AuthApiError(0, "network_unavailable");
    }
  };
  return {
    async authorize(provider, input, signal) {
      const value = await request(
        `/api/v1/auth/oauth/${provider}/authorize`,
        {
          method: "POST",
          body: JSON.stringify({
            redirect_uri: input.redirectUri,
            code_challenge: input.challenge,
            code_challenge_method: "S256",
          }),
        },
        signal,
      );
      if (
        !validateOAuthAuthorizeOut(value) ||
        !isProviderAuthorizationUrl(value.authorization_url, provider)
      )
        throw new AuthApiError(502, "invalid_authorize_response");
      return mapOAuthAuthorization(value);
    },
    async exchange(provider, input, signal) {
      const value = await request(
        `/api/v1/auth/oauth/${provider}/exchange`,
        {
          method: "POST",
          body: JSON.stringify({
            authorization_code: input.authorizationCode,
            state: input.state,
            code_verifier: input.verifier,
            redirect_uri: input.redirectUri,
          }),
        },
        signal,
      );
      if (!validateTokenPair(value))
        throw new AuthApiError(502, "invalid_token_response");
      return mapTokenPair(value);
    },
    async refresh(refreshToken, signal) {
      const value = await request(
        "/api/v1/auth/refresh",
        {
          method: "POST",
          body: JSON.stringify({ refresh_token: refreshToken }),
        },
        signal,
      );
      if (!validateTokenPair(value))
        throw new AuthApiError(502, "invalid_token_response");
      return mapTokenPair(value);
    },
    async profile(accessToken, signal) {
      const value = await request(
        "/api/v1/me",
        { headers: { Authorization: `Bearer ${accessToken}` } },
        signal,
      );
      if (!validateUser(value))
        throw new AuthApiError(502, "invalid_profile_response");
      return mapUserProfile(value);
    },
    async logout(accessToken, signal) {
      await request(
        "/api/v1/auth/logout",
        {
          method: "POST",
          headers: { Authorization: `Bearer ${accessToken}` },
        },
        signal,
        204,
      );
    },
  };
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
