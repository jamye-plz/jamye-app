import { createContext, useContext, useSyncExternalStore } from "react";
import type { PropsWithChildren } from "react";
import type { SessionContextValue } from "@/core/providers/session-provider";
import type { MediaApi } from "../data/media-api";
import type {
  MediaFileCleanupPort,
  MediaObjectPutPort,
} from "./media-upload-ports";

/** Concrete transport and file IO are installed by the root composition only. */
export type MediaRuntime = Readonly<{
  api: MediaApi;
  authorize: SessionContextValue["authorizedRequest"];
  objectPut: MediaObjectPutPort;
  cleanup: MediaFileCleanupPort;
  accountKey: string;
  captureGeneration: () => number;
  isCurrent: (generation: number) => boolean;
  subscribeInvalidation: (listener: () => void) => () => void;
}>;

/** One account's foreground lifetime, not a persistent/background transfer queue. */
export function createMediaLifetime(initiallyForeground: boolean) {
  let generation = 0;
  let foreground = initiallyForeground;
  let disposed = false;
  const listeners = new Set<() => void>();
  const invalidate = () => {
    generation += 1;
    for (const listener of listeners) listener();
  };
  return {
    captureGeneration: () => generation,
    isCurrent: (value: number) =>
      !disposed && foreground && value === generation,
    subscribeInvalidation: (listener: () => void) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    setForeground: (value: boolean) => {
      if (disposed || foreground === value) return;
      foreground = value;
      invalidate();
    },
    dispose: () => {
      disposed = true;
      invalidate();
      listeners.clear();
    },
  };
}

const Context = createContext<MediaRuntime | null>(null);
export function MediaRuntimeProvider({
  value,
  children,
}: PropsWithChildren<{ value: MediaRuntime | null }>) {
  return <Context.Provider value={value}>{children}</Context.Provider>;
}
export function useMediaRuntime() {
  return useContext(Context);
}

const emptySubscribe = () => () => undefined;
const emptySnapshot = () => 0;
export function useMediaGeneration(runtime: MediaRuntime | null) {
  return useSyncExternalStore(
    runtime?.subscribeInvalidation ?? emptySubscribe,
    runtime?.captureGeneration ?? emptySnapshot,
    runtime?.captureGeneration ?? emptySnapshot,
  );
}
