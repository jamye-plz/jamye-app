import type { ChatUploadFinalizeResult } from "@/core/contracts/server/media";

import type { MediaFileInput } from "./media-policy";

/**
 * Matches the DB owner's planned `ConnectedPendingAttachment` seam
 * (metadata only). `type` is the MIME content_type string, matching the
 * server's `MessageAttachment.type` wire field exactly — not the coarse
 * image/video/audio kind. width/height come from the original client
 * selection because MD2's chat-scope ConfirmedUpload does not echo them
 * back; duration is server-authoritative (never the client's measurement).
 */
export type PendingAttachmentDraft = Readonly<{
  mediaUploadId: string;
  type: string;
  byteSize: number;
  filename: string | null;
  width: number | null;
  height: number | null;
  duration: number | null;
  /**
   * Carries the finalized upload's `posterUploadId` through the optimistic
   * local row so it round-trips before the message is sent. A2 only wires
   * the field through; A3 owns reconciling this against the server-assigned
   * `MessageAttachment.posterMediaId` once the message is bound.
   */
  posterMediaId: string | null;
}>;

export function toPendingAttachmentDraft(
  finalized: ChatUploadFinalizeResult,
  file: MediaFileInput,
): PendingAttachmentDraft {
  return {
    mediaUploadId: finalized.upload.id,
    type: finalized.upload.contentType,
    byteSize: finalized.upload.byteSize,
    filename: finalized.upload.filename,
    width: file.width,
    height: file.height,
    duration: finalized.upload.duration,
    posterMediaId: finalized.upload.posterUploadId ?? null,
  };
}
