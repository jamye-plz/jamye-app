import type {
  AppleAuthenticationPort,
  AppleSignInResult,
} from "./apple-authentication.shared";

/**
 * D16/U3/E13: Sign in with Apple ships iOS-only -- `expo-apple-authentication`
 * has no Android native implementation (its `expo-module.config.json` lists
 * only the "apple" platform), so this file is the Android/default port
 * implementation, which always reports the feature unavailable and never
 * touches native code. `apple-authentication-port.ios.ts` overrides
 * `appleAuthenticationPort` on iOS via Metro's platform extension
 * resolution; only that file imports `expo-apple-authentication` (common
 * rules: the import stays out of any file Android/web can load).
 *
 * Shared types and `createAppleNonce` live in `apple-authentication.shared.ts`
 * (no platform variants) -- import them from there directly, not from this
 * file or the `.ios.ts` sibling (fix round 1: importing/re-exporting
 * `./apple-authentication-port` from inside `apple-authentication-port.ios.ts`
 * resolved back to itself under Metro/Jest platform resolution and recursed
 * forever).
 */

const UNAVAILABLE_MESSAGE = "이 기기에서는 Apple로 로그인할 수 없습니다.";

export const appleAuthenticationPort: AppleAuthenticationPort = {
  async isAvailableAsync() {
    return false;
  },
  async signIn(): Promise<AppleSignInResult> {
    return { type: "error", message: UNAVAILABLE_MESSAGE };
  },
};
