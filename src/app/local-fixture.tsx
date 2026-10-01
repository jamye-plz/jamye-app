import { Redirect } from "expo-router";

import { getPublicEnv } from "@/core/config/public-env";
import { ChatScreen } from "@/features/chat/ui/chat-screen";

/**
 * E7a/C13/AUTH-AC2: `local-fixture` mode's own route, split out of `/`
 * (`app/index.tsx`) so the login screen can move to `(auth)/sign-in` without
 * touching this mode. `ChatScreen` itself is unmodified -- same fixture
 * conversation, same "로컬 개발용 fixture 데이터입니다..." notice, same
 * self-set header title, preserving the pre-existing fixture behavior
 * exactly. `index.tsx` still owns hiding the native splash immediately for
 * this mode (E12); this route never mounts `SessionProvider` either.
 *
 * Like the old `/`, it shows the fixture only in `local-fixture` mode; any
 * other mode is sent back to `/`, which routes it to sign-in or the groups.
 */
export default function LocalFixtureRoute() {
  if (getPublicEnv().appMode !== "local-fixture") return <Redirect href="/" />;
  return <ChatScreen />;
}
