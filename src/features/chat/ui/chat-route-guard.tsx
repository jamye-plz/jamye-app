import { Redirect } from "expo-router";
import type { PropsWithChildren } from "react";
import { getPublicEnv } from "@/core/config/public-env";
import { useSession } from "@/core/providers/session-provider";

export function ChatRouteGuard({ children }: PropsWithChildren) {
  return getPublicEnv().appMode === "connected-auth" ? (
    <AuthenticatedChat>{children}</AuthenticatedChat>
  ) : (
    <Redirect href="/" />
  );
}
function AuthenticatedChat({ children }: PropsWithChildren) {
  return useSession().principal ? <>{children}</> : <Redirect href="/" />;
}
