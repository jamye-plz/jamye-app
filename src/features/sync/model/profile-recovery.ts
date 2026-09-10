import type { AuthController } from "@/core/auth/auth-controller";

type ProfileRecoveryController = Pick<
  AuthController,
  "getState" | "getGeneration" | "subscribe" | "retryProfile"
>;

const RETRY_DELAYS_MS = [1000, 5000, 15000] as const;

/** Restores U1 authority, never cached profile data or a speculative principal.
 * Exhaustion deliberately leaves the existing explicit retry action available. */
export function createProfileRecovery(
  controller: ProfileRecoveryController,
  initiallyForeground: boolean,
) {
  let foreground = initiallyForeground;
  let disposed = false;
  let epoch = controller.getGeneration();
  let attempts = 0;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let flight: AbortController | null = null;

  function clearTimer() {
    if (timer !== null) clearTimeout(timer);
    timer = null;
  }

  function eligible() {
    const state = controller.getState();
    return state.status === "error" && state.retryAction === "retryProfile";
  }

  function schedule() {
    if (disposed) return;
    const nextEpoch = controller.getGeneration();
    if (epoch !== nextEpoch) {
      epoch = nextEpoch;
      attempts = 0;
      clearTimer();
      flight?.abort();
    }
    const { status } = controller.getState();
    if (status === "signed-in" || status === "signed-out") attempts = 0;
    if (!foreground || !eligible()) {
      clearTimer();
      return;
    }
    if (timer !== null || flight || attempts >= RETRY_DELAYS_MS.length) return;
    timer = setTimeout(() => {
      timer = null;
      void retry();
    }, RETRY_DELAYS_MS[attempts]);
  }

  async function retry() {
    if (disposed || !foreground || flight || !eligible()) return;
    const attempt = new AbortController();
    flight = attempt;
    attempts += 1;
    try {
      await controller.retryProfile(attempt.signal);
    } catch {
      // AuthController owns the visible error state; never fabricate authority.
    } finally {
      if (flight === attempt) flight = null;
      schedule();
    }
  }

  const unsubscribe = controller.subscribe(schedule);
  schedule();
  return {
    setForeground(value: boolean) {
      foreground = value;
      if (!foreground) flight?.abort();
      schedule();
    },
    dispose() {
      disposed = true;
      clearTimer();
      flight?.abort();
      unsubscribe();
    },
  };
}
