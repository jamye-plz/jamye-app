import type { AuthApi } from "./auth-api";
import type { AuthState } from "./auth-controller";
import type { SessionStore } from "./secure-session-store";
import type { TokenPair } from "./types";

// Native I/O already in progress cannot be cancelled. All controllers sharing
// one secure record must drain it before a later owner reads or writes that record.
const storageQueues = new WeakMap<SessionStore, Promise<unknown>>();

// R4: the identical SessionStore.clear() failure state `auth-controller.ts`'s
// own `logout()` publishes on its own clear() catch -- shared so the
// message/retryAction pair can only drift in one place.
export const SESSION_CLEAR_FAILED_STATE: AuthState = {
  status: "error",
  profile: null,
  message: "보안 저장소에서 세션을 지울 수 없습니다. 다시 시도해 주세요.",
  retryAction: "logout",
};

/**
 * F6/AUTH-AC5: token/profile persistence, extracted unchanged from
 * `auth-controller.ts`'s `createAuthController` -- `persistThenProfile`,
 * `clearSessionAndPublish`, and the `serializeStorage` secure-storage queue.
 * See `auth-controller.ts`'s `createAuthController` for how this is composed
 * with the other extracted modules.
 */
export function createSessionPersistence(
  deps: Readonly<{
    origin: string;
    api: AuthApi;
    store: SessionStore;
    publish: (next: AuthState) => void;
    active: (value: number) => boolean;
    getTokens: () => TokenPair | null;
    setTokens: (value: TokenPair | null) => void;
  }>,
) {
  /** Queued secure-storage writes re-check the epoch at execution time, not just at enqueue time. */
  const serializeStorage = <T>(
    expectedGeneration: number,
    operation: () => Promise<T>,
  ) => {
    const run = () =>
      deps.active(expectedGeneration) ? operation() : undefined;
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
    if (!deps.active(expectedGeneration)) return false;
    try {
      await serializeStorage(expectedGeneration, () =>
        deps.store.save(deps.origin, pair),
      );
    } catch {
      if (deps.active(expectedGeneration)) {
        await clearSessionAndPublish(
          expectedGeneration,
          "세션을 안전하게 저장할 수 없습니다. 다시 로그인해 주세요.",
        );
      }
      return false;
    }
    if (!deps.active(expectedGeneration)) return false;
    deps.setTokens(pair);
    const profile = await deps.api.profile(pair.accessToken, signal);
    if (!deps.active(expectedGeneration)) return false;
    deps.publish({ status: "signed-in", profile, message: null });
    return true;
  }

  async function clearSessionAndPublish(
    expectedGeneration: number,
    message: string,
  ) {
    deps.setTokens(null);
    try {
      await serializeStorage(expectedGeneration, () => deps.store.clear());
      if (deps.active(expectedGeneration))
        deps.publish({ status: "signed-out", profile: null, message });
    } catch {
      if (deps.active(expectedGeneration))
        deps.publish(SESSION_CLEAR_FAILED_STATE);
    }
  }

  return { persistThenProfile, clearSessionAndPublish, serializeStorage };
}
