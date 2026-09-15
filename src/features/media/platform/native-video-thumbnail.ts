import { requireNativeModule } from "expo";
import { Directory, File, Paths } from "expo-file-system";
import type {
  ImageManipulatorContext,
  ImageRef,
  SaveFormat,
} from "expo-image-manipulator";
import type { VideoPlayer, VideoThumbnail } from "expo-video";
import { loadNativeVideoApi } from "./native-video-player";
import {
  allocateDownloadDestination,
  isOwnedDownloadFile,
  removeDownloadedFile,
  retainDownloadedFile,
} from "./media-downloads";
import {
  allocateStagingDestination,
  isOwnedStagedFile,
  removeStagedFile,
  retainStagedFile,
} from "./media-staging";

export type ThumbnailFailureStage =
  "access" | "download" | "generate" | "copy" | "timeout" | "cancelled";

/** Seconds to request a frame at: first attempt, then a bounded fallback attempt. */
const FRAME_ATTEMPT_SECONDS = [0.5, 1.5] as const;

const KNOWN_FAILURES: Record<
  string,
  { stage: ThumbnailFailureStage; code: string }
> = {
  thumbnail_cancelled: { stage: "cancelled", code: "aborted" },
  missing_thumbnail_frame: { stage: "generate", code: "frame_unavailable" },
  invalid_thumbnail_output: { stage: "copy", code: "invalid_output" },
  invalid_thumbnail_size: { stage: "copy", code: "invalid_size" },
};

function failureError(stage: ThumbnailFailureStage, code: string): Error {
  return new Error(`thumbnail_unavailable:${stage}:${code}`);
}

/** Wraps any thrown reason into the `thumbnail_unavailable:<stage>:<code>` contract so
 * callers can recover the real failure point without inspecting native error text. */
function toThumbnailFailure(error: unknown): Error {
  const message = error instanceof Error ? error.message : "";
  if (message.startsWith("thumbnail_unavailable:")) return error as Error;
  const known = KNOWN_FAILURES[message];
  if (known) return failureError(known.stage, known.code);
  return failureError("copy", "unknown");
}

function boundedSeconds(seconds: number, duration: number | undefined): number {
  if (
    typeof duration === "number" &&
    Number.isFinite(duration) &&
    duration > 0
  ) {
    return Math.min(seconds, duration);
  }
  return seconds;
}

/**
 * Requests a frame at 0.5s first; if generation throws or returns no frame, retries
 * once at 1.5s (bounded by the player's known duration). Only fails after both.
 */
async function generateFrame(
  player: VideoPlayer,
  current: () => void,
): Promise<VideoThumbnail[]> {
  const duration =
    typeof player.duration === "number" ? player.duration : undefined;
  let lastError: unknown = new Error("missing_thumbnail_frame");
  for (const seconds of FRAME_ATTEMPT_SECONDS) {
    current();
    try {
      const generated = await player.generateThumbnailsAsync(
        [boundedSeconds(seconds, duration)],
        { maxWidth: 320, maxHeight: 320 },
      );
      current();
      if (generated[0]) return generated;
      lastError = new Error("missing_thumbnail_frame");
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError;
}

/** A frame reference stays native: no remote player source or JS/base64 image data. */
export async function createNativeVideoThumbnail(
  uri: string,
  signal: AbortSignal,
  options?: Readonly<{ destination?: "downloads" | "staging" }>,
): Promise<string> {
  const fromDownload = isOwnedDownloadFile(uri);
  const fromStaging = !fromDownload && isOwnedStagedFile(uri);
  if (!uri.startsWith("file://") || (!fromDownload && !fromStaging))
    throw new Error("invalid_thumbnail_source");
  const current = () => {
    if (signal.aborted) throw new Error("thumbnail_cancelled");
  };
  current();
  const api = loadNativeVideoApi();
  if (!api) throw failureError("generate", "native_unavailable");
  const releaseFile = fromDownload
    ? retainDownloadedFile(uri)
    : retainStagedFile(uri);
  const toStaging = options?.destination === "staging";
  let player: VideoPlayer | undefined;
  let frames: VideoThumbnail[] = [];
  let context: ImageManipulatorContext | undefined;
  let image: ImageRef | undefined;
  let output: File | undefined;
  let destination: File | undefined;
  try {
    player = api.createVideoPlayer(null);
    player.muted = true;
    player.allowsExternalPlayback = false;
    player.staysActiveInBackground = false;
    player.showNowPlayingNotification = false;
    player.audioMixingMode = "mixWithOthers";
    await player.replaceAsync({ uri, useCaching: false });
    current();
    frames = await generateFrame(player, current);
    if (!frames[0]) throw new Error("missing_thumbnail_frame");
    const native = requireNativeModule<
      typeof import("expo-image-manipulator").ImageManipulator
    >("ExpoImageManipulator");
    context = native.manipulate(frames[0]);
    image = await context.renderAsync();
    current();
    const result = await image.saveAsync({
      format: "jpeg" as SaveFormat,
      compress: 0.8,
      base64: false,
    });
    // Only the native manipulator's UUID-named cache output may be removed.
    const prefix = new Directory(Paths.cache, "ImageManipulator").uri.replace(
      /\/?$/,
      "/",
    );
    if (
      !result.uri.startsWith(prefix) ||
      !/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}\.jpe?g$/i.test(
        result.uri.slice(prefix.length),
      )
    )
      throw new Error("invalid_thumbnail_output");
    output = new File(result.uri);
    current();
    if (!output.exists || output.size <= 0 || output.size > 1_048_576)
      throw new Error("invalid_thumbnail_size");
    destination = toStaging
      ? allocateStagingDestination({ filename: "thumbnail.jpg" })
      : allocateDownloadDestination({
          mediaId: "video-preview",
          filename: "thumbnail.jpg",
        });
    // copy() is asynchronous on both platforms. Keep the generated JPEG alive
    // until copying settles; otherwise finally deletes the native input early.
    await output.copy(destination);
    current();
    return destination.uri;
  } catch (error) {
    if (destination) {
      if (toStaging) removeStagedFile(destination.uri);
      else removeDownloadedFile(destination.uri);
    }
    throw toThumbnailFailure(error);
  } finally {
    for (const cleanup of [
      () => image?.release(),
      () => context?.release(),
      ...frames.map((frame) => () => frame.release()),
      () => player?.release(),
      releaseFile,
      () => {
        if (output?.exists) output.delete();
      },
    ]) {
      try {
        cleanup();
      } catch {
        /* Continue releasing other native/file owners. */
      }
    }
  }
}
