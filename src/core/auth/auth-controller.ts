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
  let refreshFlight: Promise<TokenPair | null> | null = null;
  let storageQueue: Promise<void> = Promise.resolve();
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

  const serializeStorage = (operation: () => Promise<void>) => {
    const queued = storageQueue.then(operation, operation);
    storageQueue = queued.catch(() => undefined);
    return queued;
  };
  async function persistThenProfile(
    pair: TokenPair,
    expectedGeneration: number,
  ) {
    if (!active(expectedGeneration)) return;
    await serializeStorage(() => deps.store.save(deps.origin, pair));
    if (!active(expectedGeneration)) return;
    tokens = pair;
    const profile = await deps.api.profile(pair.accessToken);
    if (!active(expectedGeneration)) return;
    publish({ status: "signed-in", profile, message: null });
  }

  return {
    getState: () => state,
    subscribe(listener: (value: AuthState) => void) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    async restore() {
      const current = ++generation;
      publish({ status: "loading", profile: null, message: null });
      try {
        const stored = await deps.store.load(deps.origin);
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
          await persistThenProfile(stored, current);
        } catch (error) {
          if (isUnauthorized(error)) await this.refresh();
          else if (active(current))
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
    ) {
      const current = ++generation;
      pending = null;
      let exchangedPair: TokenPair | null = null;
      publish({ status: "signing-in", profile: null, message: null });
      try {
        const pkce = await deps.createPkce();
        const authorization = await deps.api.authorize(provider, {
          redirectUri: providerRedirectUri,
          challenge: pkce.challenge,
        });
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
        const pair = await deps.api.exchange(provider, {
          authorizationCode: callback.code,
          state: callback.state,
          verifier: attempt.verifier,
          redirectUri: attempt.redirectUri,
        });
        exchangedPair = pair;
        await persistThenProfile(pair, current);
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
      if (refreshFlight) return refreshFlight;
      if (!tokens) return null;
      const current = generation;
      refreshFlight = (async () => {
        if (tokenExpired(tokens.refreshTokenExpiresAt)) {
          tokens = null;
          try {
            await serializeStorage(() => deps.store.clear());
            if (active(current))
              publish({
                status: "signed-out",
                profile: null,
                message: "세션이 만료되었습니다. 다시 로그인해 주세요.",
              });
          } catch {
            if (active(current))
              publish({
                status: "error",
                profile: null,
                message:
                  "보안 저장소에서 세션을 지울 수 없습니다. 다시 시도해 주세요.",
                retryAction: "logout",
              });
          } finally {
            refreshFlight = null;
          }
          return null;
        }
        try {
          const pair = await deps.api.refresh(tokens.refreshToken);
          if (!active(current)) return null;
          await persistThenProfile(pair, current);
          return pair;
        } catch (error) {
          if (active(current) && isUnauthorized(error)) {
            tokens = null;
            try {
              await serializeStorage(() => deps.store.clear());
              publish({
                status: "signed-out",
                profile: null,
                message: "세션이 만료되었습니다. 다시 로그인해 주세요.",
              });
            } catch {
              publish({
                status: "error",
                profile: null,
                message:
                  "보안 저장소에서 세션을 지울 수 없습니다. 다시 시도해 주세요.",
                retryAction: "logout",
              });
            }
          } else if (active(current)) {
            publish({
              status: "error",
              profile: null,
              message: "세션을 갱신할 수 없습니다. 다시 시도해 주세요.",
              retryAction: "retryProfile",
            });
          }
          return null;
        } finally {
          refreshFlight = null;
        }
      })();
      return refreshFlight;
    },
    async logout() {
      ++generation;
      pending = null;
      const previous = tokens;
      tokens = null;
      publish({ status: "signed-out", profile: null, message: null });
      try {
        await serializeStorage(() => deps.store.clear());
      } catch {
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
        await deps.api.logout(previous.accessToken).catch(() => undefined);
    },
    async retryProfile() {
      const current = generation;
      if (!tokens) return;
      publish({ status: "loading", profile: null, message: null });
      try {
        const profile = await deps.api.profile(tokens.accessToken);
        if (active(current))
          publish({ status: "signed-in", profile, message: null });
      } catch (error) {
        if (active(current) && isUnauthorized(error)) await this.refresh();
        else if (active(current))
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
