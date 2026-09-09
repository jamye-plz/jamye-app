import * as AuthSession from "expo-auth-session";

import type { OAuthProvider } from "./types";

export function appReturnUri(provider: OAuthProvider): string {
  return AuthSession.makeRedirectUri({
    scheme: "jamye",
    path: `oauth/${provider}`,
  });
}

export function providerRedirectUri(
  origin: string,
  provider: OAuthProvider,
): string {
  return `${origin}/api/v1/auth/oauth/${provider}/callback`;
}
