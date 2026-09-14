import * as Sharing from "expo-sharing";
import { retainDownloadedFile } from "./media-downloads";

export type ShareLocalFileResult =
  | Readonly<{ status: "shared" }>
  | Readonly<{ status: "unavailable" }>
  | Readonly<{ status: "cancelled" }>;

/**
 * Hands a local, already-downloaded file to the OS share/save sheet. This remains
 * the save/external-open action; native video playback has a separate local-file
 * owner and does not rely on share-sheet completion.
 */
export async function shareOrSaveLocalFile(
  uri: string,
  mimeType: string | null,
  signal?: AbortSignal,
): Promise<ShareLocalFileResult> {
  if (signal?.aborted) return { status: "cancelled" };
  const release = retainDownloadedFile(uri);
  try {
    const available = await Sharing.isAvailableAsync();
    if (signal?.aborted) return { status: "cancelled" };
    if (!available) return { status: "unavailable" };
    await Sharing.shareAsync(uri, {
      dialogTitle: "미디어 열기 또는 저장",
      ...(mimeType ? { mimeType } : {}),
    });
    return { status: "shared" };
  } catch (error) {
    if (error instanceof Error && /cancel/i.test(error.message))
      return { status: "cancelled" };
    throw error;
  } finally {
    release();
  }
}
