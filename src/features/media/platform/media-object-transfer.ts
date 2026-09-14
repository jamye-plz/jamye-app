import { fetch as expoFetch } from "expo/fetch";
import { File } from "expo-file-system";

import type { MediaObjectPutPort } from "@/features/media/model/media-upload-ports";
import { MAX_VIDEO_BYTES } from "@/features/media/model/media-policy";
import { isOwnedStagedFile } from "./media-staging";
import { isOwnedDownloadFile, removeDownloadedFile } from "./media-downloads";
import { putNativeFile } from "./native-file-put";

/**
 * Raw signed-URL object transfer, separate from `MediaHttpTransport` (core/data): MD1's
 * PUT and the MD5 object download never carry API bearer auth or cookies, are not JSON,
 * and — for video-sized payloads — must avoid whole-file JS buffers. PUT passes only
 * metadata to the local native module; GET retains the existing bounded stream.
 */

export class MediaObjectTransferError extends Error {
  constructor(
    readonly reason:
      "http_status" | "network" | "cancelled" | "invalid_file" | "size_limit",
  ) {
    super(reason);
  }
}

const TRANSFER_TIMEOUT_MS = 120_000;

function transferLifetime(parent?: AbortSignal) {
  const controller = new AbortController();
  const abort = () => controller.abort();
  if (parent?.aborted) abort();
  parent?.addEventListener("abort", abort, { once: true });
  const timer = setTimeout(abort, TRANSFER_TIMEOUT_MS);
  return {
    signal: controller.signal,
    close() {
      clearTimeout(timer);
      parent?.removeEventListener("abort", abort);
    },
  };
}

function checkSignal(signal: AbortSignal) {
  if (signal.aborted) throw new MediaObjectTransferError("cancelled");
}

/** Native file-backed upload. Report start/completion only, never invent intermediate
 * progress. Cookie, credential and redirect isolation are enforced natively. */
export function createNativeMediaObjectPutPort(): MediaObjectPutPort {
  return {
    async put({ url, file, signal, onProgress }) {
      if (!isOwnedStagedFile(file.uri))
        throw new MediaObjectTransferError("invalid_file");
      const source = new File(file.uri);
      if (
        !source.exists ||
        source.size !== file.byteSize ||
        source.size <= 0 ||
        source.size > MAX_VIDEO_BYTES
      )
        throw new MediaObjectTransferError("invalid_file");
      const lifetime = transferLifetime(signal);
      try {
        checkSignal(lifetime.signal);
        onProgress?.(0, file.byteSize);
        const result = await putNativeFile({
          url,
          uri: file.uri,
          contentType: file.contentType,
          byteSize: file.byteSize,
          signal: lifetime.signal,
        });
        checkSignal(lifetime.signal);
        if (result.status >= 200 && result.status < 300)
          onProgress?.(file.byteSize, file.byteSize);
        return { status: result.status };
      } catch (error) {
        if (error instanceof MediaObjectTransferError) throw error;
        throw new MediaObjectTransferError(
          lifetime.signal.aborted
            ? "cancelled"
            : (error as { code?: string })?.code === "ERR_FILE_PUT_INVALID_FILE"
              ? "invalid_file"
              : "network",
        );
      } finally {
        lifetime.close();
      }
    },
  };
}

/**
 * MD5's download step: a fresh, credential-free `expo/fetch` GET to the already-
 * captured Location, streamed directly into an app-owned destination file (never
 * loaded whole into JS memory, never through the legacy FileSystem download session).
 */
export async function downloadToFile(
  input: Readonly<{
    url: string;
    destination: File;
    signal?: AbortSignal;
    maxBytes?: number;
    expectedBytes?: number;
  }>,
): Promise<Readonly<{ byteSize: number }>> {
  if (!isOwnedDownloadFile(input.destination.uri))
    throw new MediaObjectTransferError("invalid_file");
  const limit = Math.min(input.maxBytes ?? MAX_VIDEO_BYTES, MAX_VIDEO_BYTES);
  if (
    !Number.isSafeInteger(limit) ||
    limit <= 0 ||
    (input.expectedBytes !== undefined &&
      (!Number.isSafeInteger(input.expectedBytes) ||
        input.expectedBytes <= 0 ||
        input.expectedBytes > limit))
  )
    throw new MediaObjectTransferError("size_limit");
  const lifetime = transferLifetime(input.signal);
  let reader: ReadableStreamDefaultReader<Uint8Array> | undefined;
  let writer: WritableStreamDefaultWriter<Uint8Array> | undefined;
  let completed = false;
  try {
    checkSignal(lifetime.signal);
    const response = await expoFetch(input.url, {
      method: "GET",
      credentials: "omit",
      redirect: "error",
      signal: lifetime.signal,
    });
    if (!response.ok || response.body === null) {
      await response.body?.cancel().catch(() => undefined);
      throw new MediaObjectTransferError("http_status");
    }
    reader = response.body.getReader();
    const advertised = response.headers.get("content-length");
    if (
      advertised !== null &&
      (!/^\d+$/.test(advertised) || Number(advertised) > limit)
    )
      throw new MediaObjectTransferError("size_limit");
    checkSignal(lifetime.signal);
    input.destination.create({ intermediates: true, overwrite: false });
    writer = input.destination.writableStream().getWriter();
    const cancelStream = () => {
      void reader?.cancel().catch(() => undefined);
    };
    lifetime.signal.addEventListener("abort", cancelStream, { once: true });
    let byteSize = 0;
    try {
      for (;;) {
        checkSignal(lifetime.signal);
        const chunk = await reader.read();
        checkSignal(lifetime.signal);
        if (chunk.done) break;
        byteSize += chunk.value.byteLength;
        if (byteSize > limit) throw new MediaObjectTransferError("size_limit");
        await writer.write(chunk.value);
      }
      if (
        byteSize <= 0 ||
        (input.expectedBytes !== undefined && byteSize !== input.expectedBytes)
      )
        throw new MediaObjectTransferError("size_limit");
      await writer.close();
      checkSignal(lifetime.signal);
      completed = true;
      return { byteSize };
    } finally {
      lifetime.signal.removeEventListener("abort", cancelStream);
    }
  } catch (error) {
    if (error instanceof MediaObjectTransferError) throw error;
    throw new MediaObjectTransferError(
      lifetime.signal.aborted ? "cancelled" : "network",
    );
  } finally {
    if (!completed) {
      await reader?.cancel().catch(() => undefined);
      await writer?.abort().catch(() => undefined);
      removeDownloadedFile(input.destination.uri);
    }
    reader?.releaseLock();
    writer?.releaseLock();
    lifetime.close();
  }
}
