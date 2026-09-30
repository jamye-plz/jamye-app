import { useEffect, useRef, useState } from "react";

import { appleAuthenticationPort } from "@/core/auth/apple-authentication-port";
import { createAppleNonce } from "@/core/auth/apple-authentication.shared";
import { useSession } from "@/core/providers/session-provider";

import type {
  AccountLifecycle,
  AppleAccountDeletionProof,
} from "./account-lifecycle";

const BLOCKED_MESSAGE = "그룹 소유권을 먼저 이전한 뒤 다시 시도해 주세요.";
const ERROR_MESSAGE = "계정을 삭제하지 못했습니다. 잠시 후 다시 시도해 주세요.";

export type DeleteAccountFlow = Readonly<{
  pending: boolean;
  failureMessage: string | null;
  confirmVisible: boolean;
  requestConfirm: () => void;
  dismissConfirm: () => void;
  confirmDelete: () => void;
  dismissFailure: () => void;
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
 *
 * task-app-device fix1 (device verification): a blocked/error result surfaces
 * through `failureMessage` + `dismissFailure` instead of an inline row
 * caption -- the caller renders a single-button acknowledge `ConfirmAlert`
 * (title "계정 삭제", the message below, one "확인" button) rather than text
 * under the delete row. A cancelled Apple reauthentication still settles
 * `failureMessage` to `null` (no alert).
 *
 * APPCON-AC5/U7: an Apple-provider account (read from `useSession()`, never
 * a caller-supplied argument -- account-screen.tsx's call site is task-app-ui
 * territory and stays untouched here) reauthenticates with a fresh nonce and
 * no requested scopes (U7 never re-asks for the name) before `confirmDelete`
 * ever reaches the lifecycle. A cancelled or failed native sheet never calls
 * `accountLifecycle.deleteAccount` at all -- cancel settles silently (U7:
 * "인증을 취소하면 삭제도 취소된다"), a genuine native error surfaces the
 * same generic `ERROR_MESSAGE` as any other failure. Kakao/Google accounts
 * skip this branch entirely via `proceed()`, calling `deleteAccount()` with
 * no proof in exactly the same synchronous call / `.then()` shape as before
 * this task, so existing callers' microtask-flush timing is unchanged.
 */
export function useDeleteAccountFlow(
  accountLifecycle: AccountLifecycle | null,
): DeleteAccountFlow {
  const session = useSession();
  const [pending, setPending] = useState(false);
  const [failureMessage, setFailureMessage] = useState<string | null>(null);
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
    setFailureMessage(next);
  }

  function requestConfirm(): void {
    if (pendingRef.current) return;
    setConfirmVisible(true);
  }

  function dismissConfirm(): void {
    setConfirmVisible(false);
  }

  function dismissFailure(): void {
    setFailureMessage(null);
  }

  function confirmDelete(): void {
    setConfirmVisible(false);
    if (pendingRef.current || !accountLifecycle) return;
    pendingRef.current = true;
    setPending(true);
    setFailureMessage(null);
    const lifecycle = accountLifecycle;
    const proceed = (appleProof?: AppleAccountDeletionProof): void => {
      void lifecycle
        .deleteAccount(appleProof)
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
    };
    if (session.state.profile?.provider !== "apple") {
      proceed();
      return;
    }
    void (async () => {
      try {
        const nonce = await createAppleNonce();
        const result = await appleAuthenticationPort.signIn({
          nonce: nonce.hashed,
          requestedScopes: [],
        });
        if (result.type === "cancel") {
          settle(null);
          return;
        }
        if (result.type === "error") {
          settle(ERROR_MESSAGE);
          return;
        }
        proceed({
          identityToken: result.identityToken,
          authorizationCode: result.authorizationCode,
          rawNonce: nonce.raw,
        });
      } catch {
        settle(ERROR_MESSAGE);
      }
    })();
  }

  return {
    confirmDelete,
    confirmVisible,
    dismissConfirm,
    dismissFailure,
    failureMessage,
    pending,
    requestConfirm,
  };
}
