import {
  getMediaContentPolicy,
  MAX_AUDIO_BYTES,
  MAX_IMAGE_BYTES,
  MAX_VIDEO_BYTES,
  type MediaKind,
  type MediaScope,
} from "@/core/contracts/server/media";

export { MAX_AUDIO_BYTES, MAX_IMAGE_BYTES, MAX_VIDEO_BYTES };

/** App-owned selection metadata handed off by the native picker; the native
 * owner is responsible for producing an app-owned URI and stat'd byteSize
 * (never a client-guessed size). */
export type MediaFileInput = Readonly<{
  uri: string;
  name: string | null;
  byteSize: number;
  contentType: string;
  width: number | null;
  height: number | null;
}>;

export type MediaContentRejectReason =
  | "unsupported_mime"
  | "file_too_large"
  | "empty_file"
  | "filename_too_long"
  | "scope_not_allowed";

export type MediaContentPolicyResult =
  | Readonly<{ ok: true; kind: MediaKind }>
  | Readonly<{ ok: false; reason: MediaContentRejectReason }>;

export const MAX_FILENAME_LENGTH = 255;
export const MAX_CHAT_ATTACHMENTS = 4;
export const MAX_AUDIO_DURATION_SECONDS = 330;

/**
 * Client-side gate run before MD1 is ever called: unsupported MIME types
 * (including HEIC/AVIF/MOV, which the server allowlist excludes) and
 * over-size or empty selections are rejected here rather than relabeled to
 * bypass policy. Actual stat'd byteSize/contentType must come from the
 * selected file, never a client-declared guess.
 */
export function evaluateMediaContentPolicy(
  scope: MediaScope,
  file: MediaFileInput,
): MediaContentPolicyResult {
  if (file.name !== null && Array.from(file.name).length > MAX_FILENAME_LENGTH)
    return { ok: false, reason: "filename_too_long" };
  if (!Number.isInteger(file.byteSize) || file.byteSize <= 0)
    return { ok: false, reason: "empty_file" };
  const policy = getMediaContentPolicy(file.contentType);
  if (policy === null) return { ok: false, reason: "unsupported_mime" };
  if (scope === "topic" && policy.kind !== "image")
    return { ok: false, reason: "scope_not_allowed" };
  if (file.byteSize > policy.maxBytes)
    return { ok: false, reason: "file_too_large" };
  return { ok: true, kind: policy.kind };
}

export type ChatAttachmentDraft = Readonly<{
  mediaUploadId: string;
  kind: MediaKind;
}>;

export type ChatSendCompositionInput = Readonly<{
  body: string | null;
  attachments: readonly ChatAttachmentDraft[];
}>;

export type ChatCompositionRejectReason =
  | "no_content"
  | "too_many_attachments"
  | "duplicate_attachment"
  | "audio_must_be_alone_and_bodyless";

export type ChatCompositionResult =
  | Readonly<{ ok: true }>
  | Readonly<{ ok: false; reason: ChatCompositionRejectReason }>;

/**
 * C4 composition rule: up to four ordered, unique, non-audio attachments,
 * or exactly one bodyless audio attachment. Body may be absent only when an
 * allowed attachment exists.
 */
export function evaluateChatSendComposition(
  input: ChatSendCompositionInput,
): ChatCompositionResult {
  const hasBody = typeof input.body === "string" && input.body.length > 0;
  if (input.attachments.length === 0) {
    return hasBody ? { ok: true } : { ok: false, reason: "no_content" };
  }
  const uniqueIds = new Set(
    input.attachments.map((attachment) => attachment.mediaUploadId),
  );
  if (uniqueIds.size !== input.attachments.length)
    return { ok: false, reason: "duplicate_attachment" };
  const hasAudio = input.attachments.some(
    (attachment) => attachment.kind === "audio",
  );
  if (hasAudio) {
    return input.attachments.length === 1 && !hasBody
      ? { ok: true }
      : { ok: false, reason: "audio_must_be_alone_and_bodyless" };
  }
  if (input.attachments.length > MAX_CHAT_ATTACHMENTS)
    return { ok: false, reason: "too_many_attachments" };
  return { ok: true };
}

/**
 * MD2's duration is provider-inspected authority; client-measured duration
 * is advisory only and must never be submitted as finalize input. This
 * checks the value MD2 actually returned.
 */
export function isAuthoritativeAudioDuration(
  duration: number | null,
): duration is number {
  return (
    duration !== null &&
    Number.isInteger(duration) &&
    duration > 0 &&
    duration <= MAX_AUDIO_DURATION_SECONDS
  );
}
