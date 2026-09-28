let pending: Promise<unknown> = Promise.resolve();

/** Settles once `signal` aborts; never rejects. */
function whenAborted(signal: AbortSignal): Promise<void> {
  if (signal.aborted) return Promise.resolve();
  return new Promise((resolve) => {
    signal.addEventListener("abort", () => resolve(), { once: true });
  });
}

/**
 * Serialize automatic downloads/decoders; user-triggered playback is independent.
 * The next job waits for the previous one only until that job's own signal
 * aborts (card unmounted, invalidation, watchdog): some native steps ignore
 * the signal, and on device one that never settled left every later
 * thumbnail loading for good.
 */
export function enqueueVideoThumbnail<T>(
  signal: AbortSignal,
  work: () => Promise<T>,
): Promise<T> {
  const previous = pending;
  const result = previous.then(() => {
    if (signal.aborted) throw new Error("thumbnail_cancelled");
    return work();
  });
  // Only once this job's turn has come can its abort release the queue, so
  // an aborted job still waiting never lets later jobs skip a running one.
  pending = Promise.race([
    result.catch(() => undefined),
    previous.then(() => whenAborted(signal)),
  ]);
  return result;
}
