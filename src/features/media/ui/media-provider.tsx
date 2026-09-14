import { useLayoutEffect, useMemo, useSyncExternalStore } from "react";
import type { PropsWithChildren } from "react";
import { AppState } from "react-native";

import { getPublicEnv } from "@/core/config/public-env";
import { useSession } from "@/core/providers/session-provider";
import { createMediaApi } from "@/features/media/data/media-api";
import {
  createMediaLifetime,
  MediaRuntimeProvider,
} from "@/features/media/model/media-runtime";
import type { MediaRuntime } from "@/features/media/model/media-runtime";
import { cleanupAllDownloadedFiles } from "@/features/media/platform/media-downloads";
import { createNativeMediaObjectPutPort } from "@/features/media/platform/media-object-transfer";
import {
  cleanupAllStagedFiles,
  createNativeMediaFileCleanupPort,
} from "@/features/media/platform/media-staging";
import { createNativeMediaHttpTransport } from "@/features/media/platform/native-media-transport";

function createLifetimeSlot(accountKey: string) {
  let current: ReturnType<typeof createMediaLifetime> | null = null;
  const listeners = new Set<() => void>();
  return {
    accountKey,
    getSnapshot: () => current,
    subscribe: (listener: () => void) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    replace: (lifetime: typeof current) => {
      current = lifetime;
      for (const listener of listeners) listener();
    },
  };
}

function sweepOwnedTempFiles(): void {
  // A failed cache cleanup must not prevent authentication or text chat.
  try {
    cleanupAllStagedFiles();
  } catch {
    /* retried next account/startup */
  }
  try {
    cleanupAllDownloadedFiles();
  } catch {
    /* retried next account/startup */
  }
}

/**
 * Constructs the account-scoped `MediaRuntime` (core/model's consumption seam:
 * `useMediaUploadQueue`/`useMediaAccess`) from the native transport/object-put/cleanup
 * adapters plus the active session, and renders `MediaRuntimeProvider`. With no
 * `EXPO_PUBLIC_MEDIA_ORIGIN` configured, or no signed-in principal, the runtime is
 * `null` and every media hook degrades to its documented disabled state — never a
 * crash. Also owns account/background fencing: an account switch or a background
 * transition bumps the runtime's generation, notifies subscribed upload queues to
 * clear their in-flight drafts, and sweeps app-owned staging/download temp files.
 */
export function MediaProvider({ children }: PropsWithChildren) {
  const { principal, authorizedRequest } = useSession();
  const accountKey = principal
    ? `${principal.origin}:${principal.userId}:${principal.epoch}`
    : "";
  const slot = useMemo(() => createLifetimeSlot(accountKey), [accountKey]);
  const lifetime = useSyncExternalStore(
    slot.subscribe,
    slot.getSnapshot,
    slot.getSnapshot,
  );

  useLayoutEffect(() => {
    // Suspense/StrictMode may clean up and restart effects without discarding
    // component state. A disposed lifetime must never be reused or revived.
    const nextLifetime = createMediaLifetime(
      AppState.currentState !== "background",
    );
    sweepOwnedTempFiles();
    const subscription = AppState.addEventListener("change", (state) => {
      // System picker/share dialogs may be inactive without being background.
      if (state === "background") nextLifetime.setForeground(false);
      if (state === "active") nextLifetime.setForeground(true);
    });
    slot.replace(nextLifetime);
    return () => {
      subscription.remove();
      // Abort consumers before deleting their app-owned files. During an OS
      // share sheet, that operation retains its file until the sheet returns.
      nextLifetime.dispose();
      slot.replace(null);
      sweepOwnedTempFiles();
    };
  }, [slot]);

  const nativeParts = useMemo(() => {
    const env = getPublicEnv();
    if (env.appMode !== "connected-auth" || !env.apiOrigin || !env.mediaOrigin)
      return null;
    return {
      api: createMediaApi(
        env.apiOrigin,
        env.mediaOrigin,
        createNativeMediaHttpTransport(),
      ),
      objectPut: createNativeMediaObjectPutPort(),
      cleanup: createNativeMediaFileCleanupPort(),
    };
  }, []);

  const runtime = useMemo<MediaRuntime | null>(() => {
    // Never expose the previous account while its replacement effect commits.
    if (!nativeParts || !slot.accountKey || !lifetime) return null;
    const authorize: MediaRuntime["authorize"] = async (execute, signal) => {
      const generation = lifetime.captureGeneration();
      const check = () => {
        if (signal?.aborted || !lifetime.isCurrent(generation))
          throw new Error("media_scope_cancelled");
      };
      check();
      const result = await authorizedRequest((token, authSignal) => {
        check();
        return execute(token, authSignal);
      }, signal);
      check();
      return result;
    };
    return {
      ...nativeParts,
      ...lifetime,
      accountKey: slot.accountKey,
      authorize,
    };
  }, [nativeParts, authorizedRequest, lifetime, slot]);

  return (
    <MediaRuntimeProvider value={runtime}>{children}</MediaRuntimeProvider>
  );
}
