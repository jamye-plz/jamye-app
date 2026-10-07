import { Redirect } from "expo-router";
import type { PropsWithChildren } from "react";
import { useSession } from "@/core/providers/session-provider";

// E7a/C13/AUTH-AC1: signed-out traffic lands on the dedicated
// `(auth)/sign-in` route (not `/`, which is a pure redirector since the
// login screen moved off it) -- this also covers "navigate to sign-in after
// logout" (AUTH-AC3), since a logout clears `principal` and this guard
// re-renders on the same mounted screen.
export function ChatRouteGuard({ children }: PropsWithChildren) {
  return useSession().principal ? (
    <>{children}</>
  ) : (
    <Redirect href="/sign-in" />
  );
}
