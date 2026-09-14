import { requireNativeModule } from "expo";
import { Directory, File, Paths } from "expo-file-system";
import type { ImageRef, SaveFormat } from "expo-image-manipulator";

import type { PickedMediaAsset } from "./image-video-picker";
import { MAX_VIDEO_BYTES } from "@/features/media/model/media-policy";

// Input formats the OS may decode; these are NOT additions to the server allowlist.
const CONVERTIBLE_IMAGES = new Set([
  "image/heic",
  "image/heif",
  "image/avif",
  "image/tiff",
  "image/bmp",
  "image/x-ms-bmp",
  "image/jpg",
]);

export type NormalizedPickedImage = Readonly<{
  asset: PickedMediaAsset;
  release?: () => void;
}>;

function convertedFile(uri: string, sourceUri: string): File {
  const directory = new Directory(Paths.cache, "ImageManipulator");
  const prefix = directory.uri.replace(/\/?$/, "/");
  const name = uri.slice(prefix.length);
  if (
    uri === sourceUri ||
    !uri.startsWith(prefix) ||
    !/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}\.jpe?g$/i.test(name)
  )
    throw new Error("invalid_conversion_destination");
  return new File(uri);
}

function releaseFile(file: File): void {
  try {
    if (file.exists) file.delete();
  } catch {
    // OS-owned cache may already have been reclaimed; never touch the source.
  }
}

function jpegSize(file: File): number {
  if (!file.exists || file.size <= 0) throw new Error("empty_converted_image");
  const handle = file.open();
  try {
    const header = handle.readBytes(3);
    if (header[0] !== 0xff || header[1] !== 0xd8 || header[2] !== 0xff)
      throw new Error("invalid_converted_jpeg");
  } finally {
    handle.close();
  }
  return file.size;
}

/** Decode/encode on native threads, never copy whole images into JS/base64.
 * Supported JPEG/PNG/WebP/GIF (including animation) and video pass through.
 * The caller validates the OUTPUT against the server policy, then releases it
 * after staging, rejection, or a stale account/screen result.
 */
export async function normalizePickedImage(
  asset: PickedMediaAsset,
): Promise<NormalizedPickedImage> {
  const mime = (asset.mimeType ?? "").toLowerCase();
  const missingMimeWithImageName =
    (!mime || mime === "application/octet-stream") &&
    /\.(heic|heif|avif|tiff?|bmp)$/i.test(asset.fileName ?? asset.uri);
  if (!CONVERTIBLE_IMAGES.has(mime) && !missingMimeWithImageName)
    return { asset };
  if (!/^(file|content):\/\//.test(asset.uri))
    throw new Error("conversion_requires_local_file");
  const source = new File(asset.uri);
  if (!source.exists || source.size <= 0 || source.size > MAX_VIDEO_BYTES)
    throw new Error("invalid_conversion_input_size");

  // Lazy loading keeps existing supported-file flows usable until a dev build
  // has been rebuilt with this native dependency. No network fallback exists.
  // Same native entry point as Expo's public JS wrapper, loaded on demand like
  // native-file-put.ts. Types stay tied to the pinned SDK package.
  const native = requireNativeModule<
    typeof import("expo-image-manipulator").ImageManipulator
  >("ExpoImageManipulator");
  const context = native.manipulate(asset.uri);
  let image: ImageRef | undefined;
  let output: File | undefined;
  try {
    image = await context.renderAsync();
    const result = await image.saveAsync({
      format: "jpeg" as SaveFormat,
      compress: 0.9,
      base64: false,
    });
    output = convertedFile(result.uri, asset.uri);
    const fileSize = jpegSize(output);
    const filename = (asset.fileName ?? "image").replace(/\.[^.]+$/, "");
    const ownedOutput = output;
    return {
      asset: {
        ...asset,
        uri: result.uri,
        mimeType: "image/jpeg",
        fileName: `${filename}.jpg`,
        fileSize,
        width: result.width,
        height: result.height,
        durationMs: null,
      },
      release: () => releaseFile(ownedOutput),
    };
  } catch (error) {
    if (output) releaseFile(output);
    throw error;
  } finally {
    try {
      image?.release();
    } finally {
      context.release();
    }
  }
}
