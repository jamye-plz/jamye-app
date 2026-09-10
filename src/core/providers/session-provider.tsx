import * as WebBrowser from "expo-web-browser";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useSyncExternalStore,
} from "react";
import type { PropsWithChildren } from "react";
import { AppState } from "react-native";

import { createAuthApi } from "@/core/auth/auth-api";
import { createAuthController } from "@/core/auth/auth-controller";
import type { AuthController, AuthState } from "@/core/auth/auth-controller";
import { createPkcePair } from "@/core/auth/pkce";
import { secureSessionStore } from "@/core/auth/secure-session-store";
import { parsePublicApiOrigin } from "@/core/config/public-env";
import type { OAuthProvider } from "@/core/auth/types";
import { createProfileRecovery } from "@/features/sync/model/profile-recovery";

export type SessionPrincipal = Readonly<{
  origin: string;
  userId: string;
  epoch: number;
}>;

export type SessionContextValue = Readonly<{
  state: AuthState;
  principal: SessionPrincipal | null;
  login: (
    provider: OAuthProvider,
    providerRedirectUri: string,
    appReturnUri: string,
    signal?: AbortSignal,
  ) => Promise<void>;
  logout: (signal?: AbortSignal) => Promise<void>;
  restore: (signal?: AbortSignal) => Promise<void>;
  retryProfile: (signal?: AbortSignal) => Promise<void>;
  authorizedRequest: <T>(
    execute: (accessToken: string, signal: AbortSignal) => Promise<T>,
    signal?: AbortSignal,
  ) => Promise<T>;
}>;

const SessionContext = createContext<SessionContextValue | undefined>(
  undefined,
);

// auth-api.ts already rejects a malformed U1 id at the network boundary via
// the M6-01 generated User validator, so a signed-in profile's id is always
// UUID-shaped in production. This is a defense-in-depth re-check at the
// principal boundary itself, since createController is injectable and a test
// double or future implementation could publish state without going through
// that validator.
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function isValidUuid(value: string): boolean {
  return UUID_PATTERN.test(value);
}

async function productionOpenBrowser(url: string, redirectUri: string) {
  const result = await WebBrowser.openAuthSessionAsync(url, redirectUri);
  return result.type === "success"
    ? { type: "success" as const, url: result.url }
    : {
        type:
          result.type === "cancel" ? ("cancel" as const) : ("dismiss" as const),
      };
}

export function createProductionSessionController(
  origin: string,
): AuthController {
  return createAuthController({
    origin,
    api: createAuthApi(origin),
    store: secureSessionStore,
    createPkce: createPkcePair,
    openBrowser: productionOpenBrowser,
  });
}

export type SessionProviderProps = PropsWithChildren<
  Readonly<{
    origin: string;
    createController?: (origin: string) => AuthController;
  }>
>;

export function SessionProvider({
  children,
  origin,
  createController = createProductionSessionController,
}: SessionProviderProps) {
  const apiOrigin = parsePublicApiOrigin(origin);
  const controller = useMemo(
    () => createController(apiOrigin),
    [apiOrigin, createController],
  );
  const subscribe = useCallback(
    (notify: () => void) => controller.subscribe(notify),
    [controller],
  );
  const state = useSyncExternalStore(
    subscribe,
    controller.getState,
    controller.getState,
  );

  useEffect(() => {
    const recovery = createProfileRecovery(
      controller,
      AppState.currentState === "active",
    );
    const appStateSubscription = AppState.addEventListener("change", (next) => {
      recovery.setForeground(next === "active");
    });
    void controller.restore();
    return () => {
      appStateSubscription?.remove();
      recovery.dispose();
      controller.dispose();
    };
  }, [controller]);

  const principal = useMemo<SessionPrincipal | null>(() => {
    if (state.status !== "signed-in" || !state.profile) return null;
    if (!isValidUuid(state.profile.id)) return null;
    return {
      origin: apiOrigin,
      userId: state.profile.id,
      epoch: controller.getGeneration(),
    };
  }, [state, apiOrigin, controller]);

  const value = useMemo<SessionContextValue>(
    () => ({
      state,
      principal,
      login: (provider, providerRedirectUri, appReturnUri, signal) =>
        controller.signIn(provider, providerRedirectUri, appReturnUri, signal),
      logout: (signal) => controller.logout(signal),
      restore: (signal) => controller.restore(signal),
      retryProfile: (signal) => controller.retryProfile(signal),
      authorizedRequest: (execute, signal) =>
        controller.authorizedRequest(execute, signal),
    }),
    [state, principal, controller],
  );

  return (
    <SessionContext.Provider value={value}>{children}</SessionContext.Provider>
  );
}

export function useSession(): SessionContextValue {
  const value = useContext(SessionContext);
  if (!value) {
    throw new Error("useSession must be used inside a SessionProvider.");
  }
  return value;
}
