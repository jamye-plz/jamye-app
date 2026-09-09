import { getPublicEnv } from "@/core/config/public-env";
import { useSession } from "@/core/providers/session-provider";
import { AuthScreen } from "@/features/auth/ui/auth-screen";
import { ChatScreen } from "@/features/chat/ui/chat-screen";
import { HomeScreen } from "@/features/home/ui/home-screen";
import { GroupListScreen } from "@/features/groups/ui/group-list-screen";

export default function IndexRoute() {
  return getPublicEnv().appMode === "connected-auth" ? (
    <ConnectedIndexRoute />
  ) : (
    <ChatScreen />
  );
}

function ConnectedIndexRoute() {
  const session = useSession();
  return session.principal ? (
    <GroupListScreen header={<HomeScreen embedded />} />
  ) : (
    <AuthScreen />
  );
}
