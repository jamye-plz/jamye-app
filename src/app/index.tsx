import { Redirect } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import { useEffect } from "react";

import { getPublicEnv } from "@/core/config/public-env";
import { useSession } from "@/core/providers/session-provider";
import { pendingInviteStore } from "@/features/groups/model/pending-invite-store";

export default function IndexRoute() {
  const mode = getPublicEnv().appMode;
  // L3/E12: `local-fixture` mode never mounts `SessionProvider` (see
  // `app-providers.tsx`), so nothing else ever calls `hideAsync` for it --
  // hide immediately here instead. `connected-auth` mode's hide (restore
  // complete, or a 3s safety timeout) lives in `session-provider.tsx`.
  useEffect(() => {
    if (mode !== "connected-auth") void SplashScreen.hideAsync();
  }, [mode]);
  // E7a/C13: this entry point is now a pure redirector -- the login screen
  // moved to `(auth)/sign-in` and the fixture chat moved to `/local-fixture`
  // (AUTH-AC1/AC2), so signed-out protected routes and this route agree on
  // one destination.
  return mode === "connected-auth" ? (
    <ConnectedIndexRoute />
  ) : (
    <Redirect href="/local-fixture" />
  );
}

/**
 * A validated principal enters the tab bar at the groups tab (ADR 0009) --
 * unless an invite link arrived while signed out. That link left a code in
 * `pendingInviteStore` (A3/E6) and redirected here first (`GroupRouteGuard`
 * sends unauthenticated traffic to `/sign-in`, which lands back here once a
 * session exists via the same pending-invite check `(auth)/sign-in.tsx`
 * mirrors); once a session exists, resume straight to the code-less join
 * confirmation screen instead of the group list, then that screen consumes
 * the code.
 */
function ConnectedIndexRoute() {
  const session = useSession();
  if (!session.principal) return <Redirect href="/sign-in" />;
  return (
    <Redirect href={pendingInviteStore.peek() ? "/groups/join" : "/groups"} />
  );
}
