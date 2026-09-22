import { Redirect } from "expo-router";

import { getPublicEnv } from "@/core/config/public-env";
import { useSession } from "@/core/providers/session-provider";
import { AuthScreen } from "@/features/auth/ui/auth-screen";
import { ChatScreen } from "@/features/chat/ui/chat-screen";

export default function IndexRoute() {
  return getPublicEnv().appMode === "connected-auth" ? (
    <ConnectedIndexRoute />
  ) : (
    <ChatScreen />
  );
}

/** A validated principal enters the tab bar at the groups tab (ADR 0009). */
function ConnectedIndexRoute() {
  const session = useSession();
  return session.principal ? <Redirect href="/groups" /> : <AuthScreen />;
}
