import * as ImagePicker from "expo-image-picker";
import { Directory, File, Paths } from "expo-file-system";
import { Platform } from "react-native";
import { normalizePickedImage } from "./media-image-normalizer";

export type PickedMediaAsset = Readonly<{
  uri: string;
  mimeType: string | null;
  fileName: string | null;
  fileSize: number | null;
  width: number;
  height: number;
  durationMs: number | null;
}>;

export type PickImageOrVideoResult =
  | Readonly<{
      status: "picked";
      asset: PickedMediaAsset;
      release?: () => void;
    }>
  | Readonly<{ status: "cancelled" }>
  | Readonly<{ status: "permission_denied"; canAskAgain: boolean }>;

/** Only a NEW iOS native MP4 export is disposable, never a library original. */
function videoExportRelease(uri: string): () => void {
  const prefix = new Directory(Paths.cache, "ImagePicker").uri.replace(
    /\/?$/,
    "/",
  );
  if (
    !uri.startsWith(prefix) ||
    !/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}\.mp4$/i.test(
      uri.slice(prefix.length),
    )
  )
    throw new Error("invalid_video_export_destination");
  return () => {
    try {
      const file = new File(uri);
      if (file.exists) file.delete();
    } catch {
      // Cache reclamation can race cleanup; never delete outside this export.
    }
  };
}

/**
 * iOS exports H.264/AAC MP4 (up to 1080p) and asks for compatible images.
 * HEIC may still be returned by the picker, so normalize it explicitly below.
 * Android keeps its system picker. Neither asks for blanket library permission.
 */
export async function pickImageOrVideo(
  imagesOnly = false,
): Promise<PickImageOrVideoResult> {
  let result: ImagePicker.ImagePickerResult;
  try {
    result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: imagesOnly ? ["images"] : ["images", "videos"],
      allowsMultipleSelection: false,
      allowsEditing: false,
      preferredAssetRepresentationMode:
        Platform.OS === "ios"
          ? ImagePicker.UIImagePickerPreferredAssetRepresentationMode.Compatible
          : ImagePicker.UIImagePickerPreferredAssetRepresentationMode.Current,
      videoExportPreset:
        Platform.OS === "ios"
          ? ImagePicker.VideoExportPreset.H264_1920x1080
          : ImagePicker.VideoExportPreset.Passthrough,
      shouldDownloadFromNetwork: false,
    });
  } catch (error) {
    // Transcode/export errors do not imply photo-library permission denial.
    if (
      typeof error === "object" &&
      error !== null &&
      "code" in error &&
      typeof error.code === "string" &&
      !/PERMISSION/i.test(error.code)
    )
      throw error;
    const permission = await ImagePicker.getMediaLibraryPermissionsAsync();
    if (!permission.granted)
      return {
        status: "permission_denied",
        canAskAgain: permission.canAskAgain,
      };
    throw error;
  }
  if (result.canceled || result.assets.length === 0)
    return { status: "cancelled" };

  const picked = result.assets[0]!;
  const release =
    Platform.OS === "ios" && picked.type === "video"
      ? videoExportRelease(picked.uri)
      : undefined;
  const normalized = await normalizePickedImage({
    uri: picked.uri,
    mimeType: picked.mimeType ?? null,
    fileName: picked.fileName ?? null,
    fileSize: picked.fileSize ?? null,
    width: picked.width,
    height: picked.height,
    durationMs: picked.duration ?? null,
  });
  return {
    status: "picked",
    ...normalized,
    release: normalized.release ?? release,
  };
}
