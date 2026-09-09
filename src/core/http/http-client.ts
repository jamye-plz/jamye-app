export const REQUEST_TIMEOUT_MS = 15_000;

export class HttpAbortedError extends Error {
  constructor(readonly by: "caller" | "timeout") {
    super(by === "caller" ? "aborted_by_caller" : "aborted_by_timeout");
  }
}

export function composeAbortSignal(
  callerSignal: AbortSignal | undefined,
  timeoutMs: number,
): Readonly<{
  signal: AbortSignal;
  cleanup: () => void;
  reason: () => "timeout" | "caller" | null;
}> {
  let reason: "timeout" | "caller" | null = null;
  if (callerSignal?.aborted) {
    reason = "caller";
    return { signal: callerSignal, cleanup: () => {}, reason: () => reason };
  }
  const controller = new AbortController();
  const timer = setTimeout(() => {
    if (controller.signal.aborted) return;
    reason = "timeout";
    controller.abort();
  }, timeoutMs);
  const onCallerAbort = () => {
    if (controller.signal.aborted) return;
    reason = "caller";
    controller.abort();
  };
  callerSignal?.addEventListener("abort", onCallerAbort);
  return {
    signal: controller.signal,
    cleanup: () => {
      clearTimeout(timer);
      callerSignal?.removeEventListener("abort", onCallerAbort);
    },
    reason: () => reason,
  };
}

/**
 * Runs `run` under a single composed deadline (caller cancellation or the
 * timeout, whichever fires first). The deadline stays live for the whole
 * `run` unit of work, not just its first awaited step, so multi-step
 * operations (e.g. fetch headers, then read the body) share one fence.
 */
export async function withTimeoutSignal<T>(
  callerSignal: AbortSignal | undefined,
  timeoutMs: number,
  run: (signal: AbortSignal) => Promise<T>,
): Promise<T> {
  const composed = composeAbortSignal(callerSignal, timeoutMs);
  try {
    if (composed.signal.aborted) throw new HttpAbortedError("caller");
    return await run(composed.signal);
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      throw new HttpAbortedError(composed.reason() ?? "timeout");
    }
    throw error;
  } finally {
    composed.cleanup();
  }
}

/** Combines multiple abort signals into one that aborts as soon as any input does. */
export function anySignal(
  signals: readonly (AbortSignal | undefined)[],
): AbortSignal {
  const present = signals.filter((value): value is AbortSignal =>
    Boolean(value),
  );
  if (present.length === 1) return present[0];
  const controller = new AbortController();
  const already = present.find((signal) => signal.aborted);
  if (already) {
    controller.abort();
    return controller.signal;
  }
  const onAbort = () => {
    for (const signal of present) signal.removeEventListener("abort", onAbort);
    controller.abort();
  };
  for (const signal of present)
    signal.addEventListener("abort", onAbort, { once: true });
  return controller.signal;
}
