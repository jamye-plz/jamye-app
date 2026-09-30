import * as Crypto from "expo-crypto";

/**
 * Platform-neutral parts of the Apple auth port: shared types and the nonce
 * generator. Kept in a module with no `.ios.ts` sibling (the repo's
 * `.shared.ts` precedent, e.g. `src/shared/ui/avatar.shared.ts`), because a
 * bare `./apple-authentication-port` specifier *inside*
 * `apple-authentication-port.ios.ts` resolves back to that same `.ios.ts`
 * file under both Metro and Jest -- re-exporting from it there recursed
 * forever (coordinator fix round 1: "RangeError: Maximum call stack size
 * exceeded" at `apple-authentication-port.ios.ts:10`). Neither port file
 * may import or re-export from `./apple-authentication-port`; both
 * `apple-authentication-port.ts` and `apple-authentication-port.ios.ts`
 * import from here instead, and so do their consumers
 * (`auth-controller.ts`, `session-provider.tsx`, tests) for types and the
 * nonce.
 */

/** E15: only the user's name is ever requested (no email scope). */
export type AppleAuthScope = "fullName";

export type AppleSignInParams = Readonly<{
  /** The already-hashed (sha256, hex) nonce sent to Apple's native sheet. */
  nonce: string;
  requestedScopes: readonly AppleAuthScope[];
}>;

export type AppleSignInResult =
  | Readonly<{
      type: "success";
      identityToken: string;
      authorizationCode: string;
      /** iOS-locale-formatted display name (`AppleAuthentication.formatFullName`); absent when Apple did not return one. */
      fullName?: string;
    }>
  | Readonly<{ type: "cancel" }>
  | Readonly<{ type: "error"; message: string }>;

export type AppleAuthenticationPort = Readonly<{
  isAvailableAsync: () => Promise<boolean>;
  signIn: (params: AppleSignInParams) => Promise<AppleSignInResult>;
}>;

function toHex(bytes: Uint8Array): string {
  let value = "";
  for (const byte of bytes) value += byte.toString(16).padStart(2, "0");
  return value;
}

/**
 * E15 nonce shape: a random raw value the caller keeps (to send the server
 * once A6 is wired -- task-app-contract) and its sha256 hex hash, which is
 * what actually crosses the OS boundary into Apple's native sheet
 * (`AppleSignInParams.nonce`). Mirrors `pkce.ts`'s random-bytes pattern with
 * hex instead of base64url encoding.
 */
export async function createAppleNonce(): Promise<
  Readonly<{ raw: string; hashed: string }>
> {
  const bytes = Crypto.getRandomValues(new Uint8Array(32));
  const raw = toHex(bytes);
  const hashed = await Crypto.digestStringAsync(
    Crypto.CryptoDigestAlgorithm.SHA256,
    raw,
    { encoding: Crypto.CryptoEncoding.HEX },
  );
  return { raw, hashed };
}
