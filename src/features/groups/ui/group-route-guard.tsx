import { Redirect } from "expo-router";
import type { PropsWithChildren } from "react";
import { getPublicEnv } from "@/core/config/public-env";
import { useSession } from "@/core/providers/session-provider";

export function GroupRouteGuard({ children }: PropsWithChildren) {
  return getPublicEnv().appMode === "connected-auth" ? (
    <AuthenticatedGroup>{children}</AuthenticatedGroup>
  ) : (
    <Redirect href="/" />
  );
}
function AuthenticatedGroup({ children }: PropsWithChildren) {
  return useSession().principal ? <>{children}</> : <Redirect href="/" />;
}
