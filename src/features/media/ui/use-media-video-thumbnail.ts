import { useCallback, useState } from "react";
import { useFocusEffect } from "expo-router";
import { useMediaRuntime, useMediaGeneration } from "../model/media-runtime";
import { useMediaAccess } from "../model/use-media-access";
import { MAX_VIDEO_BYTES } from "../model/media-policy";
import { enqueueVideoThumbnail } from "../model/video-thumbnail-queue";
import {
  allocateDownloadDestination,
  removeDownloadedFile,
} from "../platform/media-downloads";
import { downloadToFile } from "../platform/media-object-transfer";
import { createNativeVideoThumbnail } from "../platform/native-video-thumbnail";

type ThumbnailState =
  | { status: "loading" }
  | { status: "ready"; uri: string }
  | { status: "error" };

export function useMediaVideoThumbnail(mediaId: string, enabled: boolean) {
  const runtime = useMediaRuntime();
  const access = useMediaAccess();
  const generation = useMediaGeneration(runtime);
  const [attempt, setAttempt] = useState(0);
  const key = `${runtime?.accountKey}:${generation}:${mediaId}:${attempt}`;
  const [loaded, setLoaded] = useState<{
    key: string;
    state: ThumbnailState;
  } | null>(null);
  useFocusEffect(
    useCallback(() => {
      if (!enabled || !access || !runtime || !runtime.isCurrent(generation))
        return;
      const controller = new AbortController();
      const { signal } = controller;
      let video: string | undefined;
      let thumbnail: string | undefined;
      const current = () => !signal.aborted && runtime.isCurrent(generation);
      const cancel = () => {
        controller.abort();
        if (video) removeDownloadedFile(video);
        if (thumbnail) removeDownloadedFile(thumbnail);
        setLoaded((previous) => (previous?.key === key ? null : previous));
      };
      const unsubscribe = runtime.subscribeInvalidation(cancel);
      const timeout = setTimeout(() => {
        if (!current()) return;
        cancel();
        setLoaded({ key, state: { status: "error" } });
      }, 120_000);
      void enqueueVideoThumbnail(signal, async () => {
        try {
          if (!current()) return;
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
          const destination = allocateDownloadDestination({
            mediaId,
            filename: "preview-source.mp4",
          });
          video = destination.uri;
          await downloadToFile({
            url: media.url,
            destination,
            expectedBytes: media.byteSize,
            maxBytes: MAX_VIDEO_BYTES,
            signal,
          });
          if (!current()) return;
          thumbnail = await createNativeVideoThumbnail(video, signal);
          if (current())
            setLoaded({ key, state: { status: "ready", uri: thumbnail } });
          else removeDownloadedFile(thumbnail);
        } finally {
          if (video) removeDownloadedFile(video);
        }
      })
        .catch(() => {
          if (current()) setLoaded({ key, state: { status: "error" } });
        })
        .finally(() => clearTimeout(timeout));
      return () => {
        clearTimeout(timeout);
        unsubscribe();
        cancel();
      };
    }, [enabled, runtime, access, generation, mediaId, key]),
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
      if (attempt < 1) setAttempt((value) => value + 1);
    },
    canRetry: attempt < 1,
    imageFailed: () => {
      if (loaded?.key !== key || loaded.state.status !== "ready") return;
      removeDownloadedFile(loaded.state.uri);
      setLoaded((previous) =>
        previous?.key === key ? { key, state: { status: "error" } } : previous,
      );
    },
  };
}
