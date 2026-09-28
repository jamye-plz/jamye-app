import { useEffect, useRef, useState } from "react";

import type { AccountLifecycle } from "./account-lifecycle";

const BLOCKED_MESSAGE = "그룹 소유권을 먼저 이전한 뒤 다시 시도해 주세요.";
const ERROR_MESSAGE = "계정을 삭제하지 못했습니다. 잠시 후 다시 시도해 주세요.";

export type DeleteAccountFlow = Readonly<{
  pending: boolean;
  message: string | null;
  confirmVisible: boolean;
  requestConfirm: () => void;
  dismissConfirm: () => void;
  confirmDelete: () => void;
}>;

/**
 * A4/U3: the "계정 삭제" row's confirm-then-delete state machine, extracted
 * from the now-removed `delete-account-section.tsx` component so
 * `account-screen.*.tsx` can render the native destructive row itself while
 * this hook stays a plain, platform-agnostic unit. `Alert.alert` is gone --
 * `confirmVisible` instead drives a `ConfirmAlert` the caller renders
 * (A4: "RN Alert.alert가 남지 않는다"). Mirrors the original guard against a
 * second confirm firing while the first delete is still in flight, and the
 * unmount guard for the settle callback (a successful delete logs out
 * synchronously, unmounting the caller before this hook's own `.then()`
 * settles).
 */
export function useDeleteAccountFlow(
  accountLifecycle: AccountLifecycle | null,
): DeleteAccountFlow {
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [confirmVisible, setConfirmVisible] = useState(false);
  const pendingRef = useRef(false);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  function settle(next: string | null): void {
    pendingRef.current = false;
    if (!mountedRef.current) return;
    setPending(false);
    setMessage(next);
  }

  function requestConfirm(): void {
    if (pendingRef.current) return;
    setConfirmVisible(true);
  }

  function dismissConfirm(): void {
    setConfirmVisible(false);
  }

  function confirmDelete(): void {
    setConfirmVisible(false);
    if (pendingRef.current || !accountLifecycle) return;
    pendingRef.current = true;
    setPending(true);
    setMessage(null);
    void accountLifecycle
      .deleteAccount()
      .then((result) => {
        if (result.status === "blocked") {
          settle(BLOCKED_MESSAGE);
          return;
        }
        if (result.status === "error") {
          settle(ERROR_MESSAGE);
          return;
        }
        // status === "ok": session.logout() already fired inside the
        // lifecycle and navigates the app to the signed-out shell -- no
        // further action needed here.
        settle(null);
      })
      .catch(() => {
        // The lifecycle resolves to a result object by contract; if that
        // contract is ever broken the row must still leave the busy state.
        settle(ERROR_MESSAGE);
      });
  }

  return {
    confirmDelete,
    confirmVisible,
    dismissConfirm,
    message,
    pending,
    requestConfirm,
  };
}
