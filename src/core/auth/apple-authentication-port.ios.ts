import * as AppleAuthentication from "expo-apple-authentication";

import type {
  AppleAuthenticationPort,
  AppleAuthScope,
  AppleSignInParams,
  AppleSignInResult,
} from "./apple-authentication.shared";

const SCOPE_MAP: Record<
  AppleAuthScope,
  AppleAuthentication.AppleAuthenticationScope
> = {
  fullName: AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
};

/**
 * Formats Apple's tokenized name in iOS locale order (e.g. Korean
 * 성+이름) via the real SDK helper. An absent or blank name resolves to
 * `undefined` -- never a placeholder string (common rules: "이름이 없으면
 * 없음으로 둔다").
 */
function formatName(
  fullName: AppleAuthentication.AppleAuthenticationFullName | null,
): string | undefined {
  if (!fullName) return undefined;
  const formatted = AppleAuthentication.formatFullName(fullName).trim();
  return formatted.length > 0 ? formatted : undefined;
}

function isCancelled(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: unknown }).code === "ERR_REQUEST_CANCELED"
  );
}

function errorMessage(error: unknown): string {
  return error instanceof Error
    ? error.message
    : "Apple 로그인을 완료할 수 없습니다.";
}

/**
 * iOS implementation. Types and `createAppleNonce` come from
 * `apple-authentication.shared.ts`, never from `./apple-authentication-port`
 * -- that bare specifier resolves back to *this* file under Metro/Jest
 * platform resolution, and re-exporting from it here recursed forever (fix
 * round 1: "RangeError: Maximum call stack size exceeded" at this file's
 * former line 10).
 */
export const appleAuthenticationPort: AppleAuthenticationPort = {
  isAvailableAsync: () => AppleAuthentication.isAvailableAsync(),
  async signIn({
    nonce,
    requestedScopes,
  }: AppleSignInParams): Promise<AppleSignInResult> {
    try {
      const credential = await AppleAuthentication.signInAsync({
        nonce,
        requestedScopes: requestedScopes.map((scope) => SCOPE_MAP[scope]),
      });
      // `signInAsync` already rejects with `ERR_REQUEST_FAILED` when either
      // is missing, but its declared return type still carries
      // `string | null` -- this narrows for the success variant below.
      if (!credential.identityToken || !credential.authorizationCode) {
        return {
          type: "error",
          message: "Apple 인증 정보를 받지 못했습니다.",
        };
      }
      return {
        type: "success",
        identityToken: credential.identityToken,
        authorizationCode: credential.authorizationCode,
        fullName: formatName(credential.fullName),
      };
    } catch (error) {
      if (isCancelled(error)) return { type: "cancel" };
      return { type: "error", message: errorMessage(error) };
    }
  },
};
