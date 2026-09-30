import { useMemo } from "react";

import { useSession } from "@/core/providers/session-provider";
import { createAccountApi } from "@/features/account/data/account-api";

import { createAccountLifecycle } from "./account-lifecycle";
import type { AccountLifecycle } from "./account-lifecycle";

/**
 * Builds A1's `AccountLifecycle` once per session origin. Shared by the
 * account screen (A4 delete) and the nickname C3 screen (A2/U2) so both
 * mutate through the same in-flight guard (account-lifecycle.ts's
 * `withGuard`) instead of each owning a separate instance. Extracted from
 * account-screen.tsx's former inline `useMemo` (M14 round 2 native rewrite)
 * so the nickname screen -- a separate root-Stack route -- can reuse it
 * without duplicating the wiring.
 *
 * task-app-device fix1 (device verification): no longer wires a `pushDisable`
 * dependency -- `createAccountLifecycle`'s `deleteAccount` doesn't take one
 * anymore (see account-lifecycle.ts's comment), so this hook no longer
 * needs `usePushLifecycle()` at all.
 */
export function useAccountLifecycle(): AccountLifecycle | null {
  const session = useSession();
  const origin = session.principal?.origin ?? null;
  const { applyProfile, authorizedRequest, logout } = session;
  return useMemo(() => {
    if (!origin) return null;
    return createAccountLifecycle({
      accountApi: createAccountApi(origin),
      session: { applyProfile, authorizedRequest, logout },
    });
  }, [applyProfile, authorizedRequest, logout, origin]);
}
