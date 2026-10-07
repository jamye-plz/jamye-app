import { Directory, File, Paths } from "expo-file-system";
import * as ImagePicker from "expo-image-picker";

import { AVATAR_MAX_BYTES } from "@/core/contracts/server";
import {
  removeStagedFile,
  stageOwnedCopy,
} from "@/features/media/platform/media-staging";
import {
  renderJpeg,
  type RenderedJpeg,
} from "@/features/media/platform/native-image-manipulator";

/** Avatar edge length in pixels (B2: the app uploads a 512px JPEG). */
export const AVATAR_EDGE_PX = 512;
/** JPEG quality for the re-encode (re-encoding also strips EXIF/location). */
export const AVATAR_JPEG_QUALITY = 0.85;

export type StagedAvatarFile = Readonly<{ uri: string; byteSize: number }>;

export type AvatarPhotoSelection =
  | Readonly<{
      status: "ready";
      /** App-owned staged 512px JPEG, <= 1 MiB; call `release` when done. */
      file: StagedAvatarFile;
      release: () => void;
    }>
  | Readonly<{ status: "cancelled" }>
  | Readonly<{ status: "permission_denied"; canAskAgain: boolean }>
  | Readonly<{ status: "too_large"; byteSize: number }>
  | Readonly<{ status: "failed" }>;

type PickedImage = Readonly<{ uri: string; width: number; height: number }>;

function cacheChildUri(directoryName: string, uri: string): string | null {
  const prefix = new Directory(Paths.cache, directoryName).uri.replace(
    /\/?$/,
    "/",
  );
  if (!uri.startsWith(prefix)) return null;
  const name = uri.slice(prefix.length);
  if (!name || /[/\\%?#]/.test(name) || name === "." || name === "..")
    return null;
  return uri;
}

/** Deletes a temp file this module's pipeline created. A picked file outside
 * the picker's own cache directory (a library original) is never deleted. */
function deleteCacheTemp(directoryName: string, uri: string | null): void {
  if (uri === null) return;
  try {
    const owned = cacheChildUri(directoryName, uri);
    if (owned === null) return;
    const file = new File(owned);
    if (file.exists) file.delete();
  } catch {
    // The OS may already have reclaimed its cache; cleanup is best effort.
  }
}

function isPermissionFailure(error: unknown): boolean {
  const code =
    typeof error === "object" && error !== null && "code" in error
      ? (error as { code?: unknown }).code
      : undefined;
  return typeof code !== "string" || /PERMISSION/i.test(code);
}

async function pickCroppedImage(): Promise<
  | Readonly<{ status: "picked"; image: PickedImage }>
  | Exclude<
      AvatarPhotoSelection,
      Readonly<{ status: "ready" }> | Readonly<{ status: "too_large" }>
    >
> {
  let result: ImagePicker.ImagePickerResult;
  try {
    // One image, with the system 1:1 editor (iOS crop sheet / Android crop UI).
    result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images"],
      allowsEditing: true,
      aspect: [1, 1],
      allowsMultipleSelection: false,
      exif: false,
      quality: 1,
    });
  } catch (error) {
    if (!isPermissionFailure(error)) return { status: "failed" };
    try {
      const permission = await ImagePicker.getMediaLibraryPermissionsAsync();
      if (!permission.granted)
        return {
          status: "permission_denied",
          canAskAgain: permission.canAskAgain,
        };
    } catch {
      // Fall through to the generic failure.
    }
    return { status: "failed" };
  }
  const asset = result.canceled ? undefined : result.assets?.[0];
  if (!asset) return { status: "cancelled" };
  return {
    status: "picked",
    image: { uri: asset.uri, width: asset.width, height: asset.height },
  };
}

/**
 * AV-AC2: pick one image with the system 1:1 editor, always center-crop it to
 * a square (iOS ignores `aspect`, and an Android editor may return a
 * non-square), re-encode it to a 512px JPEG at q0.85 (this strips EXIF),
 * reject anything over 1 MiB and stage the result in the app-owned media
 * staging directory the native PUT reads from. Every temp file this pipeline
 * creates (the picker's cached crop and the manipulator output) is deleted on
 * every path; only the staged copy survives a `ready` result, and `release`
 * removes it. Never throws: failures are returned as statuses.
 */
export async function pickAvatarPhoto(): Promise<AvatarPhotoSelection> {
  const picked = await pickCroppedImage();
  if (picked.status !== "picked") return picked;
  const { image } = picked;

  let outputUri: string | null = null;
  let rendered: RenderedJpeg | undefined;
  try {
    const { width, height } = image;
    if (
      !Number.isFinite(width) ||
      !Number.isFinite(height) ||
      width < 1 ||
      height < 1
    )
      return { status: "failed" };

    const side = Math.floor(Math.min(width, height));
    rendered = await renderJpeg(image.uri, {
      compress: AVATAR_JPEG_QUALITY,
      transform: (context) => {
        const cropped = context.crop({
          originX: Math.floor((width - side) / 2),
          originY: Math.floor((height - side) / 2),
          width: side,
          height: side,
        });
        // Never upscale a small photo.
        return side > AVATAR_EDGE_PX
          ? cropped.resize({ width: AVATAR_EDGE_PX })
          : cropped;
      },
    });
    const saved = rendered.result;
    outputUri = saved.uri;

    const output = new File(saved.uri);
    if (!output.exists || output.size <= 0) return { status: "failed" };
    const byteSize = output.size;
    if (byteSize > AVATAR_MAX_BYTES) return { status: "too_large", byteSize };

    const staged = await stageOwnedCopy({
      sourceUri: saved.uri,
      suggestedName: "avatar.jpg",
    });
    return {
      status: "ready",
      file: { uri: staged.uri, byteSize: staged.byteSize },
      release: () => removeStagedFile(staged.uri),
    };
  } catch {
    return { status: "failed" };
  } finally {
    // Native release errors are best effort: they must neither skip the
    // temp-file cleanup nor turn the result into a throw.
    try {
      rendered?.release();
    } catch {
      // Fall through to the remaining cleanup.
    }
    deleteCacheTemp("ImageManipulator", outputUri);
    deleteCacheTemp("ImagePicker", image.uri);
  }
}
