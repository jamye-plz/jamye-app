import type {
  ChatroomMediaItemWire,
  ChatroomMediaPageWire,
  ConfirmedUploadWire,
  MediaAccessUrlWire,
  UploadFinalizeResultWire,
  UploadIntentWithPresignedPutWire,
} from "./validators";

/**
 * MD1-5 durable domain objects intentionally omit object_key: it is a
 * storage-internal path, never used by the client (PUT uses put.url; access
 * uses MD4's short-lived url), and is not safe to carry into UI/DB state.
 * S3 removed the topic-scoped upload branch and the TopicMedia identity this
 * comment used to describe; C5's ChatroomMediaItem below is a separate,
 * read-only projection of message attachments for gallery display, not a
 * durable upload record.
 */

export type MediaScope = ConfirmedUploadWire["scope"];
export type MediaKind = ConfirmedUploadWire["kind"];

export const MAX_IMAGE_BYTES = 10_485_760;
export const MAX_VIDEO_BYTES = 52_428_800;
export const MAX_AUDIO_BYTES = 15_728_640;

type MediaContentPolicy = Readonly<{
  kind: MediaKind;
  maxBytes: number;
}>;

const MEDIA_CONTENT_POLICY = new Map<string, MediaContentPolicy>([
  ["image/jpeg", { kind: "image", maxBytes: MAX_IMAGE_BYTES }],
  ["image/png", { kind: "image", maxBytes: MAX_IMAGE_BYTES }],
  ["image/webp", { kind: "image", maxBytes: MAX_IMAGE_BYTES }],
  ["image/gif", { kind: "image", maxBytes: MAX_IMAGE_BYTES }],
  ["video/mp4", { kind: "video", maxBytes: MAX_VIDEO_BYTES }],
  ["audio/webm", { kind: "audio", maxBytes: MAX_AUDIO_BYTES }],
  ["audio/mp4", { kind: "audio", maxBytes: MAX_AUDIO_BYTES }],
  ["audio/ogg", { kind: "audio", maxBytes: MAX_AUDIO_BYTES }],
]);

/** Shared server-owned MIME and byte-limit policy for preflight and durable input. */
export function getMediaContentPolicy(
  contentType: string,
): MediaContentPolicy | null {
  return MEDIA_CONTENT_POLICY.get(contentType) ?? null;
}

export type PresignedPut = Readonly<{
  url: string;
  expiresIn: number;
}>;

export type UploadIntent = Readonly<{
  id: string;
  scope: MediaScope;
  targetId: string;
  kind: MediaKind;
  contentType: string;
  byteSize: number;
  filename: string | null;
  expiresAt: string;
  createdAt: string;
}>;

export type UploadIntentWithPresignedPut = Readonly<{
  upload: UploadIntent;
  put: PresignedPut;
}>;

export type ConfirmedUpload = Readonly<{
  id: string;
  scope: MediaScope;
  targetId: string;
  kind: MediaKind;
  contentType: string;
  byteSize: number;
  duration: number | null;
  filename: string | null;
  confirmedAt: string;
  posterUploadId: string | null;
}>;

export type UploadFinalizeResult = Readonly<{
  scope: "chat";
  bound: false;
  upload: ConfirmedUpload;
}>;

export type MediaAccessUrl = Readonly<{
  id: string;
  mediaUploadId: string;
  url: string;
  contentType: string;
  byteSize: number;
  width: number | null;
  height: number | null;
  duration: number | null;
  filename: string | null;
  expiresIn: number;
}>;

/**
 * C5 (D4/E10) chatroom media timeline item: a message_media row projected for
 * gallery display, newest-message-first (`messages.created_at DESC, messages.id
 * DESC, message_media.position ASC`). `contentType` is mapped from the wire's
 * `type` field (the item's own MIME, e.g. "image/jpeg" or "video/mp4" -- this
 * wire shape has no separate `kind` field). Images and audio-only messages are
 * excluded server-side; `posterMediaId` is only ever set for `video/mp4`.
 */
export type ChatroomMediaItem = Readonly<{
  id: string;
  mediaUploadId: string;
  contentType: string;
  byteSize: number;
  width: number | null;
  height: number | null;
  duration: number | null;
  filename: string | null;
  position: number;
  posterMediaId: string | null;
  messageId: string;
  messageCreatedAt: string;
}>;

export type ChatroomMediaPage = Readonly<{
  items: readonly ChatroomMediaItem[];
  nextCursor: string | null;
}>;

export function mapUploadIntent(
  wire: UploadIntentWithPresignedPutWire["upload"],
): UploadIntent {
  return {
    id: wire.id,
    scope: wire.scope,
    targetId: wire.target_id,
    kind: wire.kind,
    contentType: wire.content_type,
    byteSize: wire.byte_size,
    filename: wire.filename,
    expiresAt: wire.expires_at,
    createdAt: wire.created_at,
  };
}

export function mapUploadIntentWithPresignedPut(
  wire: UploadIntentWithPresignedPutWire,
): UploadIntentWithPresignedPut {
  return {
    upload: mapUploadIntent(wire.upload),
    put: { url: wire.put.url, expiresIn: wire.put.expires_in },
  };
}

export function mapConfirmedUpload(wire: ConfirmedUploadWire): ConfirmedUpload {
  return {
    id: wire.id,
    scope: wire.scope,
    targetId: wire.target_id,
    kind: wire.kind,
    contentType: wire.content_type,
    byteSize: wire.byte_size,
    duration: wire.duration,
    filename: wire.filename,
    confirmedAt: wire.confirmed_at,
    posterUploadId: wire.poster_upload_id,
  };
}

/**
 * S3 collapsed UploadFinalizeResult to the single chat-scope shape (the
 * server-side oneOf(ChatUploadFinalizeResult, TopicUploadFinalizeResult) this
 * used to narrow on `wire.scope` no longer exists), so this is now a direct
 * mapping rather than a branch.
 */
export function mapUploadFinalizeResult(
  wire: UploadFinalizeResultWire,
): UploadFinalizeResult {
  return {
    scope: "chat",
    bound: false,
    upload: mapConfirmedUpload(wire.upload),
  };
}

export function mapMediaAccessUrl(wire: MediaAccessUrlWire): MediaAccessUrl {
  return {
    id: wire.id,
    mediaUploadId: wire.media_upload_id,
    url: wire.url,
    contentType: wire.content_type,
    byteSize: wire.byte_size,
    width: wire.width,
    height: wire.height,
    duration: wire.duration,
    filename: wire.filename,
    expiresIn: wire.expires_in,
  };
}

export function mapChatroomMediaItem(
  wire: ChatroomMediaItemWire,
): ChatroomMediaItem {
  return {
    id: wire.id,
    mediaUploadId: wire.media_upload_id,
    contentType: wire.type,
    byteSize: wire.byte_size,
    width: wire.width,
    height: wire.height,
    duration: wire.duration,
    filename: wire.filename,
    position: wire.position,
    posterMediaId: wire.poster_media_id,
    messageId: wire.message_id,
    messageCreatedAt: wire.message_created_at,
  };
}

export function mapChatroomMediaPage(
  wire: ChatroomMediaPageWire,
): ChatroomMediaPage {
  return {
    items: wire.items.map(mapChatroomMediaItem),
    nextCursor: wire.next_cursor,
  };
}
