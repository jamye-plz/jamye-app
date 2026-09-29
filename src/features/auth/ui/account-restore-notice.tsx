import { useCallback } from "react";
import { useFocusEffect } from "expo-router";

import { pendingAccountRestoreStore } from "@/features/auth/model/pending-account-restore-store";
import { useSystemFeedback } from "@/shared/ui/system-feedback";

export const ACCOUNT_RESTORED_MESSAGE = "계정이 복구되었습니다.";

/**
 * G2/E13: mount this once inside a `SystemFeedbackHost` on every screen that
 * can be the first screen shown right after login (the group list and the
 * invite-join screen) -- it renders nothing itself. On focus it checks
 * `pendingAccountRestoreStore`, which `auth-controller.ts`'s `signIn()` sets
 * when A2's `accountRestored` signal comes back true. `consume()` empties
 * the store on the very first read, so a re-render or navigating back to the
 * same screen within the app never raises the notice twice; an app restart
 * always starts with an empty store (memory-only), so there is nothing to
 * show either.
 */
export function AccountRestoreNotice(): null {
  const { showNotice } = useSystemFeedback();
  useFocusEffect(
    useCallback(() => {
      if (pendingAccountRestoreStore.consume()) {
        showNotice({ message: ACCOUNT_RESTORED_MESSAGE });
      }
    }, [showNotice]),
  );
  return null;
}
