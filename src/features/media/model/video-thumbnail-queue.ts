let pending: Promise<unknown> = Promise.resolve();

/** Serialize automatic downloads/decoders; user-triggered playback is independent. */
export function enqueueVideoThumbnail<T>(
  signal: AbortSignal,
  work: () => Promise<T>,
): Promise<T> {
  const result = pending.then(() => {
    if (signal.aborted) throw new Error("thumbnail_cancelled");
    return work();
  });
  pending = result.catch(() => undefined);
  return result;
}
