import { MAX_CHAT_ATTACHMENTS } from "@/features/media/platform/media-policy";
import type { MediaAttachmentQueueItem } from "./media-attachment-types";

export type CompositionCheck =
  Readonly<{ allowed: true }> | Readonly<{ allowed: false; message: string }>;

const activeItems = (items: readonly MediaAttachmentQueueItem[]) =>
  items.filter((item) => item.status !== "cancelled");

/** C4 composition guard mirrored client-side for fast feedback: up to four ordered
 * non-audio attachments, or exactly one bodyless audio attachment, never mixed. */
export function canAddImageOrVideo(
  items: readonly MediaAttachmentQueueItem[],
): CompositionCheck {
  const active = activeItems(items);
  if (active.some((item) => item.kind === "audio"))
    return {
      allowed: false,
      message: "음성 파일과 다른 첨부를 함께 보낼 수 없습니다.",
    };
  if (active.length >= MAX_CHAT_ATTACHMENTS)
    return {
      allowed: false,
      message: `첨부는 최대 ${MAX_CHAT_ATTACHMENTS}개까지 가능합니다.`,
    };
  return { allowed: true };
}

export function canAddAudio(
  items: readonly MediaAttachmentQueueItem[],
): CompositionCheck {
  const active = activeItems(items);
  if (active.length > 0)
    return {
      allowed: false,
      message: "음성 파일은 다른 첨부 없이 한 개만 보낼 수 있습니다.",
    };
  return { allowed: true };
}

/** A bodyless send is only ever offered once every active attachment is confirmed. */
export function isSendableWithoutBody(
  items: readonly MediaAttachmentQueueItem[],
): boolean {
  const active = activeItems(items);
  return (
    active.length > 0 && active.every((item) => item.status === "confirmed")
  );
}
