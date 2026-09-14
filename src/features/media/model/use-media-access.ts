import { useMemo } from "react";
import { useMediaRuntime } from "./media-runtime";

export function useMediaAccess() {
  const runtime = useMediaRuntime();
  return useMemo(
    () =>
      runtime
        ? {
            getAccessUrl: (id: string, signal?: AbortSignal) =>
              runtime.authorize(
                (token, authSignal) =>
                  runtime.api.getAccess(token, id, authSignal),
                signal,
              ),
            getDownloadLocation: (id: string, signal?: AbortSignal) =>
              runtime.authorize(
                (token, authSignal) =>
                  runtime.api.getDownloadLocation(token, id, authSignal),
                signal,
              ),
            listTopicMedia: (
              id: string,
              params: { after?: string; limit?: number },
              signal?: AbortSignal,
            ) =>
              runtime.authorize(
                (token, authSignal) =>
                  runtime.api.listTopicMedia(token, id, params, authSignal),
                signal,
              ),
          }
        : null,
    [runtime],
  );
}
