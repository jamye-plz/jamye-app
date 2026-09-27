/**
 * Memory-only holder for an invite code captured from a deep link (E6, A3).
 * `+native-intent` calls `set` when `https://{apiOrigin}/invite/{code}` or
 * `jamye://invite/{code}` resolves; the join screen calls `consume` once (on
 * focus) to move the code into its own input state; session teardown calls
 * `clear` on logout. Never persisted to disk and never logged -- a page
 * reload/app restart always starts empty.
 */
export type PendingInviteStore = Readonly<{
  set: (code: string) => void;
  peek: () => string | null;
  consume: () => string | null;
  clear: () => void;
}>;

function createPendingInviteStore(): PendingInviteStore {
  let code: string | null = null;
  return {
    clear() {
      code = null;
    },
    consume() {
      const value = code;
      code = null;
      return value;
    },
    peek() {
      return code;
    },
    set(next) {
      code = next;
    },
  };
}

export const pendingInviteStore = createPendingInviteStore();
