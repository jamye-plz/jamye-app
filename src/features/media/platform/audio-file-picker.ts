import * as DocumentPicker from "expo-document-picker";

import { AUDIO_MIME_TYPES } from "./media-policy";

export type PickedAudioAsset = Readonly<{
  uri: string;
  mimeType: string | null;
  fileName: string | null;
  fileSize: number | null;
}>;

export type PickAudioResult =
  | Readonly<{ status: "picked"; asset: PickedAudioAsset }>
  | Readonly<{ status: "cancelled" }>;

/**
 * Opens the system document picker filtered to the supported audio MIME types. The
 * document picker is OS-mediated and does not require a microphone or library
 * permission grant.
 */
export async function pickAudioFile(): Promise<PickAudioResult> {
  const result = await DocumentPicker.getDocumentAsync({
    type: [...AUDIO_MIME_TYPES],
    copyToCacheDirectory: true,
    multiple: false,
  });
  if (result.canceled || result.assets.length === 0)
    return { status: "cancelled" };

  const picked = result.assets[0]!;
  return {
    status: "picked",
    asset: {
      uri: picked.uri,
      mimeType: picked.mimeType ?? null,
      fileName: picked.name,
      fileSize: picked.size ?? null,
    },
  };
}
