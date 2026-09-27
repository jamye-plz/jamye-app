import { parsePublicApiOrigin } from "@/core/config/public-env";
import {
  mapChatroomMediaPage,
  mapMediaAccessUrl,
  mapUploadFinalizeResult,
  mapUploadIntentWithPresignedPut,
  type ChatroomMediaPage,
  type MediaAccessUrl,
  type MediaScope,
  type UploadFinalizeResult,
  type UploadIntentWithPresignedPut,
} from "@/core/contracts/server/media";
import {
  validateChatroomMediaPage,
  validateErrorEnvelope,
  validateMediaAccessUrl,
  validateUploadFinalize,
  validateUploadFinalizeResult,
  validateUploadIntentCreate,
  validateUploadIntentWithPresignedPut,
} from "@/core/contracts/server";
import {
  HttpAbortedError,
  REQUEST_TIMEOUT_MS,
  withTimeoutSignal,
} from "@/core/http/http-client";

import {
  MediaOriginError,
  requireMediaOriginUrl,
  type MediaHttpTransport,
} from "./media-transport";

const IDENTIFIER_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export class MediaApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
  ) {
    super(code);
  }
}

export type MediaUploadCreateInput = Readonly<{
  scope: MediaScope;
  targetId: string;
  contentType: string;
  byteSize: number;
  filename?: string | null;
}>;

export type MediaUploadFinalizeInput = Readonly<{
  width?: number | null;
  height?: number | null;
  posterUploadId?: string | null;
}>;

/** C5 (D4/E10): `before` is an opaque message_media.id cursor, `limit` is
 * bounded [1, 100] (default 50 server-side). */
export type ChatroomMediaListParams = Readonly<{
  before?: string;
  limit?: number;
}>;

export type MediaDownloadLocation = Readonly<{ location: string }>;

export type MediaApi = Readonly<{
  createUpload: (
    accessToken: string,
    input: MediaUploadCreateInput,
    signal?: AbortSignal,
  ) => Promise<UploadIntentWithPresignedPut>;
  finalizeUpload: (
    accessToken: string,
    uploadId: string,
    input: MediaUploadFinalizeInput,
    signal?: AbortSignal,
  ) => Promise<UploadFinalizeResult>;
  listChatroomMedia: (
    accessToken: string,
    chatroomId: string,
    params: ChatroomMediaListParams,
    signal?: AbortSignal,
  ) => Promise<ChatroomMediaPage>;
  getAccess: (
    accessToken: string,
    mediaId: string,
    signal?: AbortSignal,
  ) => Promise<MediaAccessUrl>;
  getDownloadLocation: (
    accessToken: string,
    mediaId: string,
    signal?: AbortSignal,
  ) => Promise<MediaDownloadLocation>;
}>;

function identifier(value: string): string {
  if (!IDENTIFIER_PATTERN.test(value))
    throw new MediaApiError(422, "invalid_identifier");
  return encodeURIComponent(value);
}

/** Same bare-HTTPS-origin shape as EXPO_PUBLIC_API_ORIGIN, but mediaOrigin is
 * a distinct config value (the object-storage origin signed URLs resolve
 * to), so it gets its own validator instead of reusing the API-origin one. */
function parseMediaOrigin(value: string): string {
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    throw new Error("mediaOrigin must be a valid HTTPS origin.");
  }
  if (
    parsed.protocol !== "https:" ||
    parsed.username ||
    parsed.password ||
    parsed.search ||
    parsed.hash ||
    parsed.pathname !== "/"
  ) {
    throw new Error("mediaOrigin must be a bare HTTPS origin.");
  }
  return parsed.origin;
}

function requireOrigin(url: string, origin: string): void {
  try {
    requireMediaOriginUrl(url, origin);
  } catch (error) {
    if (error instanceof MediaOriginError)
      throw new MediaApiError(502, "invalid_media_origin_url");
    throw error;
  }
}

function pageQuery(params: ChatroomMediaListParams): string {
  if (
    params.limit !== undefined &&
    (!Number.isInteger(params.limit) || params.limit < 1 || params.limit > 100)
  )
    throw new MediaApiError(422, "invalid_page_limit");
  const query = new URLSearchParams();
  if (params.before !== undefined) query.set("before", params.before);
  if (params.limit !== undefined) query.set("limit", String(params.limit));
  const serialized = query.toString();
  return serialized ? `?${serialized}` : "";
}

export function createMediaApi(
  apiOrigin: string,
  mediaOrigin: string,
  transport: MediaHttpTransport,
): MediaApi {
  const resolvedApiOrigin = parsePublicApiOrigin(apiOrigin);
  const resolvedMediaOrigin = parseMediaOrigin(mediaOrigin);

  async function request(
    path: string,
    accessToken: string,
    init: Readonly<{ method: "GET" | "POST"; body?: unknown }>,
    signal: AbortSignal | undefined,
    expectedStatuses: readonly number[],
  ): Promise<{ payload: unknown; status: number }> {
    try {
      const { status, ok, payload } = await withTimeoutSignal(
        signal,
        REQUEST_TIMEOUT_MS,
        async (composedSignal) => {
          const response = await transport.fetch(
            `${resolvedApiOrigin}${path}`,
            {
              method: init.method,
              credentials: "omit",
              redirect: "error",
              signal: composedSignal,
              headers: {
                Accept: "application/json",
                Authorization: `Bearer ${accessToken}`,
                ...(init.body !== undefined
                  ? { "Content-Type": "application/json" }
                  : {}),
              },
              ...(init.body !== undefined
                ? { body: JSON.stringify(init.body) }
                : {}),
            },
          );
          return {
            status: response.status,
            ok: response.ok,
            payload:
              response.status === 204
                ? null
                : await response.json().catch(() => null),
          };
        },
      );
      if (!ok) {
        const code = validateErrorEnvelope(payload)
          ? payload.error.code
          : "request_failed";
        throw new MediaApiError(status, code);
      }
      if (!expectedStatuses.includes(status))
        throw new MediaApiError(502, "invalid_response_status");
      return { payload, status };
    } catch (error) {
      if (error instanceof MediaApiError) throw error;
      if (error instanceof HttpAbortedError)
        throw error.by === "caller"
          ? new MediaApiError(0, "request_cancelled")
          : new MediaApiError(408, "request_timeout");
      throw new MediaApiError(0, "network_unavailable");
    }
  }

  return {
    async createUpload(accessToken, input, signal) {
      if (!IDENTIFIER_PATTERN.test(input.targetId))
        throw new MediaApiError(422, "invalid_identifier");
      const body = {
        scope: input.scope,
        target_id: input.targetId,
        content_type: input.contentType,
        byte_size: input.byteSize,
        ...(input.filename !== undefined ? { filename: input.filename } : {}),
      };
      if (!validateUploadIntentCreate(body))
        throw new MediaApiError(422, "invalid_upload_intent_create");
      const { payload } = await request(
        "/api/v1/media/uploads",
        accessToken,
        { method: "POST", body },
        signal,
        [201],
      );
      if (
        !validateUploadIntentWithPresignedPut(payload) ||
        payload.upload.scope !== input.scope ||
        payload.upload.target_id !== input.targetId ||
        payload.upload.content_type !== input.contentType ||
        payload.upload.byte_size !== input.byteSize
      ) {
        throw new MediaApiError(502, "invalid_upload_intent_response");
      }
      requireOrigin(payload.put.url, resolvedMediaOrigin);
      return mapUploadIntentWithPresignedPut(payload);
    },

    async finalizeUpload(accessToken, uploadId, input, signal) {
      const body: Readonly<{
        width?: number | null;
        height?: number | null;
        poster_upload_id?: string;
      }> = {
        ...(input.width !== undefined ? { width: input.width } : {}),
        ...(input.height !== undefined ? { height: input.height } : {}),
        // poster_upload_id is request-optional (never nullable on the
        // wire): omit when undefined AND when null, only serialize an
        // actual string. Never send an explicit null for this field.
        ...(typeof input.posterUploadId === "string"
          ? { poster_upload_id: input.posterUploadId }
          : {}),
      };
      if (!validateUploadFinalize(body))
        throw new MediaApiError(422, "invalid_upload_finalize");
      const { payload } = await request(
        `/api/v1/media/uploads/${identifier(uploadId)}/finalize`,
        accessToken,
        { method: "POST", body },
        signal,
        [200],
      );
      if (!validateUploadFinalizeResult(payload))
        throw new MediaApiError(502, "invalid_upload_finalize_response");
      // S3 collapsed the response to the single chat-scope shape (no more
      // oneOf(ChatUploadFinalizeResult, TopicUploadFinalizeResult) to narrow).
      if (payload.upload.id !== uploadId)
        throw new MediaApiError(502, "invalid_upload_finalize_identity");
      return mapUploadFinalizeResult(payload);
    },

    async listChatroomMedia(accessToken, chatroomId, params, signal) {
      const { payload } = await request(
        `/api/v1/chatrooms/${identifier(chatroomId)}/media${pageQuery(params)}`,
        accessToken,
        { method: "GET" },
        signal,
        [200],
      );
      if (!validateChatroomMediaPage(payload))
        throw new MediaApiError(502, "invalid_chatroom_media_page_response");
      return mapChatroomMediaPage(payload);
    },

    async getAccess(accessToken, mediaId, signal) {
      const { payload } = await request(
        `/api/v1/media/${identifier(mediaId)}/url`,
        accessToken,
        { method: "GET" },
        signal,
        [200],
      );
      if (!validateMediaAccessUrl(payload) || payload.id !== mediaId)
        throw new MediaApiError(502, "invalid_media_access_url_response");
      requireOrigin(payload.url, resolvedMediaOrigin);
      return mapMediaAccessUrl(payload);
    },

    async getDownloadLocation(accessToken, mediaId, signal) {
      try {
        const response = await withTimeoutSignal(
          signal,
          REQUEST_TIMEOUT_MS,
          async (composedSignal) => {
            const result = await transport.fetch(
              `${resolvedApiOrigin}/api/v1/media/${identifier(mediaId)}/download`,
              {
                method: "GET",
                credentials: "omit",
                redirect: "manual",
                signal: composedSignal,
                headers: {
                  Accept: "application/json",
                  Authorization: `Bearer ${accessToken}`,
                },
              },
            );
            return {
              status: result.status,
              location:
                result.status === 307 ? result.headers.get("location") : null,
              payload:
                result.status === 307
                  ? null
                  : await result.json().catch(() => null),
            };
          },
        );
        if (response.status !== 307) {
          // MD5 never returns a 2xx JSON success body; any non-307 status
          // here is the shared ErrorEnvelope default response.
          const payload = response.payload;
          const code = validateErrorEnvelope(payload)
            ? payload.error.code
            : "request_failed";
          throw new MediaApiError(response.status, code);
        }
        const location = response.location;
        if (typeof location !== "string" || location.length === 0)
          throw new MediaApiError(502, "missing_download_location");
        requireOrigin(location, resolvedMediaOrigin);
        return { location };
      } catch (error) {
        if (error instanceof MediaApiError) throw error;
        if (error instanceof HttpAbortedError)
          throw error.by === "caller"
            ? new MediaApiError(0, "request_cancelled")
            : new MediaApiError(408, "request_timeout");
        throw new MediaApiError(0, "network_unavailable");
      }
    },
  };
}
