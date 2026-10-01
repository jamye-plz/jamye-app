import { pendingAccountRestoreStore } from "@/features/auth/model/pending-account-restore-store";

import type { AppleAuthenticationPort } from "./apple-authentication.shared";
import { sendableFullName } from "./apple-full-name";
import type { AuthApi } from "./auth-api";
import type { AuthState } from "./auth-controller";
import type { TokenPair } from "./types";

/**
 * F6/AUTH-AC5: Apple sign-in orchestration, extracted unchanged from
 * `auth-controller.ts`'s `createAuthController`. Returns the bound
 * `signInWithApple` function directly. See `auth-controller.ts`'s
 * `createAuthController` for how this is composed with the other extracted
 * modules.
 *
 * Apple auth interface slot (E14/E15/AC3/AC4, plan
 * `api_contracts.app.login_flow_E15`): orchestrates the native Apple
 * sheet exactly like `signIn` orchestrates the browser -- publishing
 * "signing-in" before it (so the shared busy/disabled state spans the
 * whole native interaction, not just a network call), a silent
 * `signed-out` on `AppleSignInResult.type === "cancel"` (U3/E14: cancel
 * never shows a notice), and `error` otherwise. APPCON-AC3/AC4: a
 * successful native credential calls A6 (`deps.api.exchangeApple`) with
 * the *raw* nonce (Apple only ever saw its sha256 hex hash) and the
 * port-formatted `fullName` gated through `sendableFullName` (E15/U6:
 * omit rather than send an empty/too-long/control-character name so the
 * server's `Apple{6}` fallback nickname applies instead of a 400 --
 * login is never blocked by a bad name). Any `AuthApiError` from A6 (422
 * apple_identity_token_invalid, 404 oauth_provider_not_supported, 503
 * provider_unavailable) or a network failure falls into the same
 * catch-all below as `signIn`'s own OAuth exchange failure -- one
 * generic retryable message, no per-code UI.
 */
export function createAppleSignIn(
  deps: Readonly<{
    api: AuthApi;
    applePort?: AppleAuthenticationPort;
    createAppleNonce?: () => Promise<Readonly<{ raw: string; hashed: string }>>;
    publish: (next: AuthState) => void;
    active: (value: number) => boolean;
    beginGeneration: () => number;
    requestSignal: (callerSignal?: AbortSignal) => AbortSignal;
    persistThenProfile: (
      pair: TokenPair,
      expectedGeneration: number,
      signal?: AbortSignal,
    ) => Promise<boolean>;
  }>,
) {
  return async function signInWithApple(callerSignal?: AbortSignal) {
    const current = deps.beginGeneration();
    if (!deps.applePort || !deps.createAppleNonce) {
      if (deps.active(current))
        deps.publish({
          status: "error",
          profile: null,
          message: "Apple 로그인을 사용할 수 없습니다.",
        });
      return;
    }
    const signal = deps.requestSignal(callerSignal);
    deps.publish({ status: "signing-in", profile: null, message: null });
    try {
      const nonce = await deps.createAppleNonce();
      if (!deps.active(current) || signal.aborted) return;
      const result = await deps.applePort.signIn({
        nonce: nonce.hashed,
        requestedScopes: ["fullName"],
      });
      if (!deps.active(current) || signal.aborted) return;
      if (result.type === "cancel") {
        deps.publish({ status: "signed-out", profile: null, message: null });
        return;
      }
      if (result.type === "error") {
        deps.publish({
          status: "error",
          profile: null,
          message: "Apple 로그인을 완료할 수 없습니다. 다시 시도해 주세요.",
        });
        return;
      }
      const { accountRestored, ...pair } = await deps.api.exchangeApple(
        {
          identityToken: result.identityToken,
          rawNonce: nonce.raw,
          fullName: sendableFullName(result.fullName),
        },
        signal,
      );
      if (!deps.active(current) || signal.aborted) return;
      if (accountRestored) pendingAccountRestoreStore.set();
      await deps.persistThenProfile(pair, current, signal);
    } catch {
      if (deps.active(current))
        deps.publish({
          status: "error",
          profile: null,
          message: "Apple 로그인을 완료할 수 없습니다. 다시 시도해 주세요.",
        });
    }
  };
}
