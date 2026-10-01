import { pendingAccountRestoreStore } from "@/features/auth/model/pending-account-restore-store";

import type { AuthApi } from "./auth-api";
import type { AuthState } from "./auth-controller";
import { parseOAuthCallback } from "./callback";
import type { OAuthProvider, TokenPair } from "./types";

export type BrowserResult =
  | Readonly<{ type: "success"; url: string }>
  | Readonly<{ type: "cancel" | "dismiss" | "locked" }>;

type PendingAttempt = Readonly<{
  provider: OAuthProvider;
  state: string;
  verifier: string;
  redirectUri: string;
  expiresAtMs: number;
  generation: number;
}>;

/**
 * F6/AUTH-AC5: Kakao/Google PKCE `signIn()` orchestration, extracted
 * unchanged from `auth-controller.ts`'s `createAuthController`. Returns the
 * bound `signIn` function directly. See `auth-controller.ts`'s
 * `createAuthController` for how this is composed with the other extracted
 * modules.
 */
export function createOAuthSignIn(
  deps: Readonly<{
    api: AuthApi;
    createPkce: () => Promise<
      Readonly<{ verifier: string; challenge: string }>
    >;
    openBrowser: (url: string, redirectUri: string) => Promise<BrowserResult>;
    nowMs?: () => number;
    publish: (next: AuthState) => void;
    active: (value: number) => boolean;
    beginGeneration: () => number;
    requestSignal: (callerSignal?: AbortSignal) => AbortSignal;
    getTokens: () => TokenPair | null;
    persistThenProfile: (
      pair: TokenPair,
      expectedGeneration: number,
      signal?: AbortSignal,
    ) => Promise<boolean>;
  }>,
) {
  let pending: PendingAttempt | null = null;
  const expired = (attempt: PendingAttempt) =>
    (deps.nowMs?.() ?? Date.now()) > attempt.expiresAtMs;

  const signIn = async function signIn(
    provider: OAuthProvider,
    providerRedirectUri: string,
    appReturnUri: string,
    callerSignal?: AbortSignal,
  ) {
    const current = deps.beginGeneration();
    const signal = deps.requestSignal(callerSignal);
    pending = null;
    let exchangedPair: TokenPair | null = null;
    deps.publish({ status: "signing-in", profile: null, message: null });
    try {
      const pkce = await deps.createPkce();
      if (!deps.active(current)) return;
      const authorization = await deps.api.authorize(
        provider,
        { redirectUri: providerRedirectUri, challenge: pkce.challenge },
        signal,
      );
      if (!deps.active(current)) return;
      pending = {
        provider,
        state: authorization.state,
        verifier: pkce.verifier,
        redirectUri: providerRedirectUri,
        expiresAtMs:
          (deps.nowMs?.() ?? Date.now()) +
          authorization.expiresInSeconds * 1000,
        generation: current,
      };
      const browser = await deps.openBrowser(
        authorization.authorizationUrl,
        appReturnUri,
      );
      if (!deps.active(current)) return;
      if (browser.type !== "success") {
        pending = null;
        deps.publish({
          status: "signed-out",
          profile: null,
          message: "로그인이 취소되었습니다.",
        });
        return;
      }
      const attempt = pending;
      pending = null;
      if (!attempt || expired(attempt)) throw new Error("expired");
      const callback = parseOAuthCallback(browser.url, provider);
      if (callback.state !== attempt.state) throw new Error("state");
      if (callback.kind === "error") {
        deps.publish({
          status: "signed-out",
          profile: null,
          message:
            callback.error === "access_denied"
              ? "로그인이 취소되었습니다."
              : "로그인을 완료할 수 없습니다.",
        });
        return;
      }
      // M15/task-14 phase 1 (G2/E13): the one-shot restore notice reads
      // `accountRestored` here and hands it to `pendingAccountRestoreStore`;
      // the persisted pair below stays the closed TokenPair shape (see
      // src/core/auth/auth-api.ts's exchange()).
      const { accountRestored, ...pair } = await deps.api.exchange(
        provider,
        {
          authorizationCode: callback.code,
          state: callback.state,
          verifier: attempt.verifier,
          redirectUri: attempt.redirectUri,
        },
        signal,
      );
      exchangedPair = pair;
      if (!deps.active(current)) return;
      if (accountRestored) pendingAccountRestoreStore.set();
      await deps.persistThenProfile(pair, current, signal);
    } catch {
      if (deps.active(current)) {
        pending = null;
        deps.publish({
          status: "error",
          profile: null,
          message: "로그인을 완료할 수 없습니다. 다시 시도해 주세요.",
          retryAction:
            exchangedPair && deps.getTokens() === exchangedPair
              ? "retryProfile"
              : undefined,
        });
      }
    }
  };

  /** Invalidates any in-flight PKCE attempt (e.g. a concurrent `logout()`) without touching the session epoch itself. */
  const resetPending = () => {
    pending = null;
  };

  return { signIn, resetPending };
}
