export const OAUTH_PROVIDERS = ["kakao", "google"] as const;
export type OAuthProvider = (typeof OAUTH_PROVIDERS)[number];

export type TokenPair = Readonly<{
  accessToken: string;
  accessTokenExpiresAt: string;
  refreshToken: string;
  refreshTokenExpiresAt: string;
}>;

export type UserProfile = Readonly<{
  id: string;
  provider: string;
  nickname: string;
  avatarUrl: string | null;
  createdAt: string;
}>;

export type AuthFailure = Readonly<{
  code: string;
  message: string;
  terminal?: boolean;
}>;
