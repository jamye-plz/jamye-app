import { Redirect } from "expo-router";

import { useSession } from "@/core/providers/session-provider";
import { pendingInviteStore } from "@/features/groups/model/pending-invite-store";

/**
 * E7a/C13: a pure redirector -- the login screen lives at `(auth)/sign-in`,
 * so signed-out protected routes and this route agree on one destination.
 * The native splash is hidden by `session-provider.tsx` (restore complete,
 * or a 3s safety timeout), never here.
 *
 * A validated principal enters the tab bar at the groups tab (ADR 0009) --
 * unless an invite link arrived while signed out. That link left a code in
 * `pendingInviteStore` (A3/E6) and redirected here first (`GroupRouteGuard`
 * sends unauthenticated traffic to `/sign-in`, which lands back here once a
 * session exists via the same pending-invite check `(auth)/sign-in.tsx`
 * mirrors); once a session exists, resume straight to the code-less join
 * confirmation screen instead of the group list, then that screen consumes
 * the code.
 */
export default function IndexRoute() {
  const session = useSession();
  if (!session.principal) return <Redirect href="/sign-in" />;
  return (
    <Redirect href={pendingInviteStore.peek() ? "/groups/join" : "/groups"} />
  );
}
