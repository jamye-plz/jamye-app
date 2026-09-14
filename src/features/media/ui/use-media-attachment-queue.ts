import { useCallback, useMemo, useState } from "react";

import { canAddAudio, canAddImageOrVideo } from "./media-composition";
import type {
  MediaAttachmentController,
  MediaAttachmentQueueItem,
} from "./media-attachment-types";
import { useMediaPicker } from "./use-media-picker";

export type MediaAttachmentQueueError = Readonly<{ message: string }> | null;

const EMPTY_ITEMS: readonly MediaAttachmentQueueItem[] = [];

/**
 * Composer-facing wrapper: owns picking + local composition guards, and forwards
 * accepted staged assets to an injected `MediaAttachmentController` (the actual
 * upload/state-machine owner — see `media-attachment-types.ts`). With no controller
 * supplied, every action is a no-op and the queue is always empty, preserving
 * text-only operation when media is unavailable.
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
    const outcome = await picker.pickImageOrVideoAsset();
    if (outcome.status === "staged") {
      setLastError(null);
      controller.addImageOrVideo(outcome.asset);
    } else if (outcome.status === "rejected") {
      setLastError({ message: outcome.message });
    } else if (outcome.status === "permission_denied") {
      setLastError({
        message: outcome.canAskAgain
          ? "사진·동영상 접근 권한이 필요합니다."
          : "사진·동영상 접근 권한이 거부되었습니다. 기기 설정에서 Jamye의 사진 접근을 허용해 주세요.",
      });
    }
  }, [controller, items, picker]);

  const addAudio = useCallback(async () => {
    if (!controller) return;
    const check = canAddAudio(items);
    if (!check.allowed) {
      setLastError({ message: check.message });
      return;
    }
    const outcome = await picker.pickAudioAsset();
    if (outcome.status === "staged") {
      setLastError(null);
      controller.addAudio(outcome.asset);
    } else if (outcome.status === "rejected") {
      setLastError({ message: outcome.message });
    }
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
    addAudio,
    cancel: controller?.cancel ?? (() => undefined),
    retry: controller?.retry ?? (() => undefined),
    remove: controller?.remove ?? (() => undefined),
  };
}
