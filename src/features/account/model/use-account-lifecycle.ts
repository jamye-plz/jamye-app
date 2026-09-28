import { useMemo } from "react";

import { useSession } from "@/core/providers/session-provider";
import { createAccountApi } from "@/features/account/data/account-api";
import { usePushLifecycle } from "@/features/notifications/model/push-lifecycle-provider";

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
 */
export function useAccountLifecycle(): AccountLifecycle | null {
  const session = useSession();
  const pushLifecycle = usePushLifecycle();
  const origin = session.principal?.origin ?? null;
  const { applyProfile, authorizedRequest, logout } = session;
  const { disable } = pushLifecycle;
  return useMemo(() => {
    if (!origin) return null;
    return createAccountLifecycle({
      accountApi: createAccountApi(origin),
      pushDisable: { disable },
      session: { applyProfile, authorizedRequest, logout },
    });
  }, [applyProfile, authorizedRequest, disable, logout, origin]);
}
