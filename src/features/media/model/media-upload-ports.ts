import type { MediaFileInput } from "./media-policy";

/**
 * Binary PUT to the presigned object URL is a distinct capability from
 * `MediaApi`'s bearer JSON calls: it is always a fresh, credential-free
 * request (no Authorization header, no cookies) and must stream from the
 * app-owned file rather than loading the whole selection into JS memory.
 * The native owner implements this with the local file-only PUT module;
 * this file only defines the port the controller depends on.
 */
export type MediaObjectPutPort = Readonly<{
  put: (
    input: Readonly<{
      url: string;
      file: MediaFileInput;
      signal: AbortSignal;
      onProgress?: (sentBytes: number, totalBytes: number) => void;
    }>,
  ) => Promise<Readonly<{ status: number }>>;
}>;

/** App-owned temporary files (e.g. copies of externally-picked selections)
 * are cleaned up through this port; it must never touch the original
 * user/provider file the picker returned. */
export type MediaFileCleanupPort = Readonly<{
  deleteIfExists: (uri: string) => Promise<void>;
}>;
