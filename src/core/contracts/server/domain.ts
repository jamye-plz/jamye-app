import type { OAuthProvider, TokenPair, UserProfile } from "../../auth/types";

import type {
  DependencyStatusWire,
  LivenessResponseWire,
  OAuthAuthorizeOutWire,
  ReadinessResponseWire,
  TokenPairWire,
  UserWire,
} from "./validators";

export type HealthLiveness = Readonly<{ status: "live" }>;

export type DependencyHealth = Readonly<{
  status: DependencyStatusWire;
  required: boolean;
}>;

export type HealthReadiness = Readonly<{
  status: "ready" | "not_ready";
  dependencies: Readonly<{
    postgres: DependencyHealth;
    redis: DependencyHealth;
    minio: DependencyHealth;
  }>;
}>;

export type OAuthAuthorization = Readonly<{
  authorizationUrl: string;
  state: string;
  expiresInSeconds: number;
}>;

export function mapLiveness(wire: LivenessResponseWire): HealthLiveness {
  return { status: wire.status };
}

export function mapReadiness(wire: ReadinessResponseWire): HealthReadiness {
  return {
    dependencies: {
      minio: {
        required: wire.checks.minio.required,
        status: wire.checks.minio.status,
      },
      postgres: {
        required: wire.checks.postgres.required,
        status: wire.checks.postgres.status,
      },
      redis: {
        required: wire.checks.redis.required,
        status: wire.checks.redis.status,
      },
    },
    status: wire.status,
  };
}

export function mapOAuthAuthorization(
  wire: OAuthAuthorizeOutWire,
): OAuthAuthorization {
  return {
    authorizationUrl: wire.authorization_url,
    expiresInSeconds: wire.expires_in_seconds,
    state: wire.state,
  };
}

export function mapTokenPair(wire: TokenPairWire): TokenPair {
  return {
    accessToken: wire.access_token,
    accessTokenExpiresAt: wire.access_token_expires_at,
    refreshToken: wire.refresh_token,
    refreshTokenExpiresAt: wire.refresh_token_expires_at,
  };
}

export function mapUserProfile(wire: UserWire): UserProfile {
  return {
    avatarUrl: wire.avatar_url,
    createdAt: wire.created_at,
    id: wire.id,
    nickname: wire.nickname,
    provider: wire.provider,
  };
}

export function isKnownOAuthProvider(value: string): value is OAuthProvider {
  return value === "kakao" || value === "google";
}
