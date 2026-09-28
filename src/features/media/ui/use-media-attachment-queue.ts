import { useCallback, useMemo, useState } from "react";

import { MAX_CHAT_ATTACHMENTS } from "@/features/media/platform/media-policy";
import { canAddAudio, canAddImageOrVideo } from "./media-composition";
import type {
  MediaAttachmentController,
  MediaAttachmentQueueItem,
} from "./media-attachment-types";
import { useMediaPicker } from "./use-media-picker";

export type MediaAttachmentQueueError = Readonly<{ message: string }> | null;

const EMPTY_ITEMS: readonly MediaAttachmentQueueItem[] = [];

/**
 * Composer-facing wrapper: owns picking + local composition guards, and
 * forwards accepted staged assets to an injected `MediaAttachmentController`
 * (the actual upload/state-machine owner -- see `media-attachment-types.ts`).
 * With no controller supplied, every action is a no-op and the queue is
 * always empty, preserving text-only operation when media is unavailable.
 * W3/E9: audio no longer has a picker path here -- voice attachments are
 * added directly by `chat-composer-recorder.ts` through the same controller
 * (`attachmentController.addAudio`), so this hook's `items` still reflects
 * an in-flight voice upload without any code change here.
 */
export function useMediaAttachmentQueue(
  controller: MediaAttachmentController | null,
) {
  const picker = useMediaPicker("chat", controller?.scopeKey);
  const [lastError, setLastError] = useState<MediaAttachmentQueueError>(null);
  const items = useMemo(() => controller?.items ?? EMPTY_ITEMS, [controller]);

  const addImageOrVideo = useCallback(async () => {
    if (!controller) return;
    const check = canAddImageOrVideo(items);
    if (!check.allowed) {
      setLastError({ message: check.message });
      return;
    }
    const activeCount = items.filter(
      (item) => item.status !== "cancelled",
    ).length;
    const selectionLimit = Math.max(0, MAX_CHAT_ATTACHMENTS - activeCount);
    const outcomes = await picker.pickImageOrVideoAssets(selectionLimit);
    let firstErrorMessage: string | null = null;
    let stagedAny = false;
    for (const outcome of outcomes) {
      if (outcome.status === "staged") {
        stagedAny = true;
        controller.addImageOrVideo(outcome.asset);
      } else if (outcome.status === "rejected") {
        firstErrorMessage ??= outcome.message;
      } else if (outcome.status === "permission_denied") {
        firstErrorMessage ??= outcome.canAskAgain
          ? "사진·동영상 접근 권한이 필요합니다."
          : "사진·동영상 접근 권한이 거부되었습니다. 기기 설정에서 Jamye의 사진 접근을 허용해 주세요.";
      }
    }
    if (stagedAny) setLastError(null);
    else if (firstErrorMessage) setLastError({ message: firstErrorMessage });
  }, [controller, items, picker]);

  return {
    items,
    busy: picker.busy,
    lastError,
    canAddImageOrVideo:
      controller !== null &&
      controller.available !== false &&
      canAddImageOrVideo(items).allowed,
    canAddAudio:
      controller !== null &&
      controller.available !== false &&
      canAddAudio(items).allowed,
    addImageOrVideo,
    cancel: controller?.cancel ?? (() => undefined),
    retry: controller?.retry ?? (() => undefined),
    remove: controller?.remove ?? (() => undefined),
  };
}
