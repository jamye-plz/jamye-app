import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import { useFocusEffect } from "expo-router";
import { consoleLoggerSink, createLogger } from "@/core/logging/logger";
import { useMediaRuntime, useMediaGeneration } from "../model/media-runtime";
import { useMediaAccess } from "../model/use-media-access";
import { MAX_VIDEO_BYTES } from "../model/media-policy";
import {
  acquireThumbnail,
  canRetryThumbnail,
  invalidateThumbnailCache,
  markThumbnailImageFailed,
  retryThumbnail,
  type ThumbnailCacheState,
} from "../model/video-thumbnail-cache";
import { enqueueVideoThumbnail } from "../model/video-thumbnail-queue";
import {
  allocateDownloadDestination,
  removeDownloadedFile,
} from "../platform/media-downloads";
import {
  acquireMediaObject,
  invalidateMediaObjectCache,
} from "../platform/media-object-cache";
import { downloadToFile } from "../platform/media-object-transfer";
import { createNativeVideoThumbnail } from "../platform/native-video-thumbnail";

const thumbnailLogger = createLogger(consoleLoggerSink);

type FailureStage =
  "access" | "download" | "generate" | "copy" | "timeout" | "cancelled";

const WATCHDOG_MS = 120_000;
/** Poster images are pre-rendered JPEGs, not full video sources — a much tighter
 * byte budget than `MAX_VIDEO_BYTES` (also enforced by `downloadToFile`'s
 * `Math.min(maxBytes, MAX_VIDEO_BYTES)` clamp). */
const MAX_POSTER_BYTES = 1_048_576;

function codeFromError(error: unknown): string {
  if (!(error instanceof Error)) return "unknown";
  if (error.message === "invalid_video_metadata") return "invalid_metadata";
  if (error.message.startsWith("thumbnail_unavailable:")) {
    return error.message.split(":")[2] ?? "unknown";
  }
  return "unknown";
}

/** Poster failures are not decomposed into access/download/generate stages (there
 * is no generation step) — the raw error message is diagnostic enough on its own. */
function codeFromPosterError(error: unknown): string {
  return error instanceof Error ? error.message || "unknown" : "unknown";
}

/** The shared object-cache load is not tied to this job's own AbortController (it
 * outlives any single acquirer). Race it against `signal` so a watchdog/cancel can
 * still make this job give up waiting, without cancelling other acquirers' use. */
function raceAbort<T>(promise: Promise<T>, signal: AbortSignal): Promise<T> {
  if (signal.aborted) return Promise.reject(new Error("thumbnail_cancelled"));
  return new Promise<T>((resolve, reject) => {
    const onAbort = () => reject(new Error("thumbnail_cancelled"));
    signal.addEventListener("abort", onAbort, { once: true });
    promise.then(
      (value) => {
        signal.removeEventListener("abort", onAbort);
        resolve(value);
      },
      (error: unknown) => {
        signal.removeEventListener("abort", onAbort);
        reject(error);
      },
    );
  });
}

function stageFromError(error: unknown, fallback: FailureStage): FailureStage {
  if (
    error instanceof Error &&
    error.message.startsWith("thumbnail_unavailable:")
  ) {
    const stage = error.message.split(":")[1];
    if (
      stage === "access" ||
      stage === "download" ||
      stage === "generate" ||
      stage === "copy" ||
      stage === "timeout" ||
      stage === "cancelled"
    )
      return stage;
  }
  return fallback;
}

export function useMediaVideoThumbnail(
  mediaId: string,
  enabled: boolean,
  posterMediaId?: string | null,
) {
  const runtime = useMediaRuntime();
  const access = useMediaAccess();
  const generation = useMediaGeneration(runtime);
  const [nonce, setNonce] = useState(0);
  // A poster and the legacy (frame-extracted) thumbnail for the same mediaId must
  // never share cache state: a receiver on an older build (no posterMediaId) and
  // one on this build looking at the same message would otherwise collide.
  const thumbnailKey =
    typeof posterMediaId === "string"
      ? `${mediaId}:poster:${posterMediaId}`
      : mediaId;
  const key = `${runtime?.accountKey}:${generation}:${thumbnailKey}:${nonce}`;
  const [loaded, setLoaded] = useState<{
    key: string;
    state: ThumbnailCacheState;
  } | null>(null);
  const mountedRef = useRef(true);
  // Layout effects (and their cleanups) all run before any passive effect's cleanup
  // in the same commit, so this always reflects the latest render's `enabled` by the
  // time useFocusEffect's own (passive) cleanup below reads it — distinguishing
  // "enabled just turned false" (grace-eligible) from a blur/identity-change cleanup
  // where the latest render still has `enabled` true.
  const latestEnabledRef = useRef(enabled);
  useLayoutEffect(() => {
    latestEnabledRef.current = enabled;
  }, [enabled]);

  const legacyJob = useCallback(
    (controller: AbortController) =>
      enqueueVideoThumbnail(controller.signal, async () => {
        let timedOut = false;
        const watchdog = setTimeout(() => {
          timedOut = true;
          controller.abort();
        }, WATCHDOG_MS);
        const fail = (stage: FailureStage, error: unknown): never => {
          const effectiveStage = timedOut ? "timeout" : stage;
          if (effectiveStage !== "cancelled") {
            thumbnailLogger.log("media.video-thumbnail.failed", "warn", {
              mediaId,
              stage: effectiveStage,
              code: timedOut ? "watchdog" : codeFromError(error),
            });
          }
          throw error;
        };
        let object: {
          uri: Promise<string>;
          release: (immediate?: boolean) => void;
        } | null = null;
        try {
          const mediaAccess = access;
          if (!mediaAccess) throw new Error("thumbnail_cancelled");
          let media: Awaited<ReturnType<typeof mediaAccess.getAccessUrl>>;
          try {
            media = await mediaAccess.getAccessUrl(mediaId, controller.signal);
          } catch (error) {
            return fail(
              controller.signal.aborted ? "cancelled" : "access",
              error,
            );
          }
          if (controller.signal.aborted)
            return fail("cancelled", new Error("thumbnail_cancelled"));
          if (
            media.id !== mediaId ||
            media.contentType !== "video/mp4" ||
            !Number.isSafeInteger(media.byteSize) ||
            media.byteSize <= 0 ||
            media.byteSize > MAX_VIDEO_BYTES
          ) {
            return fail("access", new Error("invalid_video_metadata"));
          }
          object = acquireMediaObject(mediaId, async (signal) => {
            const destination = allocateDownloadDestination({
              mediaId,
              filename: "preview-source.mp4",
            });
            try {
              await downloadToFile({
                url: media.url,
                destination,
                expectedBytes: media.byteSize,
                maxBytes: MAX_VIDEO_BYTES,
                signal,
              });
              return destination.uri;
            } catch (error) {
              removeDownloadedFile(destination.uri);
              throw error;
            }
          });
          let videoUri: string;
          try {
            videoUri = await raceAbort(object.uri, controller.signal);
          } catch (error) {
            return fail(
              controller.signal.aborted ? "cancelled" : "download",
              error,
            );
          }
          if (controller.signal.aborted)
            return fail("cancelled", new Error("thumbnail_cancelled"));
          try {
            return await createNativeVideoThumbnail(
              videoUri,
              controller.signal,
            );
          } catch (error) {
            return fail(
              controller.signal.aborted
                ? "cancelled"
                : stageFromError(error, "generate"),
              error,
            );
          }
        } finally {
          clearTimeout(watchdog);
          object?.release();
        }
      }),
    [access, mediaId],
  );

  /**
   * Downloads only the pre-rendered poster JPEG — no video download, no native
   * frame extraction. Uses its own child controller so a poster-local timeout
   * (or any non-cancellation poster failure) leaves the outer `controller` (the
   * cache entry's controller, shared with the legacy fallback below) untouched;
   * only a real external cancel of `outerController` propagates down.
   */
  const posterJob = useCallback(
    (outerController: AbortController) => {
      const posterId = posterMediaId;
      if (typeof posterId !== "string")
        return Promise.reject(new Error("thumbnail_cancelled"));
      return enqueueVideoThumbnail(outerController.signal, async () => {
        const localController = new AbortController();
        const forwardAbort = () => localController.abort();
        if (outerController.signal.aborted) localController.abort();
        else
          outerController.signal.addEventListener("abort", forwardAbort, {
            once: true,
          });
        let timedOut = false;
        const watchdog = setTimeout(() => {
          timedOut = true;
          localController.abort();
        }, WATCHDOG_MS);
        const fail = (error: unknown): never => {
          if (!outerController.signal.aborted) {
            thumbnailLogger.log("media.video-thumbnail.failed", "warn", {
              mediaId,
              stage: "poster",
              code: timedOut ? "watchdog" : codeFromPosterError(error),
            });
          }
          throw error;
        };
        try {
          const mediaAccess = access;
          if (!mediaAccess) throw new Error("thumbnail_cancelled");
          let media: Awaited<ReturnType<typeof mediaAccess.getAccessUrl>>;
          try {
            media = await mediaAccess.getAccessUrl(
              posterId,
              localController.signal,
            );
          } catch (error) {
            return fail(error);
          }
          if (localController.signal.aborted)
            return fail(new Error("thumbnail_cancelled"));
          if (
            media.id !== posterId ||
            media.contentType !== "image/jpeg" ||
            !Number.isSafeInteger(media.byteSize) ||
            media.byteSize <= 0 ||
            media.byteSize > MAX_POSTER_BYTES
          ) {
            return fail(new Error("invalid_poster_metadata"));
          }
          const destination = allocateDownloadDestination({
            mediaId: posterId,
            filename: "poster.jpg",
          });
          try {
            await downloadToFile({
              url: media.url,
              destination,
              expectedBytes: media.byteSize,
              maxBytes: MAX_POSTER_BYTES,
              signal: localController.signal,
            });
          } catch (error) {
            removeDownloadedFile(destination.uri);
            return fail(error);
          }
          if (localController.signal.aborted) {
            removeDownloadedFile(destination.uri);
            return fail(new Error("thumbnail_cancelled"));
          }
          return destination.uri;
        } finally {
          clearTimeout(watchdog);
          outerController.signal.removeEventListener("abort", forwardAbort);
        }
      });
    },
    [access, mediaId, posterMediaId],
  );

  // When a posterMediaId is present the poster download is tried first; any
  // non-cancellation failure (including a poster-local timeout) falls back to
  // the legacy frame-extraction pipeline exactly once, on the same (still-live)
  // outer controller. A real cancel of `controller` itself (unmount, account
  // invalidation, retry) skips the fallback — there is no point starting the
  // legacy pipeline on a controller that is already dead.
  const job = useCallback(
    (controller: AbortController) => {
      if (typeof posterMediaId !== "string") return legacyJob(controller);
      return posterJob(controller).catch((error: unknown) => {
        if (controller.signal.aborted) throw error;
        return legacyJob(controller);
      });
    },
    [posterMediaId, posterJob, legacyJob],
  );

  // Declared before useFocusEffect so its cleanup (only fired at true unmount, empty
  // deps) runs first during unmount and the focus effect's own cleanup below already
  // observes `mountedRef.current === false`.
  useEffect(
    () => () => {
      mountedRef.current = false;
    },
    [],
  );

  useFocusEffect(
    useCallback(() => {
      if (!enabled || !access || !runtime || !runtime.isCurrent(generation))
        return;
      const accountKey = runtime.accountKey;
      const current = () => runtime.isCurrent(generation);
      const acquired = acquireThumbnail(accountKey, thumbnailKey, job);
      if (acquired.state.status !== "loading") {
        setLoaded({ key, state: acquired.state });
      } else {
        setLoaded((previous) =>
          previous?.key === key
            ? previous
            : { key, state: { status: "loading" } },
        );
        acquired.promise
          ?.then((uri) => {
            if (current()) setLoaded({ key, state: { status: "ready", uri } });
          })
          .catch(() => {
            if (current()) setLoaded({ key, state: { status: "error" } });
          });
      }
      const unsubscribe = runtime.subscribeInvalidation(() => {
        invalidateThumbnailCache(accountKey);
        invalidateMediaObjectCache();
        setLoaded((previous) => (previous?.key === key ? null : previous));
      });
      return () => {
        unsubscribe();
        // Grace only applies when the *latest* render already has `enabled: false`
        // while the component is still mounted (a card scrolled off-screen). A true
        // unmount, or a cleanup while `enabled` is still true (blur/identity change),
        // cancels immediately — matching the pre-existing synchronous-cancel contract.
        const graceEligible = mountedRef.current && !latestEnabledRef.current;
        acquired.release(!graceEligible);
      };
    }, [enabled, runtime, access, generation, thumbnailKey, key, job]),
  );

  const available =
    enabled && !!runtime && !!access && runtime.isCurrent(generation);
  return {
    state: available
      ? loaded?.key === key
        ? loaded.state
        : ({ status: "loading" } as const)
      : null,
    retry: () => {
      if (runtime && retryThumbnail(runtime.accountKey, thumbnailKey)) {
        setLoaded((previous) => (previous?.key === key ? null : previous));
        setNonce((value) => value + 1);
      }
    },
    canRetry: runtime
      ? canRetryThumbnail(runtime.accountKey, thumbnailKey)
      : false,
    imageFailed: () => {
      if (loaded?.key !== key || loaded.state.status !== "ready") return;
      if (runtime) markThumbnailImageFailed(runtime.accountKey, thumbnailKey);
      setLoaded((previous) =>
        previous?.key === key ? { key, state: { status: "error" } } : previous,
      );
    },
  };
}
