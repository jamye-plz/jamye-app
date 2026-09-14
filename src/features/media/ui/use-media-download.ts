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

export type MediaDownloadStatus =
  "idle" | "downloading" | "sharing" | "error" | "unavailable";

/**
 * MD5 open/save flow: fetch the redirect target via the shared `MediaRuntime`
 * (`useMediaAccess`), stream it into an app-owned temp file with a separate
 * credential-free request (`platform/media-object-transfer.ts`), hand it to the OS
 * share/save sheet, then remove the temp file — its lifetime is bounded to this one
 * operation. Account/target generation fencing (`useMediaRuntime`) means a completion
 * after an account switch or background transition is dropped instead of surfaced.
 */
export function useMediaDownload() {
  const runtime = useMediaRuntime();
  const access = useMediaAccess();
  const generation = useMediaGeneration(runtime);
  const operationRef = useRef({
    active: false,
    controller: null as AbortController | null,
  });
  const [status, setStatus] = useState<MediaDownloadStatus>("idle");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const statusKey = `${runtime?.accountKey}:${generation}`;
  const [resultKey, setResultKey] = useState<string | null>(null);
  useFocusEffect(
    useCallback(() => {
      const operation = operationRef.current;
      operation.active = true;
      const cancel = () => {
        operation.controller?.abort();
      };
      const unsubscribe = runtime?.subscribeInvalidation(cancel);
      return () => {
        operation.active = false;
        cancel();
        unsubscribe?.();
      };
    }, [runtime]),
  );

  const openOrSave = useCallback(
    async (
      input: Readonly<{
        mediaId: string;
        filename: string | null;
        contentType: string | null;
      }>,
    ) => {
      const operation = operationRef.current;
      if (
        !runtime ||
        !access ||
        !operation.active ||
        !runtime.isCurrent(generation)
      ) {
        setResultKey(statusKey);
        setStatus("unavailable");
        return;
      }
      if (operation.controller) return;
      const controller = new AbortController();
      operation.controller = controller;
      const current = () =>
        operation.active &&
        !controller.signal.aborted &&
        runtime.isCurrent(generation);
      setResultKey(statusKey);
      setStatus("downloading");
      setErrorMessage(null);
      let ownedUri: string | null = null;
      try {
        const { location } = await access.getDownloadLocation(
          input.mediaId,
          controller.signal,
        );
        if (!current()) return;
        const destination = allocateDownloadDestination({
          mediaId: input.mediaId,
          filename: input.filename,
        });
        ownedUri = destination.uri;
        await downloadToFile({
          url: location,
          destination,
          signal: controller.signal,
        });
        if (!current()) return;
        setStatus("sharing");
        const outcome = await shareOrSaveLocalFile(
          destination.uri,
          input.contentType,
          controller.signal,
        );
        if (outcome.status === "unavailable" && current()) {
          setStatus("unavailable");
          setErrorMessage("이 기기에서는 파일 공유·저장을 사용할 수 없습니다.");
          return;
        }
      } catch {
        if (current()) {
          setStatus("error");
          setErrorMessage("파일을 열거나 저장하지 못했습니다.");
        }
        return;
      } finally {
        if (ownedUri) removeDownloadedFile(ownedUri);
        operation.controller = null;
      }
      if (current()) setStatus("idle");
    },
    [access, runtime, generation, statusKey],
  );

  return {
    available: runtime !== null && access !== null,
    status: resultKey === statusKey ? status : ("idle" as const),
    errorMessage: resultKey === statusKey ? errorMessage : null,
    openOrSave,
  };
}
