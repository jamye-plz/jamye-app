import * as SplashScreen from "expo-splash-screen";
import * as WebBrowser from "expo-web-browser";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useSyncExternalStore,
} from "react";
import type { PropsWithChildren } from "react";
import { AppState } from "react-native";

import { appleAuthenticationPort } from "@/core/auth/apple-authentication-port";
import { createAppleNonce } from "@/core/auth/apple-authentication.shared";
import { createAuthApi } from "@/core/auth/auth-api";
import { createAuthController } from "@/core/auth/auth-controller";
import type { AuthController, AuthState } from "@/core/auth/auth-controller";
import { createPkcePair } from "@/core/auth/pkce";
import { secureSessionStore } from "@/core/auth/secure-session-store";
import { parsePublicApiOrigin } from "@/core/config/public-env";
import type { OAuthProvider, UserProfile } from "@/core/auth/types";
import { consoleLoggerSink, createLogger } from "@/core/logging/logger";
import { createProfileRecovery } from "@/features/sync/model/profile-recovery";

/**
 * L3/E12: the native splash screen must survive session restore so the
 * login screen never flashes behind it. `preventAutoHideAsync` runs once at
 * module evaluation time -- this file is statically imported (directly by
 * `app/index.tsx`, and transitively via `app-providers.tsx` from the root
 * layout) regardless of app mode, so this fires at process start even in
 * `local-fixture` mode, where `SessionProvider` itself never mounts and
 * `app/index.tsx` hides the splash immediately instead (see its own E12
 * comment). `void` matches the existing fire-and-forget style below (`void
 * controller.restore()`).
 */
void SplashScreen.preventAutoHideAsync();
/** Safety fallback (E12) so a stuck restore never leaves the splash on screen. */
const SPLASH_SAFETY_TIMEOUT_MS = 3000;

/**
 * C9 (M17 ANR round 2, DEBUG-AC3): dev-only startup timing. `moduleLoadTimeMs`
 * is the earliest marker available in this task's file scope -- this module
 * is evaluated at process start regardless of app mode (see the comment
 * above). `startupTimingLogger` reuses the shared structured logger; every
 * call below is gated by `__DEV__` and its metadata carries only numeric
 * durations or fixed enum labels, never tokens/ids/profile fields. The fixed
 * `[startup-timing]` event prefix is grep-able in logcat/Metro output.
 */
const moduleLoadTimeMs = __DEV__ ? Date.now() : 0;
const startupTimingLogger = createLogger(consoleLoggerSink);

/** Logs `start_to_first_screen` once, for whichever splash-hide trigger wins. */
function logStartToFirstScreen(trigger: "timeout" | "restore"): void {
  if (!__DEV__) return;
  startupTimingLogger.log("[startup-timing] start_to_first_screen", "debug", {
    durationMs: Date.now() - moduleLoadTimeMs,
    trigger,
  });
}

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
  /**
   * E14/E15/AC6 entry point: the iOS-only Apple button calls this directly
   * (no provider/redirect args -- there is no browser/PKCE leg). Delegates
   * to the controller's Apple auth interface slot
   * (`AuthController.signInWithApple`); a controller double that omits it
   * (see that type's own comment) resolves to a no-op.
   */
  loginWithApple: (signal?: AbortSignal) => Promise<void>;
  logout: (signal?: AbortSignal) => Promise<void>;
  restore: (signal?: AbortSignal) => Promise<void>;
  retryProfile: (signal?: AbortSignal) => Promise<void>;
  authorizedRequest: <T>(
    execute: (accessToken: string, signal: AbortSignal) => Promise<T>,
    signal?: AbortSignal,
  ) => Promise<T>;
  applyProfile: (profile: UserProfile) => void;
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
    applePort: appleAuthenticationPort,
    createAppleNonce,
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
    const restorePromise = controller.restore();
    if (__DEV__) {
      const restoreStartMs = Date.now();
      void restorePromise.finally(() => {
        startupTimingLogger.log("[startup-timing] session_restore", "debug", {
          durationMs: Date.now() - restoreStartMs,
        });
      });
    }
    return () => {
      appStateSubscription?.remove();
      recovery.dispose();
      controller.dispose();
    };
  }, [controller]);

  // L3/E12: hide the splash the first moment restore is no longer in flight
  // (signed-in/signed-out/error), or after a 3s safety timeout, whichever
  // comes first. `hiddenSplash` fences both triggers so only the earliest
  // one actually calls `hideAsync` -- a later flip back to "loading" (e.g.
  // `retryProfile`'s own transient loading state, long after launch) never
  // re-triggers this once the splash is already gone.
  const hiddenSplash = useRef(false);
  useEffect(() => {
    const timer = setTimeout(() => {
      if (hiddenSplash.current) return;
      hiddenSplash.current = true;
      logStartToFirstScreen("timeout");
      void SplashScreen.hideAsync();
    }, SPLASH_SAFETY_TIMEOUT_MS);
    return () => clearTimeout(timer);
  }, []);
  useEffect(() => {
    if (state.status === "loading" || hiddenSplash.current) return;
    hiddenSplash.current = true;
    logStartToFirstScreen("restore");
    void SplashScreen.hideAsync();
  }, [state.status]);

  const principal = useMemo<SessionPrincipal | null>(() => {
    if (state.status !== "signed-in" || !state.profile) return null;
    if (!isValidUuid(state.profile.id)) return null;
    return {
      origin: apiOrigin,
      userId: state.profile.id,
      epoch: controller.getGeneration(),
    };
  }, [state, apiOrigin, controller]);

  // Feature runtimes must survive a token refresh for the same account.
  const authorizedRequest = useCallback<
    SessionContextValue["authorizedRequest"]
  >(
    (execute, signal) => controller.authorizedRequest(execute, signal),
    [controller],
  );

  // `logout` and `applyProfile` are identity-stable for the same reason:
  // feature orchestration (e.g. the account lifecycle) is built from them and
  // must not be recreated by every state publish.
  const logout = useCallback<SessionContextValue["logout"]>(
    (signal) => controller.logout(signal),
    [controller],
  );
  const applyProfile = useCallback<SessionContextValue["applyProfile"]>(
    (profile) => controller.applyProfile(profile),
    [controller],
  );
  const loginWithApple = useCallback<SessionContextValue["loginWithApple"]>(
    (signal) =>
      controller.signInWithApple
        ? controller.signInWithApple(signal)
        : Promise.resolve(),
    [controller],
  );

  const value = useMemo<SessionContextValue>(
    () => ({
      state,
      principal,
      login: (provider, providerRedirectUri, appReturnUri, signal) =>
        controller.signIn(provider, providerRedirectUri, appReturnUri, signal),
      loginWithApple,
      logout,
      restore: (signal) => controller.restore(signal),
      retryProfile: (signal) => controller.retryProfile(signal),
      authorizedRequest,
      applyProfile,
    }),
    [
      state,
      principal,
      controller,
      authorizedRequest,
      logout,
      applyProfile,
      loginWithApple,
    ],
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
