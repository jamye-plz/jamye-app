import { anySignal } from "@/core/http/http-client";
import { pendingAccountRestoreStore } from "@/features/auth/model/pending-account-restore-store";

import { parseOAuthCallback } from "./callback";
import { AuthApiError } from "./auth-api";
import type { AuthApi } from "./auth-api";
import type { AppleAuthenticationPort } from "./apple-authentication.shared";
import type { SessionStore } from "./secure-session-store";
import type { OAuthProvider, TokenPair, UserProfile } from "./types";

export type AuthState = Readonly<{
  status: "loading" | "signed-out" | "signing-in" | "signed-in" | "error";
  profile: UserProfile | null;
  message: string | null;
  retryAction?: "restore" | "retryProfile" | "logout";
}>;
type BrowserResult =
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
type RefreshFlight = Readonly<{
  generation: number;
  promise: Promise<TokenPair | null>;
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

// Native I/O already in progress cannot be cancelled. All controllers sharing
// one secure record must drain it before a later owner reads or writes that record.
const storageQueues = new WeakMap<SessionStore, Promise<unknown>>();

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
  let pending: PendingAttempt | null = null;
  let generation = 0;
  let disposed = false;
  let fence: AbortController | null = null;
  let refreshFlight: RefreshFlight | null = null;
  let profileRetryFlight: Readonly<{
    generation: number;
    promise: Promise<void>;
  }> | null = null;
  const listeners = new Set<(value: AuthState) => void>();
  const publish = (next: AuthState) => {
    state = next;
    listeners.forEach((listener) => listener(state));
  };
  const expired = (attempt: PendingAttempt) =>
    (deps.nowMs?.() ?? Date.now()) > attempt.expiresAtMs;
  const tokenExpired = (value: string) => {
    const timestamp = Date.parse(value);
    return (
      !Number.isFinite(timestamp) || timestamp <= (deps.nowMs?.() ?? Date.now())
    );
  };
  const active = (value: number) => generation === value;

  /**
   * Fences everything the previous generation had in flight (aborts its
   * requests) and starts a new one. Every public entry point that begins a
   * new session epoch (restore/signIn/logout/dispose) goes through this so a
   * superseded generation can never publish state or mutate storage again.
   */
  const beginGeneration = () => {
    fence?.abort();
    fence = new AbortController();
    return ++generation;
  };
  const requestSignal = (callerSignal?: AbortSignal) =>
    anySignal([fence?.signal, callerSignal]);

  /** Queued secure-storage writes re-check the epoch at execution time, not just at enqueue time. */
  const serializeStorage = <T>(
    expectedGeneration: number,
    operation: () => Promise<T>,
  ) => {
    const run = () => (active(expectedGeneration) ? operation() : undefined);
    const queued = (storageQueues.get(deps.store) ?? Promise.resolve()).then(
      run,
      run,
    );
    storageQueues.set(
      deps.store,
      queued.then(
        () => undefined,
        () => undefined,
      ),
    );
    return queued;
  };
  async function persistThenProfile(
    pair: TokenPair,
    expectedGeneration: number,
    signal?: AbortSignal,
  ) {
    if (!active(expectedGeneration)) return false;
    try {
      await serializeStorage(expectedGeneration, () =>
        deps.store.save(deps.origin, pair),
      );
    } catch {
      if (active(expectedGeneration)) {
        await clearSessionAndPublish(
          expectedGeneration,
          "세션을 안전하게 저장할 수 없습니다. 다시 로그인해 주세요.",
        );
      }
      return false;
    }
    if (!active(expectedGeneration)) return false;
    tokens = pair;
    const profile = await deps.api.profile(pair.accessToken, signal);
    if (!active(expectedGeneration)) return false;
    publish({ status: "signed-in", profile, message: null });
    return true;
  }

  async function clearSessionAndPublish(
    expectedGeneration: number,
    message: string,
  ) {
    tokens = null;
    try {
      await serializeStorage(expectedGeneration, () => deps.store.clear());
      if (active(expectedGeneration))
        publish({ status: "signed-out", profile: null, message });
    } catch {
      if (active(expectedGeneration))
        publish({
          status: "error",
          profile: null,
          message:
            "보안 저장소에서 세션을 지울 수 없습니다. 다시 시도해 주세요.",
          retryAction: "logout",
        });
    }
  }

  return {
    getState: () => state,
    /** The current session epoch; a fresh SessionPrincipal is only valid alongside the epoch it was read at. */
    getGeneration: () => generation,
    subscribe(listener: (value: AuthState) => void) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    /** Fences all in-flight work owned by this controller instance without touching secure storage. */
    dispose() {
      fence?.abort();
      fence = null;
      generation++;
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
        if (tokenExpired(stored.accessTokenExpiresAt)) {
          await this.refresh();
          return;
        }
        try {
          await persistThenProfile(stored, current, signal);
        } catch (error) {
          if (!active(current)) return;
          if (isUnauthorized(error)) await this.refresh();
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
    async signIn(
      provider: OAuthProvider,
      providerRedirectUri: string,
      appReturnUri: string,
      callerSignal?: AbortSignal,
    ) {
      const current = beginGeneration();
      const signal = requestSignal(callerSignal);
      pending = null;
      let exchangedPair: TokenPair | null = null;
      publish({ status: "signing-in", profile: null, message: null });
      try {
        const pkce = await deps.createPkce();
        if (!active(current)) return;
        const authorization = await deps.api.authorize(
          provider,
          { redirectUri: providerRedirectUri, challenge: pkce.challenge },
          signal,
        );
        if (!active(current)) return;
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
        if (!active(current)) return;
        if (browser.type !== "success") {
          pending = null;
          publish({
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
          publish({
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
        if (!active(current)) return;
        if (accountRestored) pendingAccountRestoreStore.set();
        await persistThenProfile(pair, current, signal);
      } catch {
        if (active(current)) {
          pending = null;
          publish({
            status: "error",
            profile: null,
            message: "로그인을 완료할 수 없습니다. 다시 시도해 주세요.",
            retryAction:
              exchangedPair && tokens === exchangedPair
                ? "retryProfile"
                : undefined,
          });
        }
      }
    },
    /**
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
    async signInWithApple(callerSignal?: AbortSignal) {
      const current = beginGeneration();
      if (!deps.applePort || !deps.createAppleNonce) {
        if (active(current))
          publish({
            status: "error",
            profile: null,
            message: "Apple 로그인을 사용할 수 없습니다.",
          });
        return;
      }
      const signal = requestSignal(callerSignal);
      publish({ status: "signing-in", profile: null, message: null });
      try {
        const nonce = await deps.createAppleNonce();
        if (!active(current) || signal.aborted) return;
        const result = await deps.applePort.signIn({
          nonce: nonce.hashed,
          requestedScopes: ["fullName"],
        });
        if (!active(current) || signal.aborted) return;
        if (result.type === "cancel") {
          publish({ status: "signed-out", profile: null, message: null });
          return;
        }
        if (result.type === "error") {
          publish({
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
        if (!active(current) || signal.aborted) return;
        if (accountRestored) pendingAccountRestoreStore.set();
        await persistThenProfile(pair, current, signal);
      } catch {
        if (active(current))
          publish({
            status: "error",
            profile: null,
            message: "Apple 로그인을 완료할 수 없습니다. 다시 시도해 주세요.",
          });
      }
    },
    async refresh() {
      const current = generation;
      if (refreshFlight && refreshFlight.generation === current)
        return refreshFlight.promise;
      if (!tokens) return null;
      const signal = requestSignal();
      const entry: { generation: number; promise: Promise<TokenPair | null> } =
        {
          generation: current,
          promise: undefined as unknown as Promise<TokenPair | null>,
        };
      entry.promise = (async (): Promise<TokenPair | null> => {
        const activeTokens = tokens;
        if (!activeTokens) return null;
        if (tokenExpired(activeTokens.refreshTokenExpiresAt)) {
          await clearSessionAndPublish(
            current,
            "세션이 만료되었습니다. 다시 로그인해 주세요.",
          );
          return null;
        }
        let pair: TokenPair;
        try {
          pair = await deps.api.refresh(activeTokens.refreshToken, signal);
        } catch (error) {
          if (!active(current)) return null;
          if (isUnauthorized(error)) {
            await clearSessionAndPublish(
              current,
              "세션이 만료되었습니다. 다시 로그인해 주세요.",
            );
          } else {
            // A transport, proxy or server error cannot prove rotation did not
            // commit. Never replay a potentially consumed refresh token.
            await clearSessionAndPublish(
              current,
              "세션 상태를 확인할 수 없습니다. 다시 로그인해 주세요.",
            );
          }
          return null;
        }
        if (!active(current)) return null;
        try {
          const persisted = await persistThenProfile(pair, current, signal);
          return persisted ? pair : null;
        } catch (error) {
          if (!active(current)) return null;
          if (isUnauthorized(error)) {
            await clearSessionAndPublish(
              current,
              "세션이 만료되었습니다. 다시 로그인해 주세요.",
            );
          } else {
            publish({
              status: "error",
              profile: null,
              message: "세션을 갱신할 수 없습니다. 다시 시도해 주세요.",
              retryAction: "retryProfile",
            });
          }
          return null;
        }
      })().finally(() => {
        if (refreshFlight === entry) refreshFlight = null;
      });
      refreshFlight = entry;
      return entry.promise;
    },
    async logout(callerSignal?: AbortSignal) {
      const current = beginGeneration();
      const signal = requestSignal(callerSignal);
      pending = null;
      const previous = tokens;
      tokens = null;
      publish({ status: "signed-out", profile: null, message: null });
      try {
        await serializeStorage(current, () => deps.store.clear());
      } catch {
        if (active(current))
          publish({
            status: "error",
            profile: null,
            message:
              "보안 저장소에서 세션을 지울 수 없습니다. 다시 시도해 주세요.",
            retryAction: "logout",
          });
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
      const current = generation;
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
        const refreshed = await this.refresh();
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
      const current = generation;
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
              if (!signal.aborted && isUnauthorized(error))
                await this.refresh();
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

const APPLE_FULL_NAME_MAX_LENGTH = 256;
// Matches the control characters (Unicode Cc: C0, DEL, C1) that the server's
// A6 validation rejects in full_name (Rust `char::is_control`), so the app
// omits such a name instead of failing the whole login with 422.
const APPLE_FULL_NAME_CONTROL_CHARS = /[\u0000-\u001F\u007F-\u009F]/;

/**
 * APPCON-AC3: gates the Apple port's already-trimmed `fullName` (see
 * `apple-authentication-port.ios.ts`'s `formatName()`) against A6's
 * `full_name` wire contract (trim, 1..256 chars, no control characters)
 * before it is ever sent. `undefined` in either direction means "omit the
 * field" -- the server then assigns `Apple{6}` (E4/U6), never a 400.
 */
function sendableFullName(value: string | undefined): string | undefined {
  if (value === undefined) return undefined;
  const trimmed = value.trim();
  if (trimmed.length === 0 || trimmed.length > APPLE_FULL_NAME_MAX_LENGTH)
    return undefined;
  return APPLE_FULL_NAME_CONTROL_CHARS.test(trimmed) ? undefined : trimmed;
}

function isUnauthorized(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "status" in error &&
    (error as AuthApiError).status === 401
  );
}
