import { useCallback, useRef, useState } from "react";
import { useFocusEffect } from "expo-router";

import { useMediaAccess } from "@/features/media/model/use-media-access";
import {
  useMediaGeneration,
  useMediaRuntime,
} from "@/features/media/model/media-runtime";
import {
  allocateDownloadDestination,
  removeDownloadedFile,
} from "@/features/media/platform/media-downloads";
import { downloadToFile } from "@/features/media/platform/media-object-transfer";
import { shareOrSaveLocalFile } from "@/features/media/platform/media-share";

export type MediaShareStatus = "idle" | "downloading" | "sharing" | "error";

export type ShareableAttachment = Readonly<{
  id: string;
  filename: string | null;
  type: string;
}>;

/**
 * R2/R3 save-and-share entry point, used by the message context menu
 * (chat-list) and the full-screen viewer's share/save button: resolves the
 * MD5 access redirect, streams it into an app-owned temp file, then hands
 * it to the OS share sheet (`Sharing.shareAsync`, which covers both
 * "share" and "save to device" -- there is no separate save-only path).
 *
 * Deliberately re-implements `ui/use-media-download.ts`'s MD5 flow instead
 * of importing it: `ui/` depends on `model/`, never the reverse, and this
 * file lives in `model/` per the round-2 contract
 * (`api_contracts.app_chat_parallel_interfaces.menuActionApi.saveShare`).
 */
export function useMediaSharing() {
  const runtime = useMediaRuntime();
  const access = useMediaAccess();
  const generation = useMediaGeneration(runtime);
  const operationRef = useRef({
    active: false,
    controller: null as AbortController | null,
  });
  const [status, setStatus] = useState<MediaShareStatus>("idle");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useFocusEffect(
    useCallback(() => {
      const operation = operationRef.current;
      operation.active = true;
      const cancel = () => operation.controller?.abort();
      const unsubscribe = runtime?.subscribeInvalidation(cancel);
      return () => {
        operation.active = false;
        cancel();
        unsubscribe?.();
      };
    }, [runtime]),
  );

  const shareAttachment = useCallback(
    async (attachment: ShareableAttachment) => {
      const operation = operationRef.current;
      if (
        !runtime ||
        !access ||
        !operation.active ||
        !runtime.isCurrent(generation) ||
        operation.controller
      ) {
        // Already sharing (busy), or the runtime went away -- never queue a
        // second concurrent share ("진행 중 중복 방지").
        return;
      }
      const controller = new AbortController();
      operation.controller = controller;
      const current = () =>
        operation.active &&
        !controller.signal.aborted &&
        runtime.isCurrent(generation);
      setStatus("downloading");
      setErrorMessage(null);
      let ownedUri: string | null = null;
      try {
        const result = await access.getAccessUrl(
          attachment.id,
          controller.signal,
        );
        if (!current()) return;
        const destination = allocateDownloadDestination({
          mediaId: attachment.id,
          filename: attachment.filename,
        });
        ownedUri = destination.uri;
        await downloadToFile({
          url: result.url,
          destination,
          expectedBytes: result.byteSize,
          signal: controller.signal,
        });
        if (!current()) return;
        setStatus("sharing");
        const outcome = await shareOrSaveLocalFile(
          destination.uri,
          attachment.type,
          controller.signal,
        );
        if (outcome.status === "unavailable" && current()) {
          setStatus("error");
          setErrorMessage("이 기기에서는 파일 공유·저장을 사용할 수 없습니다.");
          return;
        }
      } catch {
        if (current()) {
          setStatus("error");
          setErrorMessage("파일을 공유하지 못했습니다. 다시 시도해 주세요.");
        }
        return;
      } finally {
        if (ownedUri) removeDownloadedFile(ownedUri);
        operation.controller = null;
      }
      if (current()) setStatus("idle");
    },
    [access, runtime, generation],
  );

  return {
    available: runtime !== null && access !== null,
    busy: status === "downloading" || status === "sharing",
    status,
    errorMessage,
    shareAttachment,
  };
}
