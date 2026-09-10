import type { AuthState } from "@/core/auth/auth-controller";
import { createProfileRecovery } from "@/features/sync/model/profile-recovery";

const offline: AuthState = {
  status: "error",
  profile: null,
  message: "offline",
  retryAction: "retryProfile",
};

function fixture() {
  let state: AuthState = offline;
  let epoch = 1;
  const listeners = new Set<(state: AuthState) => void>();
  const publish = (next: AuthState) => {
    state = next;
    listeners.forEach((listener) => listener(state));
  };
  const retryProfile = jest.fn(async (_signal?: AbortSignal) => {
    publish({ status: "loading", profile: null, message: null });
    publish(offline);
  });
  const controller = {
    getState: () => state,
    getGeneration: () => epoch,
    subscribe: (listener: (state: AuthState) => void) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    retryProfile,
  };
  return {
    controller,
    publish,
    nextEpoch: () => {
      epoch += 1;
      publish(offline);
    },
    listenerCount: () => listeners.size,
  };
}

describe("bounded cold-offline profile recovery", () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  test("retries only U1 a bounded number of times and leaves manual retry visible", async () => {
    const f = fixture();
    const recovery = createProfileRecovery(f.controller, true);
    expect(f.controller.retryProfile).not.toHaveBeenCalled();
    await jest.advanceTimersByTimeAsync(1000);
    expect(f.controller.retryProfile).toHaveBeenCalledTimes(1);
    await jest.advanceTimersByTimeAsync(60000);
    expect(f.controller.retryProfile).toHaveBeenCalledTimes(3);
    expect(f.controller.getState()).toEqual(offline);
    recovery.setForeground(false);
    recovery.setForeground(true);
    await jest.advanceTimersByTimeAsync(60000);
    expect(f.controller.retryProfile).toHaveBeenCalledTimes(3);
    recovery.dispose();
  });

  test("does not run in background and never overlaps a pending profile request", async () => {
    const f = fixture();
    let complete!: () => void;
    f.controller.retryProfile.mockImplementationOnce(async () => {
      await new Promise<void>((resolve) => {
        complete = resolve;
      });
      f.publish(offline);
    });
    const recovery = createProfileRecovery(f.controller, false);
    await jest.advanceTimersByTimeAsync(60000);
    expect(f.controller.retryProfile).not.toHaveBeenCalled();
    recovery.setForeground(true);
    await jest.advanceTimersByTimeAsync(1000);
    f.publish(offline);
    recovery.setForeground(true);
    await jest.advanceTimersByTimeAsync(60000);
    expect(f.controller.retryProfile).toHaveBeenCalledTimes(1);
    complete();
    await jest.advanceTimersByTimeAsync(6000);
    expect(f.controller.retryProfile).toHaveBeenCalledTimes(2);
    recovery.dispose();
  });

  test("sign-in cancels retries and unrelated logout/storage errors are never replayed", async () => {
    const f = fixture();
    const recovery = createProfileRecovery(f.controller, true);
    f.publish({ status: "signed-in", profile: null, message: null });
    await jest.advanceTimersByTimeAsync(60000);
    expect(f.controller.retryProfile).not.toHaveBeenCalled();
    for (const retryAction of ["logout", "restore"] as const) {
      f.publish({ ...offline, retryAction });
      await jest.advanceTimersByTimeAsync(60000);
    }
    expect(f.controller.retryProfile).not.toHaveBeenCalled();
    recovery.dispose();
  });

  test("new epochs get their own retry budget; disposal aborts work and removes listeners", async () => {
    const f = fixture();
    const recovery = createProfileRecovery(f.controller, true);
    await jest.advanceTimersByTimeAsync(60000);
    expect(f.controller.retryProfile).toHaveBeenCalledTimes(3);
    f.nextEpoch();
    let complete!: () => void;
    f.controller.retryProfile.mockImplementationOnce(async () => {
      await new Promise<void>((resolve) => {
        complete = resolve;
      });
    });
    await jest.advanceTimersByTimeAsync(1000);
    expect(f.controller.retryProfile).toHaveBeenCalledTimes(4);
    const signal = f.controller.retryProfile.mock.calls[3][0];
    recovery.dispose();
    expect(signal?.aborted).toBe(true);
    expect(f.listenerCount()).toBe(0);
    complete();
    await jest.advanceTimersByTimeAsync(60000);
    expect(f.controller.retryProfile).toHaveBeenCalledTimes(4);
  });
});
