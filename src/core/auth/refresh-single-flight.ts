import type { AuthApi, AuthApiError } from "./auth-api";
import type { AuthState } from "./auth-controller";
import type { TokenPair } from "./types";

export function tokenExpired(value: string, nowMs?: () => number): boolean {
  const timestamp = Date.parse(value);
  return !Number.isFinite(timestamp) || timestamp <= (nowMs?.() ?? Date.now());
}

export function isUnauthorized(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "status" in error &&
    (error as AuthApiError).status === 401
  );
}

type RefreshFlight = Readonly<{
  generation: number;
  promise: Promise<TokenPair | null>;
}>;

/**
 * F6/AUTH-AC5: `refresh()`'s single-flight state and retry policy, extracted
 * unchanged from `auth-controller.ts`'s `createAuthController`. Returns the
 * bound `refresh` function directly so callers keep a single local `const
 * refresh = createRefresh(...)` reference (AUTH-AC5: no `this.refresh()`
 * call sites remain). See `auth-controller.ts`'s `createAuthController` for
 * how this is composed with the other extracted modules.
 */
export function createRefresh(
  deps: Readonly<{
    api: AuthApi;
    nowMs?: () => number;
    publish: (next: AuthState) => void;
    active: (value: number) => boolean;
    requestSignal: (callerSignal?: AbortSignal) => AbortSignal;
    getGeneration: () => number;
    getTokens: () => TokenPair | null;
    persistThenProfile: (
      pair: TokenPair,
      expectedGeneration: number,
      signal?: AbortSignal,
    ) => Promise<boolean>;
    clearSessionAndPublish: (
      expectedGeneration: number,
      message: string,
    ) => Promise<void>;
  }>,
) {
  let refreshFlight: RefreshFlight | null = null;

  return async function refresh(): Promise<TokenPair | null> {
    const current = deps.getGeneration();
    if (refreshFlight && refreshFlight.generation === current)
      return refreshFlight.promise;
    if (!deps.getTokens()) return null;
    const signal = deps.requestSignal();
    const entry: { generation: number; promise: Promise<TokenPair | null> } = {
      generation: current,
      promise: undefined as unknown as Promise<TokenPair | null>,
    };
    entry.promise = (async (): Promise<TokenPair | null> => {
      const activeTokens = deps.getTokens();
      if (!activeTokens) return null;
      if (tokenExpired(activeTokens.refreshTokenExpiresAt, deps.nowMs)) {
        await deps.clearSessionAndPublish(
          current,
          "세션이 만료되었습니다. 다시 로그인해 주세요.",
        );
        return null;
      }
      let pair: TokenPair;
      try {
        pair = await deps.api.refresh(activeTokens.refreshToken, signal);
      } catch (error) {
        if (!deps.active(current)) return null;
        if (isUnauthorized(error)) {
          await deps.clearSessionAndPublish(
            current,
            "세션이 만료되었습니다. 다시 로그인해 주세요.",
          );
        } else {
          // A transport, proxy or server error cannot prove rotation did not
          // commit. Never replay a potentially consumed refresh token.
          await deps.clearSessionAndPublish(
            current,
            "세션 상태를 확인할 수 없습니다. 다시 로그인해 주세요.",
          );
        }
        return null;
      }
      if (!deps.active(current)) return null;
      try {
        const persisted = await deps.persistThenProfile(pair, current, signal);
        return persisted ? pair : null;
      } catch (error) {
        if (!deps.active(current)) return null;
        if (isUnauthorized(error)) {
          await deps.clearSessionAndPublish(
            current,
            "세션이 만료되었습니다. 다시 로그인해 주세요.",
          );
        } else {
          deps.publish({
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
  };
}
