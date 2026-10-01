import { AuthApiError } from "./auth-api";
import type { AuthApi } from "./auth-api";
import type { AppleAuthenticationPort } from "./apple-authentication.shared";
import { createAppleSignIn } from "./apple-sign-in";
import { createGenerationGuard } from "./auth-generation";
import { createOAuthSignIn } from "./oauth-sign-in";
import type { BrowserResult } from "./oauth-sign-in";
import {
  createRefresh,
  isUnauthorized,
  tokenExpired,
} from "./refresh-single-flight";
import {
  createSessionPersistence,
  SESSION_CLEAR_FAILED_STATE,
} from "./session-persistence";
import type { SessionStore } from "./secure-session-store";
import type { TokenPair, UserProfile } from "./types";

export type AuthState = Readonly<{
  status: "loading" | "signed-out" | "signing-in" | "signed-in" | "error";
  profile: UserProfile | null;
  message: string | null;
  retryAction?: "restore" | "retryProfile" | "logout";
}>;

type FullAuthController = ReturnType<typeof createAuthController>;
/**
 * `signInWithApple` is optional here (unlike every other method) so the
 * many existing fake `AuthController` test doubles across the suite (e.g.
 * `tests/core/providers/session-provider.test.tsx`,
 * `tests/core/app-providers.test.tsx`,
 * `tests/features/auth/session-splash.test.tsx`) keep typechecking without
 * adding it. The real controller returned by `createAuthController` always
 * provides it as a real function.
 */
export type AuthController = Omit<FullAuthController, "signInWithApple"> &
  Readonly<{ signInWithApple?: FullAuthController["signInWithApple"] }>;

/**
 * F6/AUTH-AC5: this file is now the `AuthController`/`createAuthController`
 * public API wrapper and composition root only. The generation/epoch guard,
 * secure-storage persistence, the refresh single-flight, and the two sign-in
 * orchestrations each moved to their own module (`auth-generation.ts`,
 * `session-persistence.ts`, `refresh-single-flight.ts`, `oauth-sign-in.ts`,
 * `apple-sign-in.ts`, `apple-full-name.ts`) with identical behavior --
 * `restore`/`logout`/`authorizedRequest`/`applyProfile`/`retryProfile` stay
 * here since they are not shared by more than one entry point. Every
 * `this.refresh()` call site was replaced with a direct reference to the
 * local `refresh` const per AUTH-AC5.
 */
export function createAuthController(
  deps: Readonly<{
    origin: string;
    api: AuthApi;
    store: SessionStore;
    openBrowser: (url: string, redirectUri: string) => Promise<BrowserResult>;
    createPkce: () => Promise<
      Readonly<{ verifier: string; challenge: string }>
    >;
    // Apple auth interface slot (task-app-ui/task-app-contract split, plan
    // api_contracts.app.login_flow_E15): optional so every existing deps
    // literal across the test suite keeps typechecking without them.
    // Production (session-provider.tsx's createProductionSessionController)
    // always supplies both.
    applePort?: AppleAuthenticationPort;
    createAppleNonce?: () => Promise<Readonly<{ raw: string; hashed: string }>>;
    nowMs?: () => number;
  }>,
) {
  let state: AuthState = { status: "loading", profile: null, message: null };
  let tokens: TokenPair | null = null;
  let disposed = false;
  let profileRetryFlight: Readonly<{
    generation: number;
    promise: Promise<void>;
  }> | null = null;
  const listeners = new Set<(value: AuthState) => void>();
  const publish = (next: AuthState) => {
    state = next;
    listeners.forEach((listener) => listener(state));
  };

  const generationGuard = createGenerationGuard();
  const { active, beginGeneration, requestSignal } = generationGuard;

  const getTokens = () => tokens;
  const setTokens = (value: TokenPair | null) => {
    tokens = value;
  };

  const { persistThenProfile, clearSessionAndPublish, serializeStorage } =
    createSessionPersistence({
      origin: deps.origin,
      api: deps.api,
      store: deps.store,
      publish,
      active,
      getTokens,
      setTokens,
    });

  const refresh = createRefresh({
    api: deps.api,
    nowMs: deps.nowMs,
    publish,
    active,
    requestSignal,
    getGeneration: () => generationGuard.generation,
    getTokens,
    persistThenProfile,
    clearSessionAndPublish,
  });

  const { signIn, resetPending: resetPendingOAuthAttempt } = createOAuthSignIn({
    api: deps.api,
    createPkce: deps.createPkce,
    openBrowser: deps.openBrowser,
    nowMs: deps.nowMs,
    publish,
    active,
    beginGeneration,
    requestSignal,
    getTokens,
    persistThenProfile,
  });

  const signInWithApple = createAppleSignIn({
    api: deps.api,
    applePort: deps.applePort,
    createAppleNonce: deps.createAppleNonce,
    publish,
    active,
    beginGeneration,
    requestSignal,
    persistThenProfile,
  });

  return {
    getState: () => state,
    /** The current session epoch; a fresh SessionPrincipal is only valid alongside the epoch it was read at. */
    getGeneration: () => generationGuard.generation,
    subscribe(listener: (value: AuthState) => void) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    /** Fences all in-flight work owned by this controller instance without touching secure storage. */
    dispose() {
      generationGuard.fenceForDispose();
      disposed = true;
    },
    async restore(callerSignal?: AbortSignal) {
      const current = beginGeneration();
      const signal = requestSignal(callerSignal);
      publish({ status: "loading", profile: null, message: null });
      try {
        const stored = await serializeStorage(current, () =>
          deps.store.load(deps.origin),
        );
        if (!active(current)) return;
        if (!stored) {
          if (active(current))
            publish({ status: "signed-out", profile: null, message: null });
          return;
        }
        tokens = stored;
        if (tokenExpired(stored.accessTokenExpiresAt, deps.nowMs)) {
          await refresh();
          return;
        }
        try {
          await persistThenProfile(stored, current, signal);
        } catch (error) {
          if (!active(current)) return;
          if (isUnauthorized(error)) await refresh();
          else
            publish({
              status: "error",
              profile: null,
              message: "세션을 복원할 수 없습니다. 다시 시도해 주세요.",
              retryAction: "retryProfile",
            });
        }
      } catch {
        if (active(current))
          publish({
            status: "error",
            profile: null,
            message: "보안 저장소를 사용할 수 없습니다.",
            retryAction: "restore",
          });
      }
    },
    signIn,
    signInWithApple,
    refresh,
    async logout(callerSignal?: AbortSignal) {
      const current = beginGeneration();
      const signal = requestSignal(callerSignal);
      resetPendingOAuthAttempt();
      const previous = tokens;
      tokens = null;
      publish({ status: "signed-out", profile: null, message: null });
      try {
        await serializeStorage(current, () => deps.store.clear());
      } catch {
        if (active(current)) publish(SESSION_CLEAR_FAILED_STATE);
        return;
      }
      if (previous)
        await deps.api
          .logout(previous.accessToken, signal)
          .catch(() => undefined);
    },
    /**
     * The narrow M7 authorized-request boundary is for data adapters, not UI.
     * An `execute` callback receives the current bearer
     * token and a request signal already fenced to this controller's epoch.
     * A 401 is retried through the existing single-flight refresh at most
     * once; a response that resolves after this generation was superseded
     * (dispose/restore/logout/account switch) is discarded as cancelled
     * rather than returned.
     */
    async authorizedRequest<T>(
      execute: (accessToken: string, signal: AbortSignal) => Promise<T>,
      callerSignal?: AbortSignal,
    ): Promise<T> {
      if (!tokens) throw new AuthApiError(401, "not_authenticated");
      const current = generationGuard.generation;
      const signal = requestSignal(callerSignal);
      const ensureActiveRequest = () => {
        if (!active(current) || signal.aborted)
          throw new AuthApiError(0, "request_cancelled");
      };
      const runOnce = async (accessToken: string): Promise<T> => {
        ensureActiveRequest();
        let result: T;
        try {
          result = await execute(accessToken, signal);
        } catch (error) {
          ensureActiveRequest();
          throw error;
        }
        ensureActiveRequest();
        return result;
      };
      try {
        return await runOnce(tokens.accessToken);
      } catch (error) {
        if (error instanceof AuthApiError && error.code === "request_cancelled")
          throw error;
        if (!isUnauthorized(error)) throw error;
        const refreshed = await refresh();
        ensureActiveRequest();
        if (!refreshed) throw error;
        return await runOnce(refreshed.accessToken);
      }
    },
    /**
     * Overlays a fresh profile (e.g. the U2 PATCH response) onto the live
     * signed-in identity with no network or storage I/O. It is a no-op unless
     * the controller is currently signed in, still holds tokens, has not been
     * disposed, and the profile belongs to the same user id: a result that
     * lands after logout/dispose, during a restore or sign-in, or for another
     * account must never republish a session.
     */
    applyProfile(profile: UserProfile): void {
      if (disposed || !tokens || state.status !== "signed-in") return;
      if (state.profile?.id !== profile.id) return;
      publish({ status: "signed-in", profile, message: null });
    },
    async retryProfile(callerSignal?: AbortSignal) {
      const current = generationGuard.generation;
      if (!tokens || callerSignal?.aborted) return;
      if (profileRetryFlight?.generation === current)
        return profileRetryFlight.promise;
      const signal = requestSignal(callerSignal);
      const retryableError = () =>
        publish({
          status: "error",
          profile: null,
          message: "프로필을 불러올 수 없습니다. 다시 시도해 주세요.",
          retryAction: "retryProfile",
        });
      const entry = {
        generation: current,
        promise: Promise.resolve()
          .then(async () => {
            if (!tokens || !active(current) || signal.aborted) return;
            publish({ status: "loading", profile: null, message: null });
            try {
              const profile = await deps.api.profile(
                tokens.accessToken,
                signal,
              );
              if (!active(current)) return;
              if (signal.aborted) retryableError();
              else publish({ status: "signed-in", profile, message: null });
            } catch (error) {
              if (!active(current)) return;
              if (!signal.aborted && isUnauthorized(error)) await refresh();
              else retryableError();
            }
          })
          .finally(() => {
            if (profileRetryFlight === entry) profileRetryFlight = null;
          }),
      };
      profileRetryFlight = entry;
      return entry.promise;
    },
  };
}
