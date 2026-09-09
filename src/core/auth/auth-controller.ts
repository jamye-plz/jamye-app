import { anySignal } from "@/core/http/http-client";

import { parseOAuthCallback } from "./callback";
import type { AuthApi, AuthApiError } from "./auth-api";
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

export type AuthController = ReturnType<typeof createAuthController>;

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
    nowMs?: () => number;
  }>,
) {
  let state: AuthState = { status: "loading", profile: null, message: null };
  let tokens: TokenPair | null = null;
  let pending: PendingAttempt | null = null;
  let generation = 0;
  let fence: AbortController | null = null;
  let refreshFlight: RefreshFlight | null = null;
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
        const pair = await deps.api.exchange(
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
    async retryProfile(callerSignal?: AbortSignal) {
      const current = generation;
      if (!tokens) return;
      const signal = requestSignal(callerSignal);
      publish({ status: "loading", profile: null, message: null });
      try {
        const profile = await deps.api.profile(tokens.accessToken, signal);
        if (active(current))
          publish({ status: "signed-in", profile, message: null });
      } catch (error) {
        if (!active(current)) return;
        if (isUnauthorized(error)) await this.refresh();
        else
          publish({
            status: "error",
            profile: null,
            message: "프로필을 불러올 수 없습니다. 다시 시도해 주세요.",
            retryAction: "retryProfile",
          });
      }
    },
  };
}

function isUnauthorized(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "status" in error &&
    (error as AuthApiError).status === 401
  );
}
