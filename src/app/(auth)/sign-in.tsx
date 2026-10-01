import { Redirect } from "expo-router";

import { useSession } from "@/core/providers/session-provider";
import { AuthScreen } from "@/features/auth/ui/auth-screen";
import { pendingInviteStore } from "@/features/groups/model/pending-invite-store";

/**
 * E7a/C13/AUTH-AC1: the login screen's own dedicated route, split out of the
 * `/` entry point (`app/index.tsx`) so every signed-out protected route
 * (`ChatRouteGuard`/`GroupRouteGuard`) has one shared destination to redirect
 * to. Mirrors `index.tsx`'s previous `ConnectedIndexRoute` logic exactly: a
 * validated principal never sees the login screen, it resumes straight past
 * it (to the pending invite's code-less join screen, A3/E6, or the group
 * list, ADR 0009) -- this covers both the "already signed in and a deep
 * link/guard redirected here anyway" case and "just finished signing in
 * while this screen was showing".
 */
export default function SignInRoute() {
  const session = useSession();
  if (session.principal) {
    return (
      <Redirect href={pendingInviteStore.peek() ? "/groups/join" : "/groups"} />
    );
  }
  return <AuthScreen />;
}
