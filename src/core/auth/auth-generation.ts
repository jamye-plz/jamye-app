import { anySignal } from "@/core/http/http-client";

/**
 * F6/AUTH-AC5: owns the session controller's generation/epoch counter and
 * its paired AbortController "fence", extracted unchanged from
 * `auth-controller.ts`'s `createAuthController`. Every public entry point
 * that begins a new session epoch (restore/signIn/signInWithApple/logout)
 * calls `beginGeneration()` so a superseded generation can never publish
 * state or mutate storage again; `dispose()` uses the narrower
 * `fenceForDispose()` (abort + null the fence without opening a new epoch's
 * AbortController). See `auth-controller.ts`'s `createAuthController` for
 * how this is composed with the other extracted modules.
 */
export function createGenerationGuard() {
  let generation = 0;
  let fence: AbortController | null = null;

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

  /** `dispose()`'s fence handling: abort and clear the fence without opening a new epoch. */
  const fenceForDispose = () => {
    fence?.abort();
    fence = null;
    generation++;
  };

  return {
    /** The current session epoch; a fresh SessionPrincipal is only valid alongside the epoch it was read at. */
    get generation() {
      return generation;
    },
    active,
    beginGeneration,
    requestSignal,
    fenceForDispose,
  };
}
