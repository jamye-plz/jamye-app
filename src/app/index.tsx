import { Redirect } from "expo-router";

import { getPublicEnv } from "@/core/config/public-env";
import { useSession } from "@/core/providers/session-provider";
import { AuthScreen } from "@/features/auth/ui/auth-screen";
import { ChatScreen } from "@/features/chat/ui/chat-screen";
import { pendingInviteStore } from "@/features/groups/model/pending-invite-store";

export default function IndexRoute() {
  return getPublicEnv().appMode === "connected-auth" ? (
    <ConnectedIndexRoute />
  ) : (
    <ChatScreen />
  );
}

/**
 * A validated principal enters the tab bar at the groups tab (ADR 0009) --
 * unless an invite link arrived while signed out. That link left a code in
 * `pendingInviteStore` (A3/E6) and redirected here first (`GroupRouteGuard`
 * sends unauthenticated traffic to `/`); once a session exists, resume
 * straight to the code-less join confirmation screen instead of the group
 * list, then that screen consumes the code.
 */
function ConnectedIndexRoute() {
  const session = useSession();
  if (!session.principal) return <AuthScreen />;
  return (
    <Redirect href={pendingInviteStore.peek() ? "/groups/join" : "/groups"} />
  );
}
