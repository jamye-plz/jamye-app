import type { MediaApi } from "@/features/media/data/media-api";
import { MediaApiError } from "@/features/media/data/media-api";
import type {
  MediaScope,
  UploadFinalizeResult,
} from "@/core/contracts/server/media";

import type { MediaFileInput } from "./media-policy";
import {
  evaluateMediaContentPolicy,
  isAuthoritativeAudioDuration,
} from "./media-policy";
import type {
  MediaFileCleanupPort,
  MediaObjectPutPort,
} from "./media-upload-ports";

export type MediaUploadGeneration = string;

export type MediaUploadFailure = Readonly<{ status: number; code: string }>;

export type MediaUploadState =
  | Readonly<{ status: "requesting_intent"; draftId: string }>
  | Readonly<{
      status: "uploading";
      draftId: string;
      sentBytes: number;
      totalBytes: number;
    }>
  | Readonly<{ status: "finalizing"; draftId: string }>
  | Readonly<{
      status: "confirmed";
      draftId: string;
      result: UploadFinalizeResult;
    }>
  | Readonly<{
      status: "intent_failed";
      draftId: string;
      error: MediaUploadFailure;
    }>
  | Readonly<{
      status: "put_failed";
      draftId: string;
      error: MediaUploadFailure;
    }>
  | Readonly<{
      status: "put_expired";
      draftId: string;
      error: MediaUploadFailure;
    }>
  | Readonly<{
      status: "finalize_failed";
      draftId: string;
      error: MediaUploadFailure;
    }>
  | Readonly<{ status: "cancelled"; draftId: string }>;

export type MediaUploadStartInput = Readonly<{
  draftId: string;
  scope: MediaScope;
  targetId: string;
  file: MediaFileInput;
}>;

export type MediaUploadListener = (
  draftId: string,
  state: MediaUploadState,
) => void;

export type MediaUploadController = Readonly<{
  start: (input: MediaUploadStartInput) => void;
  cancel: (draftId: string) => void;
  /** Retries the failed step in place: same upload intent for a PUT
   * failure, same upload_id for a finalize failure. Not valid from
   * put_expired — a fresh signed URL requires calling
   * retryWithNewIntent explicitly. */
  retry: (draftId: string) => void;
  /** Starts over from MD1 with a brand-new intent: the only valid recovery
   * from put_expired, and also usable after intent_failed. A cancelled draft's
   * staged file was deleted and must be picked again. */
  retryWithNewIntent: (draftId: string) => void;
  remove: (draftId: string) => void;
  dispose: () => void;
  getState: (draftId: string) => MediaUploadState | null;
  subscribe: (listener: MediaUploadListener) => () => void;
}>;

export type CreateMediaUploadControllerOptions = Readonly<{
  api: Pick<MediaApi, "createUpload" | "finalizeUpload">;
  objectPut: MediaObjectPutPort;
  cleanup?: MediaFileCleanupPort;
  authorize: <T>(
    execute: (token: string, signal: AbortSignal) => Promise<T>,
    signal?: AbortSignal,
  ) => Promise<T>;
  /** Identifies the active account+target combination; a result racing in
   * after this changes is dropped rather than applied. */
  getGeneration: () => MediaUploadGeneration;
}>;

function toFailure(error: unknown): MediaUploadFailure {
  if (error instanceof MediaApiError)
    return { status: error.status, code: error.code };
  return { status: 0, code: "unknown" };
}

type DraftRecord = {
  input: MediaUploadStartInput;
  state: MediaUploadState;
  generation: MediaUploadGeneration;
  abort: AbortController | null;
  uploadId: string | null;
  putUrl: string | null;
};

export function createMediaUploadController(
  options: CreateMediaUploadControllerOptions,
): MediaUploadController {
  const drafts = new Map<string, DraftRecord>();
  const listeners = new Set<MediaUploadListener>();
  let disposed = false;

  function cleanup(record: DraftRecord) {
    // Deletion failure must never turn a successful finalize into another upload.
    void Promise.resolve()
      .then(() => options.cleanup?.deleteIfExists(record.input.file.uri))
      .catch(() => undefined);
  }

  function notify(draftId: string, state: MediaUploadState) {
    for (const listener of listeners) listener(draftId, state);
  }

  function setState(record: DraftRecord, state: MediaUploadState) {
    record.state = state;
    notify(record.input.draftId, state);
  }

  /**
   * A cancelled/superseded draft stays in `drafts` (so its terminal state
   * remains inspectable via getState), so identity alone can't detect a
   * stale in-flight op: callers must also pass the AbortController that
   * was live when the awaited call started. If cancel() fired meanwhile,
   * that controller is aborted even though the awaited promise itself
   * resolved successfully, and the result must be dropped rather than
   * applied.
   */
  function isCurrent(record: DraftRecord, abort: AbortController): boolean {
    return (
      drafts.get(record.input.draftId) === record &&
      !disposed &&
      record.generation === options.getGeneration() &&
      !abort.signal.aborted
    );
  }

  async function runFinalize(record: DraftRecord, uploadId: string) {
    const abort = new AbortController();
    record.abort = abort;
    setState(record, { status: "finalizing", draftId: record.input.draftId });
    try {
      const result = await options.authorize(
        (token, signal) =>
          options.api.finalizeUpload(
            token,
            uploadId,
            {
              width: record.input.file.width,
              height: record.input.file.height,
            },
            signal,
          ),
        abort.signal,
      );
      if (!isCurrent(record, abort)) return;
      const policy = evaluateMediaContentPolicy(
        record.input.scope,
        record.input.file,
      );
      if (
        !policy.ok ||
        result.upload.kind !== policy.kind ||
        result.upload.scope !== record.input.scope ||
        result.scope !== record.input.scope ||
        result.upload.targetId !== record.input.targetId ||
        result.upload.id !== uploadId ||
        result.upload.contentType !== record.input.file.contentType ||
        result.upload.byteSize !== record.input.file.byteSize ||
        (result.scope === "topic" &&
          result.topicMedia.topicId !== record.input.targetId) ||
        (result.upload.kind === "audio" &&
          !isAuthoritativeAudioDuration(result.upload.duration))
      ) {
        throw new MediaApiError(502, "invalid_upload_finalize_identity");
      }
      setState(record, {
        status: "confirmed",
        draftId: record.input.draftId,
        result,
      });
      cleanup(record);
    } catch (error) {
      // Aborted-by-cancel already set the "cancelled" state synchronously
      // in cancel(); isCurrent's abort check means we only reach here for
      // a genuine failure of a still-active attempt.
      if (!isCurrent(record, abort)) return;
      setState(record, {
        status: "finalize_failed",
        draftId: record.input.draftId,
        error: toFailure(error),
      });
    }
  }

  async function runPut(record: DraftRecord, uploadId: string, putUrl: string) {
    const abort = new AbortController();
    record.abort = abort;
    record.uploadId = uploadId;
    record.putUrl = putUrl;
    setState(record, {
      status: "uploading",
      draftId: record.input.draftId,
      sentBytes: 0,
      totalBytes: record.input.file.byteSize,
    });
    try {
      const response = await options.objectPut.put({
        url: putUrl,
        file: record.input.file,
        signal: abort.signal,
        onProgress: (sentBytes, totalBytes) => {
          if (!isCurrent(record, abort) || record.state.status !== "uploading")
            return;
          setState(record, {
            status: "uploading",
            draftId: record.input.draftId,
            sentBytes,
            totalBytes,
          });
        },
      });
      if (!isCurrent(record, abort)) return;
      if (response.status >= 200 && response.status < 300) {
        await runFinalize(record, uploadId);
        return;
      }
      if (response.status === 403) {
        setState(record, {
          status: "put_expired",
          draftId: record.input.draftId,
          error: { status: response.status, code: "put_url_expired" },
        });
        return;
      }
      setState(record, {
        status: "put_failed",
        draftId: record.input.draftId,
        error: { status: response.status, code: "put_failed" },
      });
    } catch (error) {
      if (!isCurrent(record, abort)) return;
      setState(record, {
        status: "put_failed",
        draftId: record.input.draftId,
        error: toFailure(error),
      });
    }
  }

  async function runIntent(record: DraftRecord) {
    const abort = new AbortController();
    record.abort = abort;
    setState(record, {
      status: "requesting_intent",
      draftId: record.input.draftId,
    });
    try {
      const intent = await options.authorize(
        (token, signal) =>
          options.api.createUpload(
            token,
            {
              scope: record.input.scope,
              targetId: record.input.targetId,
              contentType: record.input.file.contentType,
              byteSize: record.input.file.byteSize,
              filename: record.input.file.name,
            },
            signal,
          ),
        abort.signal,
      );
      if (!isCurrent(record, abort)) return;
      await runPut(record, intent.upload.id, intent.put.url);
    } catch (error) {
      if (!isCurrent(record, abort)) return;
      setState(record, {
        status: "intent_failed",
        draftId: record.input.draftId,
        error: toFailure(error),
      });
    }
  }

  function beginFresh(input: MediaUploadStartInput) {
    const record: DraftRecord = {
      input,
      state: { status: "requesting_intent", draftId: input.draftId },
      generation: options.getGeneration(),
      abort: null,
      uploadId: null,
      putUrl: null,
    };
    drafts.set(input.draftId, record);
    const policy = evaluateMediaContentPolicy(input.scope, input.file);
    if (!policy.ok) {
      setState(record, {
        status: "intent_failed",
        draftId: input.draftId,
        error: { status: 422, code: policy.reason },
      });
      return;
    }
    void runIntent(record);
  }

  return {
    start(input) {
      if (disposed) return;
      const existing = drafts.get(input.draftId);
      if (
        existing &&
        (existing.state.status === "requesting_intent" ||
          existing.state.status === "uploading" ||
          existing.state.status === "finalizing" ||
          existing.state.status === "confirmed")
      ) {
        return;
      }
      beginFresh(input);
    },

    cancel(draftId) {
      const record = drafts.get(draftId);
      if (!record) return;
      if (
        record.state.status === "confirmed" ||
        record.state.status === "cancelled"
      ) {
        return;
      }
      record.abort?.abort();
      setState(record, { status: "cancelled", draftId });
      cleanup(record);
    },

    retry(draftId) {
      const record = drafts.get(draftId);
      if (!record || record.generation !== options.getGeneration()) return;
      switch (record.state.status) {
        case "put_failed":
          if (record.uploadId && record.putUrl)
            void runPut(record, record.uploadId, record.putUrl);
          return;
        case "finalize_failed":
          if (record.uploadId) void runFinalize(record, record.uploadId);
          return;
        case "intent_failed":
          beginFresh(record.input);
          return;
        default:
          // put_expired (must use retryWithNewIntent) and in-flight/terminal
          // states are not retryable in place.
          return;
      }
    },

    retryWithNewIntent(draftId) {
      const record = drafts.get(draftId);
      if (!record || disposed || record.generation !== options.getGeneration())
        return;
      if (
        record.state.status === "requesting_intent" ||
        record.state.status === "uploading" ||
        record.state.status === "finalizing" ||
        record.state.status === "confirmed" ||
        record.state.status === "cancelled"
      ) {
        return;
      }
      beginFresh(record.input);
    },

    remove(draftId) {
      const record = drafts.get(draftId);
      if (!record) return;
      record.abort?.abort();
      drafts.delete(draftId);
      cleanup(record);
    },

    dispose() {
      disposed = true;
      for (const record of drafts.values()) {
        record.abort?.abort();
        cleanup(record);
      }
      drafts.clear();
      listeners.clear();
    },

    getState(draftId) {
      return drafts.get(draftId)?.state ?? null;
    },

    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}
