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

/** A frame reference stays native: no remote player source or JS/base64 image data. */
export async function createNativeVideoThumbnail(
  uri: string,
  signal: AbortSignal,
): Promise<string> {
  if (!uri.startsWith("file://") || !isOwnedDownloadFile(uri))
    throw new Error("invalid_thumbnail_source");
  const current = () => {
    if (signal.aborted) throw new Error("thumbnail_cancelled");
  };
  current();
  const api = loadNativeVideoApi();
  if (!api) throw new Error("thumbnail_unavailable");
  const releaseFile = retainDownloadedFile(uri);
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
    // SDK 57's TS union also admits a number, but its Swift/Kotlin bridges
    // require a timestamp array. Keep even a single requested frame in a list.
    frames = await player.generateThumbnailsAsync([0], {
      maxWidth: 320,
      maxHeight: 320,
    });
    current();
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
    destination = allocateDownloadDestination({
      mediaId: "video-preview",
      filename: "thumbnail.jpg",
    });
    // copy() is asynchronous on both platforms. Keep the generated JPEG alive
    // until copying settles; otherwise finally deletes the native input early.
    await output.copy(destination);
    current();
    return destination.uri;
  } catch {
    if (destination) removeDownloadedFile(destination.uri);
    throw new Error("thumbnail_unavailable");
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
