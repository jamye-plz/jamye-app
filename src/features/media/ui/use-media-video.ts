import { useCallback, useRef, useState } from "react";
import { useFocusEffect } from "expo-router";
import { MAX_VIDEO_BYTES } from "@/features/media/model/media-policy";
import { useMediaAccess } from "@/features/media/model/use-media-access";
import {
  useMediaGeneration,
  useMediaRuntime,
} from "@/features/media/model/media-runtime";
import {
  allocateDownloadDestination,
  removeDownloadedFile,
} from "@/features/media/platform/media-downloads";
import {
  acquireMediaObject,
  invalidateMediaObjectCache,
} from "@/features/media/platform/media-object-cache";
import { downloadToFile } from "@/features/media/platform/media-object-transfer";

type VideoState =
  | { status: "idle" }
  | { status: "downloading" }
  | { status: "ready"; uri: string }
  | { status: "error"; message: string };
type MediaObjectHandle = Readonly<{
  uri: Promise<string>;
  release: (immediate?: boolean) => void;
}>;
type Operation = {
  controller: AbortController;
  object: MediaObjectHandle | null;
};

/** Download only on explicit play. Native playback never receives a remote URL. Shares
 * its downloaded file with the preview thumbnail through `media-object-cache`. */
export function useMediaVideo(mediaId: string) {
  const runtime = useMediaRuntime();
  const access = useMediaAccess();
  const generation = useMediaGeneration(runtime);
  const key = `${runtime?.accountKey}:${generation}:${mediaId}`;
  const focused = useRef<string | null>(null);
  const operation = useRef<Operation | null>(null);
  const [result, setResult] = useState<{
    key: string;
    state: VideoState;
  } | null>(null);
  const cancel = useCallback(() => {
    const previous = operation.current;
    operation.current = null;
    previous?.controller.abort();
    // Playback releases eagerly: closing/backgrounding should not hold a file for the
    // preview retention window once the user has explicitly stopped watching it.
    previous?.object?.release(true);
  }, []);
  const close = useCallback(() => {
    cancel();
    setResult(null);
  }, [cancel]);

  useFocusEffect(
    useCallback(() => {
      focused.current = key;
      const unsubscribe = runtime?.subscribeInvalidation(() => {
        // Belt-and-suspenders: the thumbnail cache's own invalidation handler also
        // clears the shared object cache, but playback must not depend on a preview
        // card being mounted to have it cleaned up on account switch/logout.
        invalidateMediaObjectCache();
        close();
      });
      return () => {
        focused.current = null;
        unsubscribe?.();
        close();
      };
    }, [runtime, key, close]),
  );

  const open = useCallback(async () => {
    if (
      !access ||
      !runtime ||
      focused.current !== key ||
      !runtime.isCurrent(generation) ||
      operation.current
    )
      return;
    const currentOperation: Operation = {
      controller: new AbortController(),
      object: null,
    };
    operation.current = currentOperation;
    const { signal } = currentOperation.controller;
    const current = () =>
      focused.current === key &&
      !signal.aborted &&
      operation.current === currentOperation &&
      runtime.isCurrent(generation);
    setResult({ key, state: { status: "downloading" } });
    try {
      const media = await access.getAccessUrl(mediaId, signal);
      if (!current()) return;
      if (
        media.id !== mediaId ||
        media.contentType !== "video/mp4" ||
        !Number.isSafeInteger(media.byteSize) ||
        media.byteSize <= 0 ||
        media.byteSize > MAX_VIDEO_BYTES
      )
        throw new Error("invalid_video_metadata");
      const object = acquireMediaObject(mediaId, async (objectSignal) => {
        const destination = allocateDownloadDestination({
          mediaId,
          filename: "video.mp4",
        });
        try {
          await downloadToFile({
            url: media.url,
            destination,
            expectedBytes: media.byteSize,
            maxBytes: MAX_VIDEO_BYTES,
            signal: objectSignal,
          });
          return destination.uri;
        } catch (error) {
          removeDownloadedFile(destination.uri);
          throw error;
        }
      });
      currentOperation.object = object;
      const uri = await object.uri;
      if (current()) setResult({ key, state: { status: "ready", uri } });
    } catch {
      if (current()) {
        cancel();
        setResult({
          key,
          state: {
            status: "error",
            message: "동영상을 불러오지 못했습니다. 다시 시도해 주세요.",
          },
        });
      }
    } finally {
      if (!current()) currentOperation.object?.release(true);
    }
  }, [access, runtime, generation, key, mediaId, cancel]);

  const playbackFailed = useCallback(
    (reason: "unavailable" | "playback") => {
      if (focused.current !== key || !runtime?.isCurrent(generation)) return;
      cancel();
      setResult({
        key,
        state: {
          status: "error",
          message:
            reason === "unavailable"
              ? "영상 재생 모듈이 없습니다. 새 네이티브 빌드를 설치해 주세요."
              : "동영상을 재생하지 못했습니다. 다시 시도하거나 열기·저장을 이용해 주세요.",
        },
      });
    },
    [cancel, runtime, generation, key],
  );

  const state: VideoState =
    result?.key === key ? result.state : { status: "idle" };
  return {
    state,
    available: !!runtime && !!access && runtime.isCurrent(generation),
    open,
    close,
    playbackFailed,
  };
}
