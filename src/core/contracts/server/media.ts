import type {
  ConfirmedUploadWire,
  MediaAccessUrlWire,
  TopicMediaPageWire,
  TopicMediaWire,
  UploadFinalizeResultWire,
  UploadIntentWithPresignedPutWire,
} from "./validators";

/**
 * MD1-5 durable domain objects intentionally omit object_key: it is a
 * storage-internal path, never used by the client (PUT uses put.url; access
 * uses MD4's short-lived url), and is not safe to carry into UI/DB state.
 * These types are new, non-conflicting names alongside topics.ts's existing
 * TopicMedia identity (which this file does not modify or reuse).
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

export type ChatUploadFinalizeResult = Readonly<{
  scope: "chat";
  bound: false;
  upload: ConfirmedUpload;
}>;

export type TopicMediaEntry = Readonly<{
  id: string;
  topicId: string;
  mediaUploadId: string;
  contentType: string;
  width: number | null;
  height: number | null;
  byteSize: number | null;
  createdAt: string;
}>;

export type TopicMediaEntryPage = Readonly<{
  items: readonly TopicMediaEntry[];
  nextCursor: string | null;
}>;

export type TopicUploadFinalizeResult = Readonly<{
  scope: "topic";
  bound: true;
  topicStatus: "enriched";
  topicMedia: TopicMediaEntry;
  upload: ConfirmedUpload;
}>;

export type UploadFinalizeResult =
  ChatUploadFinalizeResult | TopicUploadFinalizeResult;

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

export function mapTopicMediaEntry(wire: TopicMediaWire): TopicMediaEntry {
  return {
    id: wire.id,
    topicId: wire.topic_id,
    mediaUploadId: wire.media_upload_id,
    contentType: wire.content_type,
    width: wire.width,
    height: wire.height,
    byteSize: wire.byte_size,
    createdAt: wire.created_at,
  };
}

export function mapTopicMediaEntryPage(
  wire: TopicMediaPageWire,
): TopicMediaEntryPage {
  return {
    items: wire.items.map(mapTopicMediaEntry),
    nextCursor: wire.next_cursor,
  };
}

/**
 * scope is the discriminant on the wire's oneOf(ChatUploadFinalizeResult,
 * TopicUploadFinalizeResult); this narrows before mapping so a malformed
 * third scope value is a caller error, not a silently dropped branch.
 */
export function mapUploadFinalizeResult(
  wire: UploadFinalizeResultWire,
): UploadFinalizeResult {
  if (wire.scope === "chat") {
    return {
      scope: "chat",
      bound: false,
      upload: mapConfirmedUpload(wire.upload),
    };
  }
  return {
    scope: "topic",
    bound: true,
    topicStatus: wire.topic_status,
    topicMedia: mapTopicMediaEntry(wire.topic_media),
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
