import type { ConnectedPendingAttachment } from "@/features/chat/model/connected-chat-presentation";
import type {
  MediaKind,
  MediaScope,
} from "@/features/media/platform/media-policy";

/** Output of picking + local validation + app-owned staging, before any upload starts. */
export type StagedMediaAsset = Readonly<{
  localId: string;
  kind: MediaKind;
  scope: MediaScope;
  uri: string;
  contentType: string;
  byteSize: number;
  filename: string | null;
  width: number | null;
  height: number | null;
  /** Advisory only; the server derives the authoritative duration at finalize. */
  durationSeconds: number | null;
}>;

export type MediaAttachmentQueueItemStatus =
  "staged" | "uploading" | "finalizing" | "confirmed" | "failed" | "cancelled";

export type MediaAttachmentQueueItem = Readonly<{
  localId: string;
  kind: MediaKind;
  filename: string | null;
  byteSize: number;
  width: number | null;
  height: number | null;
  duration: number | null;
  status: MediaAttachmentQueueItemStatus;
  /** 0..1, meaningful only while `status === "uploading"`. */
  progress: number;
  errorMessage: string | null;
  /** Set only once `status === "confirmed"`; the exact shape the DB/outbox accepts. */
  confirmed: ConnectedPendingAttachment | null;
}>;

/**
 * Consumer-defined port: the UI depends on this shape for both the chat composer's
 * attach flow and the topic image action. `src/features/media/model/use-media-upload-
 * queue.ts`'s `useMediaUploadQueue` is the real implementation (MD1->PUT->MD2
 * sequencing, core/model ownership) and its return value satisfies this shape
 * directly — this file only owns the type both sides agree on. See
 * `.agents/results/m11-media-ui-seams-20260910-225702.md`.
 */
export type MediaAttachmentController = Readonly<{
  scopeKey?: string;
  available?: boolean;
  items: readonly MediaAttachmentQueueItem[];
  addImageOrVideo: (asset: StagedMediaAsset) => void;
  addAudio: (asset: StagedMediaAsset) => void;
  cancel: (localId: string) => void;
  retry: (localId: string) => void;
  remove: (localId: string) => void;
}>;
