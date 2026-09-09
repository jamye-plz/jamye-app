import { getPublicEnv } from "@/core/config/public-env";
import { AuthScreen } from "@/features/auth/ui/auth-screen";
import { ChatScreen } from "@/features/chat/ui/chat-screen";

export default function IndexRoute() {
  return getPublicEnv().appMode === "connected-auth" ? (
    <AuthScreen />
  ) : (
    <ChatScreen />
  );
}
