/**
 * App-wide wiring for the Expo push installation lifecycle. Mounted inside
 * `AppProviders`' connected-auth branch (a sibling provider next to
 * `MediaProvider`/`GroupsProvider`, not a `session-provider.tsx` edit): it
 * observes `useSession().principal` and drives A2's pure
 * `push-lifecycle.ts` state machine with A1's concrete
 * `push-installations-api.ts` bound to `authorizedRequest`, A2's
 * `push-notifications-adapter.ts`, and A2's device-scoped
 * `installation-id-store.ts`.
 *
 * Environment resolution: `Constants.expoConfig?.extra?.appVariant` maps
 * `"production"` -> `"production"`, anything else (including `undefined`
 * and the current `"development"`-only build) -> `"development"`. This is
 * a JS manifest read only, so it never requires a native rebuild.
 *
 * Account switch: logging out calls `disable()` (P4, teardown) while the
 * outgoing principal's `authorizedRequest` is still valid (this provider is
 * mounted below `SessionProvider`, so `session.authorizedRequest` always
 * reflects the still-signed-in controller at the moment `disable()` runs —
 * `account-screen.tsx`'s logout handler calls it before `session.logout()`).
 * The device-scoped `installation-id-store` id is reused across accounts,
 * so the next principal's sign-in registers (P2) with the same
 * `installationId`, and the shared `push-lifecycle.ts` state machine
 * guarantees `remove()` (P4) resolves before the next `create()` (P2) call.
 */
import Constants from "expo-constants";
import * as SecureStore from "expo-secure-store";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import type { PropsWithChildren } from "react";

import { useSession } from "@/core/providers/session-provider";
import { createPushInstallationsApi } from "@/features/notifications/data/push-installations-api";
import type { PushInstallationsPort as HttpPushInstallationsPort } from "@/features/notifications/data/push-installations-api";
import {
  createPushLifecycle,
  type CreateInstallationInput,
  type PushEnvironment,
  type PushLifecycleState,
  type PushPlatform,
  type UpdateInstallationInput,
} from "@/features/notifications/model/push-lifecycle";
import { installationIdStore as defaultInstallationIdStore } from "@/features/notifications/platform/installation-id-store";
import type { InstallationIdStore } from "@/features/notifications/platform/installation-id-store";
import * as pushNotificationsAdapter from "@/features/notifications/platform/push-notifications-adapter";

const MESSAGE_PREVIEW_PREFERENCE_KEY = "jamye.push.message-preview-enabled.v1";

type SecureStorageLikePort = Readonly<{
  getItemAsync: (key: string) => Promise<string | null>;
  setItemAsync: (key: string, value: string) => Promise<void>;
}>;

export type PushAdapterPort = Readonly<{
  getPermissions: typeof pushNotificationsAdapter.getPermissions;
  requestPermissions: typeof pushNotificationsAdapter.requestPermissions;
  getExpoPushToken: typeof pushNotificationsAdapter.getExpoPushToken;
  onTokenChanged: typeof pushNotificationsAdapter.onTokenChanged;
}>;

export type PushLifecycleContextValue = Readonly<{
  state: PushLifecycleState;
  previewEnabled: boolean;
  expoToken: string | null;
  enable: () => Promise<void>;
  disable: () => Promise<void>;
  setMessagePreview: (enabled: boolean) => Promise<void>;
}>;

const PushLifecycleContext = createContext<
  PushLifecycleContextValue | undefined
>(undefined);

/** `process.env.EXPO_OS` mirrors the pattern already used by `grouped-section.tsx`. */
export function derivePushPlatform(): PushPlatform {
  return process.env.EXPO_OS === "android" ? "android" : "ios";
}

/** [r2] `extra.appVariant` source: `"production"` maps through, everything else (including undefined) falls back to `"development"`. */
export function derivePushEnvironment(appVariant: unknown): PushEnvironment {
  return appVariant === "production" ? "production" : "development";
}

function readExpoExtra(): Readonly<{
  projectId: string | null;
  appVariant: unknown;
}> {
  const extra = Constants.expoConfig?.extra as
    | Readonly<{ eas?: { projectId?: string }; appVariant?: unknown }>
    | undefined;
  return {
    appVariant: extra?.appVariant,
    projectId: extra?.eas?.projectId ?? null,
  };
}

export type PushLifecycleProviderProps = PropsWithChildren<
  Readonly<{
    origin: string;
    createHttpPort?: (origin: string) => HttpPushInstallationsPort;
    adapter?: PushAdapterPort;
    installationIdStore?: InstallationIdStore;
    preferenceStore?: SecureStorageLikePort;
    projectId?: string | null;
    appVariant?: unknown;
  }>
>;

export function PushLifecycleProvider({
  children,
  origin,
  createHttpPort = createPushInstallationsApi,
  adapter = pushNotificationsAdapter,
  installationIdStore: idStore = defaultInstallationIdStore,
  preferenceStore = SecureStore,
  projectId,
  appVariant,
}: PushLifecycleProviderProps) {
  const session = useSession();
  const httpApi = useMemo(
    () => createHttpPort(origin),
    [createHttpPort, origin],
  );

  const expoExtra = useMemo(() => readExpoExtra(), []);
  const resolvedProjectId =
    projectId !== undefined ? projectId : expoExtra.projectId;
  const resolvedAppVariant =
    appVariant !== undefined ? appVariant : expoExtra.appVariant;
  const platform = derivePushPlatform();
  const environment = derivePushEnvironment(resolvedAppVariant);

  const { authorizedRequest } = session;

  /**
   * `push-lifecycle.ts` and its bound port are constructed exactly once,
   * inside this lazy initializer, so the eslint "rules of react" ref-purity
   * check (which forbids passing a `useRef`-backed callback into another
   * function during render, since the callee might invoke it synchronously)
   * never sees a ref: `lastKnownExpoToken` is a plain closure variable, not
   * a `useRef`. A1's P3 PUT contract requires `expoToken` on every update,
   * even a preview-only toggle, but `push-lifecycle.ts` only supplies one on
   * a token rotation — `rememberExpoToken` (called later, from `enable()`
   * and the token-rotation effect, never during render) is how this closure
   * variable stays in sync.
   */
  const [{ lifecycle, rememberExpoToken }] = useState(() => {
    let lastKnownExpoToken: string | null = null;
    const pushLifecycle = createPushLifecycle({
      create: (input: CreateInstallationInput) =>
        authorizedRequest((accessToken, signal) =>
          httpApi.create(accessToken, input, signal),
        ),
      delete: (installationId: string) =>
        authorizedRequest((accessToken, signal) =>
          httpApi.remove(accessToken, installationId, signal),
        ),
      update: (installationId: string, input: UpdateInstallationInput) => {
        const expoToken = input.expoToken ?? lastKnownExpoToken;
        if (!expoToken)
          return Promise.reject(
            new Error("push installation update requires a known expo token"),
          );
        return authorizedRequest((accessToken, signal) =>
          httpApi.update(
            accessToken,
            installationId,
            { expoToken, messagePreviewEnabled: input.messagePreviewEnabled },
            signal,
          ),
        );
      },
    });
    return {
      lifecycle: pushLifecycle,
      rememberExpoToken: (token: string) => {
        lastKnownExpoToken = token;
      },
    };
  });

  const lifecycleState = useSyncExternalStore(
    lifecycle.subscribe,
    lifecycle.getState,
    lifecycle.getState,
  );

  const [previewEnabled, setPreviewEnabled] = useState(false);
  const [expoToken, setExpoToken] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    void preferenceStore
      .getItemAsync(MESSAGE_PREVIEW_PREFERENCE_KEY)
      .then((value) => {
        if (active && value === "true") setPreviewEnabled(true);
      })
      // An unreadable preference keeps the conservative default (off).
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, [preferenceStore]);

  const enable = useCallback(async (): Promise<void> => {
    // Platform ports (permissions, secure storage, push token) reject on
    // native/keychain failures; `push-lifecycle.ts` only guards its own HTTP
    // port, so those rejections are folded into its `error` state here
    // instead of escaping the `void enable()` effect as unhandled rejections.
    try {
      const permission = await adapter.getPermissions();
      const resolvedPermission =
        permission === "undetermined"
          ? await adapter.requestPermissions()
          : permission;

      if (resolvedPermission !== "granted") {
        await lifecycle.start({
          environment,
          installationId: "",
          messagePreviewEnabled: previewEnabled,
          permissionStatus: resolvedPermission,
          platform,
          token: { ok: false, reason: "not_physical_device" },
        });
        return;
      }

      const installationId = await idStore.getOrCreate();
      const token = resolvedProjectId
        ? await adapter.getExpoPushToken({ projectId: resolvedProjectId })
        : ({ ok: false, reason: "missing_project_id" } as const);
      if (token.ok) {
        rememberExpoToken(token.token);
        setExpoToken(token.token);
      }

      await lifecycle.start({
        environment,
        installationId,
        messagePreviewEnabled: previewEnabled,
        permissionStatus: resolvedPermission,
        platform,
        token,
      });
    } catch {
      lifecycle.markPlatformFailure();
    }
  }, [
    adapter,
    environment,
    idStore,
    lifecycle,
    platform,
    previewEnabled,
    rememberExpoToken,
    resolvedProjectId,
  ]);

  const disable = useCallback(async (): Promise<void> => {
    await lifecycle.teardown();
  }, [lifecycle]);

  const setMessagePreview = useCallback(
    async (enabled: boolean): Promise<void> => {
      setPreviewEnabled(enabled);
      await preferenceStore.setItemAsync(
        MESSAGE_PREVIEW_PREFERENCE_KEY,
        enabled ? "true" : "false",
      );
      await lifecycle.setMessagePreviewEnabled(enabled);
    },
    [lifecycle, preferenceStore],
  );

  const principalUserIdRef = useRef<string | null>(null);
  useEffect(() => {
    const currentUserId = session.principal?.userId ?? null;
    if (currentUserId && currentUserId !== principalUserIdRef.current) {
      principalUserIdRef.current = currentUserId;
      void enable();
    } else if (!currentUserId && principalUserIdRef.current !== null) {
      // The principal vanished without an explicit `disable()` (session
      // expiry/revocation, a sign-out path other than the account screen
      // button): best-effort P4 teardown so the local state and, while the
      // token is still accepted, the server installation stop targeting
      // the previous user. `teardown()` is a no-op when nothing is
      // registered and never throws.
      principalUserIdRef.current = null;
      void lifecycle.teardown();
    }
  }, [session.principal?.userId, enable, lifecycle]);

  useEffect(
    () =>
      adapter.onTokenChanged(() => {
        if (!resolvedProjectId) return;
        void adapter
          .getExpoPushToken({ projectId: resolvedProjectId })
          .then((result) => {
            if (!result.ok) return;
            rememberExpoToken(result.token);
            setExpoToken(result.token);
            void lifecycle.rotateToken(result.token);
          })
          .catch(() => lifecycle.markPlatformFailure());
      }),
    [adapter, lifecycle, rememberExpoToken, resolvedProjectId],
  );

  const value = useMemo<PushLifecycleContextValue>(
    () => ({
      disable,
      enable,
      expoToken,
      previewEnabled,
      setMessagePreview,
      state: lifecycleState,
    }),
    [
      disable,
      enable,
      expoToken,
      previewEnabled,
      setMessagePreview,
      lifecycleState,
    ],
  );

  return (
    <PushLifecycleContext.Provider value={value}>
      {children}
    </PushLifecycleContext.Provider>
  );
}

export function usePushLifecycle(): PushLifecycleContextValue {
  const value = useContext(PushLifecycleContext);
  if (!value) {
    throw new Error(
      "usePushLifecycle must be used inside PushLifecycleProvider.",
    );
  }
  return value;
}
