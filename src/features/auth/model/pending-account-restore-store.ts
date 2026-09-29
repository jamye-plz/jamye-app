/**
 * Memory-only one-shot flag for the G2/E13 account-restore notice: A2's
 * `accountRestored` response header (read by `auth-controller.ts`'s
 * `signIn()`, see the destructured `accountRestored` there) sets this, and
 * the first post-login screen (group list or the invite-join screen)
 * consumes it once to show "계정이 복구되었습니다." Never persisted to disk
 * and never logged -- an app restart always starts empty. Shaped after
 * `pending-invite-store.ts` (E6/A3), but the payload is a plain one-shot
 * flag rather than a code string.
 */
export type PendingAccountRestoreStore = Readonly<{
  set: () => void;
  peek: () => boolean;
  consume: () => boolean;
  clear: () => void;
}>;

function createPendingAccountRestoreStore(): PendingAccountRestoreStore {
  let restored = false;
  return {
    clear() {
      restored = false;
    },
    consume() {
      const value = restored;
      restored = false;
      return value;
    },
    peek() {
      return restored;
    },
    set() {
      restored = true;
    },
  };
}

export const pendingAccountRestoreStore = createPendingAccountRestoreStore();
