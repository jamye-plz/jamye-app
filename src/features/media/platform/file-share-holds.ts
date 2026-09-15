/**
 * A counting share-hold registry: lets a native handoff (a share sheet, a
 * player, a thumbnail generator, ...) keep an app-owned file alive past the
 * point where the app itself would otherwise delete it. `retain()` increments
 * a hold count and returns a release callback; when the count drops to zero
 * and a removal was requested meanwhile, the injected `remove` callback runs
 * exactly once. Used identically by media-downloads.ts and media-staging.ts,
 * each injecting its own directory-scoped delete.
 */
export type ShareHoldRegistry = Readonly<{
  /** Increments the hold count for `uri` and returns a release callback.
   * The callback is idempotent: calling it more than once has no effect
   * after the first call. */
  retain: (uri: string) => () => void;
  /** Removes `uri` immediately when it has no active hold, or defers the
   * removal until every hold on it has been released. */
  releaseOrDefer: (uri: string) => void;
  /** True while `uri` has at least one active hold. */
  isHeld: (uri: string) => boolean;
  /** True while any uri anywhere in this registry has an active hold. Lets a
   * directory-wide sweep take a fast whole-directory delete path when nothing
   * is held, exactly as each caller did before extraction. */
  hasAnyHeld: () => boolean;
}>;

export function createShareHoldRegistry(
  remove: (uri: string) => void | Promise<void>,
): ShareHoldRegistry {
  const shareHolds = new Map<string, number>();
  const pendingRemovals = new Set<string>();

  function runDeferredRemove(uri: string): void {
    try {
      void remove(uri);
    } catch {
      // Best effort under filesystem races; the next account/startup sweep retries.
    }
  }

  function retain(uri: string): () => void {
    shareHolds.set(uri, (shareHolds.get(uri) ?? 0) + 1);
    let released = false;
    return () => {
      if (released) return;
      released = true;
      const remaining = (shareHolds.get(uri) ?? 1) - 1;
      if (remaining > 0) shareHolds.set(uri, remaining);
      else {
        shareHolds.delete(uri);
        if (pendingRemovals.delete(uri)) runDeferredRemove(uri);
      }
    };
  }

  function releaseOrDefer(uri: string): void {
    if (shareHolds.has(uri)) {
      pendingRemovals.add(uri);
      return;
    }
    remove(uri);
  }

  function isHeld(uri: string): boolean {
    return shareHolds.has(uri);
  }

  function hasAnyHeld(): boolean {
    return shareHolds.size > 0;
  }

  return { retain, releaseOrDefer, isHeld, hasAnyHeld };
}
