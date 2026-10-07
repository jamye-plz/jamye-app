import { useMemo } from "react";

import { useAccountLocalDataPurge } from "@/core/providers/app-providers";
import { useSession } from "@/core/providers/session-provider";
import { createAccountApi } from "@/features/account/data/account-api";

import { createAccountLifecycle } from "./account-lifecycle";
import type { AccountLifecycle } from "./account-lifecycle";

/**
 * Builds A1's `AccountLifecycle` once per signed-in account (origin + user
 * id). Shared by the account screen (A4 delete) and the nickname C3 screen
 * (A2/U2) so both mutate through the same in-flight guard
 * (account-lifecycle.ts's `withGuard`) instead of each owning a separate
 * instance. Extracted from account-screen.tsx's former inline `useMemo` (M14
 * round 2 native rewrite) so the nickname screen -- a separate root-Stack
 * route -- can reuse it without duplicating the wiring.
 *
 * task-app-device fix1 (device verification): no longer wires a `pushDisable`
 * dependency -- `createAccountLifecycle`'s `deleteAccount` doesn't take one
 * anymore (see account-lifecycle.ts's comment), so this hook no longer
 * needs `usePushLifecycle()` at all.
 *
 * B3/C7: the lifecycle also receives the signed-in principal and the
 * device-local purge port so a successful deletion schedules the 30-day
 * local data cleanup. The lifecycle is keyed by origin + user id (not by the
 * per-refresh epoch), so token refreshes do not rebuild it.
 */
export function useAccountLifecycle(): AccountLifecycle | null {
  const session = useSession();
  const purge = useAccountLocalDataPurge();
  const origin = session.principal?.origin ?? null;
  const userId = session.principal?.userId ?? null;
  const { applyProfile, authorizedRequest, logout } = session;
  return useMemo(() => {
    if (!origin || !userId) return null;
    return createAccountLifecycle({
      accountApi: createAccountApi(origin),
      session: { applyProfile, authorizedRequest, logout },
      principal: { origin, userId },
      purge,
    });
  }, [applyProfile, authorizedRequest, logout, origin, purge, userId]);
}
