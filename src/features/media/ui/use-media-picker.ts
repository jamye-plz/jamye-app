import { useCallback, useRef, useState } from "react";
import { useFocusEffect } from "expo-router";
import { useMediaRuntime } from "../model/media-runtime";

import { pickAudioFile } from "@/features/media/platform/audio-file-picker";
import { pickImageOrVideo } from "@/features/media/platform/image-video-picker";
import { statMediaFile } from "@/features/media/platform/media-file-stat";
import {
  evaluateSelectedMedia,
  type MediaScope,
} from "@/features/media/platform/media-policy";
import {
  removeStagedFile,
  stageOwnedCopy,
} from "@/features/media/platform/media-staging";
import type { StagedMediaAsset } from "./media-attachment-types";

export type MediaPickOutcome =
  | Readonly<{ status: "staged"; asset: StagedMediaAsset }>
  | Readonly<{ status: "cancelled" }>
  | Readonly<{ status: "permission_denied"; canAskAgain: boolean }>
  | Readonly<{ status: "rejected"; message: string }>;

type CandidateFile = Readonly<{
  sourceUri: string;
  contentType: string | null;
  filename: string | null;
  width: number | null;
  height: number | null;
  durationSeconds: number | null;
  release?: () => void;
}>;

async function stageAndValidate(
  scope: MediaScope,
  candidate: CandidateFile,
): Promise<MediaPickOutcome> {
  const stat = statMediaFile(candidate.sourceUri);
  if (!stat.exists)
    return { status: "rejected", message: "파일을 읽을 수 없습니다." };

  const evaluation = evaluateSelectedMedia(scope, {
    uri: candidate.sourceUri,
    name: candidate.filename,
    byteSize: stat.byteSize,
    contentType: (candidate.contentType ?? "").toLowerCase(),
    width: candidate.width,
    height: candidate.height,
  });
  if (!evaluation.accepted)
    return { status: "rejected", message: evaluation.message };

  const staged = await stageOwnedCopy({
    sourceUri: candidate.sourceUri,
    suggestedName: candidate.filename,
  });
  return {
    status: "staged",
    asset: {
      localId: `staged:${Date.now()}:${Math.random().toString(36).slice(2, 8)}`,
      kind: evaluation.kind,
      scope,
      uri: staged.uri,
      contentType: (candidate.contentType ?? "").toLowerCase(),
      byteSize: staged.byteSize,
      filename: candidate.filename,
      width: candidate.width,
      height: candidate.height,
      durationSeconds: candidate.durationSeconds,
    },
  };
}

/** Picker + local-policy-validation + app-owned staging, independent of any upload
 * controller. Reused by the chat attachment queue and the topic image action. */
export function useMediaPicker(scope: MediaScope, scopeKey?: string) {
  const runtime = useMediaRuntime();
  const selectionRef = useRef({
    active: false,
    busy: false,
    revision: 0,
    scopeKey,
  });
  const [busy, setBusy] = useState(false);
  useFocusEffect(
    useCallback(() => {
      if (!runtime) return;
      const selection = selectionRef.current;
      selection.scopeKey = scopeKey;
      selection.active = true;
      return () => {
        selection.active = false;
        selection.revision += 1;
      };
    }, [runtime, scopeKey]),
  );

  const choose = useCallback(
    async (
      pick: () => Promise<CandidateFile | MediaPickOutcome>,
    ): Promise<MediaPickOutcome> => {
      const selection = selectionRef.current;
      if (
        !runtime ||
        !selection.active ||
        selection.busy ||
        !runtime.isCurrent(runtime.captureGeneration())
      )
        return { status: "cancelled" };
      selection.busy = true;
      const revision = selection.revision;
      // Picker dialogs may background the app. Accept only a return to the SAME
      // account/target in the foreground; never resume an in-flight upload.
      const current = () =>
        selection.active &&
        selection.revision === revision &&
        runtime.isCurrent(runtime.captureGeneration());
      setBusy(true);
      let candidate: CandidateFile | MediaPickOutcome | undefined;
      try {
        candidate = await pick();
        if (!current()) return { status: "cancelled" };
        if ("status" in candidate) return candidate;
        const outcome = await stageAndValidate(scope, candidate);
        if (!current()) {
          if (outcome.status === "staged") removeStagedFile(outcome.asset.uri);
          return { status: "cancelled" };
        }
        return outcome;
      } catch {
        return current()
          ? {
              status: "rejected",
              message:
                "파일을 선택하거나 준비하지 못했습니다. 다시 시도해 주세요.",
            }
          : { status: "cancelled" };
      } finally {
        // Only the converter's newly encoded copy is disposable, never the
        // user's/picker's original. Also release results returned after blur.
        if (candidate && !("status" in candidate)) candidate.release?.();
        selection.busy = false;
        if (selection.active) setBusy(false);
      }
    },
    [scope, runtime],
  );

  const pickImageOrVideoAsset = useCallback(
    () =>
      choose(async () => {
        const picked = await pickImageOrVideo(scope === "topic");
        if (picked.status !== "picked") return picked;
        return {
          sourceUri: picked.asset.uri,
          release: picked.release,
          contentType: picked.asset.mimeType,
          filename: picked.asset.fileName,
          width: picked.asset.width || null,
          height: picked.asset.height || null,
          durationSeconds:
            picked.asset.durationMs != null
              ? picked.asset.durationMs / 1000
              : null,
        };
      }),
    [scope, choose],
  );

  const pickAudioAsset = useCallback(
    () =>
      choose(async () => {
        const picked = await pickAudioFile();
        if (picked.status !== "picked") return picked;
        return {
          sourceUri: picked.asset.uri,
          contentType: picked.asset.mimeType,
          filename: picked.asset.fileName,
          width: null,
          height: null,
          durationSeconds: null,
        };
      }),
    [choose],
  );

  return { busy, pickImageOrVideoAsset, pickAudioAsset };
}
