import type { MediaApi } from "@/features/media/data/media-api";
import { MediaApiError } from "@/features/media/data/media-api";
import type {
  MediaScope,
  UploadFinalizeResult,
} from "@/core/contracts/server/media";
import { consoleLoggerSink, createLogger } from "@/core/logging/logger";

import { statMediaFile } from "../platform/media-file-stat";
import { createNativeVideoThumbnail } from "../platform/native-video-thumbnail";
import type { MediaFileInput } from "./media-policy";
import {
  evaluateMediaContentPolicy,
  isAuthoritativeAudioDuration,
} from "./media-policy";
import type {
  MediaFileCleanupPort,
  MediaObjectPutPort,
} from "./media-upload-ports";

const posterLogger = createLogger(consoleLoggerSink);

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
  /** The image/jpeg upload id attached to the video, or null once the poster
   * sub-pipeline has run and decided to skip it (never re-attempted on a
   * finalize retry — only re-run from a fresh runPut). */
  posterUploadId: string | null;
  /** The app-owned staged JPEG produced by the poster sub-pipeline, tracked
   * so cancel()/remove()/dispose() can remove it even if the pipeline is
   * still suspended on an in-flight await when cancellation happens. */
  posterStagedUri: string | null;
};

type PosterFailureStage = "generate" | "intent" | "put" | "finalize";

type PosterOutcome = Readonly<{
  posterUploadId: string | null;
  cancelled: boolean;
}>;

function posterFailureCode(error: unknown): string {
  if (error instanceof MediaApiError) return error.code;
  if (error instanceof Error) {
    const parts = error.message.split(":");
    if (parts[0] === "thumbnail_unavailable" && parts[2]) return parts[2];
    return error.message;
  }
  return "unknown";
}

/** Poster generation/attachment only applies to chat-scope video/mp4 drafts —
 * topic scope never allows video at all (see media-policy.ts) and other
 * kinds have no poster concept. */
function isVideoPosterEligible(input: MediaUploadStartInput): boolean {
  return input.scope === "chat" && input.file.contentType === "video/mp4";
}

/** Starts a fresh cancellable stage for `record`: creates a new
 * `AbortController`, assigns it as the draft's current abort handle (so
 * cancel() always aborts whatever is currently in flight), and returns it. */
function beginStage(record: DraftRecord): AbortController {
  const abort = new AbortController();
  record.abort = abort;
  return abort;
}

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

  /** Removes the poster sub-pipeline's staged JPEG through the same injected
   * cleanup port as the main file — safe to call more than once (e.g. from
   * both cancel() and the pipeline's own finally) since it clears the field
   * before scheduling deletion. */
  function cleanupPoster(record: DraftRecord) {
    const uri = record.posterStagedUri;
    if (!uri) return;
    record.posterStagedUri = null;
    void Promise.resolve()
      .then(() => options.cleanup?.deleteIfExists(uri))
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

  /**
   * Runs the poster sub-pipeline for an already-PUT video: generate a staged
   * JPEG thumbnail, upload+finalize it as its own image/jpeg media, and
   * return the resulting upload id. Every stage reuses the same abort/
   * generation guard as the rest of the controller (a fresh AbortController
   * per stage, assigned to `record.abort` so cancel() always aborts whatever
   * is currently in flight). Any non-cancellation failure is logged and
   * treated as a skip — the video is finalized without a poster rather than
   * failing the whole draft.
   */
  async function runPosterPipeline(
    record: DraftRecord,
  ): Promise<PosterOutcome> {
    let stage: PosterFailureStage = "generate";
    let stagedUri: string | null = null;
    let activeAbort = beginStage(record);
    try {
      stagedUri = await createNativeVideoThumbnail(
        record.input.file.uri,
        activeAbort.signal,
        { destination: "staging" },
      );
      record.posterStagedUri = stagedUri;
      if (!isCurrent(record, activeAbort))
        return { posterUploadId: null, cancelled: true };

      const stat = statMediaFile(stagedUri);

      stage = "intent";
      activeAbort = beginStage(record);
      const posterIntent = await options.authorize(
        (token, signal) =>
          options.api.createUpload(
            token,
            {
              scope: record.input.scope,
              targetId: record.input.targetId,
              contentType: "image/jpeg",
              byteSize: stat.byteSize,
              filename: null,
            },
            signal,
          ),
        activeAbort.signal,
      );
      if (!isCurrent(record, activeAbort))
        return { posterUploadId: null, cancelled: true };

      stage = "put";
      activeAbort = beginStage(record);
      const putResponse = await options.objectPut.put({
        url: posterIntent.put.url,
        file: {
          uri: stagedUri,
          name: null,
          byteSize: stat.byteSize,
          contentType: "image/jpeg",
          width: null,
          height: null,
        },
        signal: activeAbort.signal,
      });
      if (!isCurrent(record, activeAbort))
        return { posterUploadId: null, cancelled: true };
      if (putResponse.status < 200 || putResponse.status >= 300) {
        throw new MediaApiError(putResponse.status, "poster_put_failed");
      }

      stage = "finalize";
      activeAbort = beginStage(record);
      await options.authorize(
        (token, signal) =>
          options.api.finalizeUpload(
            token,
            posterIntent.upload.id,
            { width: null, height: null },
            signal,
          ),
        activeAbort.signal,
      );
      if (!isCurrent(record, activeAbort))
        return { posterUploadId: null, cancelled: true };

      return { posterUploadId: posterIntent.upload.id, cancelled: false };
    } catch (error) {
      if (!isCurrent(record, activeAbort))
        return { posterUploadId: null, cancelled: true };
      posterLogger.log("media.poster.failed", "warn", {
        stage,
        code: posterFailureCode(error),
      });
      return { posterUploadId: null, cancelled: false };
    } finally {
      cleanupPoster(record);
    }
  }

  async function runFinalize(
    record: DraftRecord,
    uploadId: string,
    posterUploadId: string | null,
  ) {
    const abort = beginStage(record);
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
              posterUploadId,
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
        result.upload.posterUploadId !== posterUploadId ||
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
    const abort = beginStage(record);
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
        if (isVideoPosterEligible(record.input)) {
          const posterOutcome = await runPosterPipeline(record);
          if (posterOutcome.cancelled) return;
          record.posterUploadId = posterOutcome.posterUploadId;
        }
        await runFinalize(record, uploadId, record.posterUploadId);
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
    const abort = beginStage(record);
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
      posterUploadId: null,
      posterStagedUri: null,
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
      cleanupPoster(record);
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
          if (record.uploadId)
            void runFinalize(record, record.uploadId, record.posterUploadId);
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
      cleanupPoster(record);
    },

    dispose() {
      disposed = true;
      for (const record of drafts.values()) {
        record.abort?.abort();
        cleanup(record);
        cleanupPoster(record);
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
