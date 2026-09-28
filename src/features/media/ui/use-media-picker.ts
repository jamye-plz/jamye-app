import { useCallback, useRef, useState } from "react";
import { useFocusEffect } from "expo-router";
import { useMediaRuntime } from "../model/media-runtime";

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

/**
 * Picker + local-policy-validation + app-owned staging, independent of any
 * upload controller. Reused by the chat attachment queue and the topic image
 * action. W3/E9: image/video only -- audio no longer has a picker path here;
 * voice is captured by the recorder (`chat-composer-recorder.ts`) instead.
 */
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

  const pickImageOrVideoAssets = useCallback(
    async (selectionLimit: number): Promise<readonly MediaPickOutcome[]> => {
      const selection = selectionRef.current;
      if (
        !runtime ||
        !selection.active ||
        selection.busy ||
        selectionLimit <= 0 ||
        !runtime.isCurrent(runtime.captureGeneration())
      )
        return [{ status: "cancelled" }];
      selection.busy = true;
      const revision = selection.revision;
      // Picker dialogs may background the app. Accept only a return to the SAME
      // account/target in the foreground; never resume a stale selection.
      const current = () =>
        selection.active &&
        selection.revision === revision &&
        runtime.isCurrent(runtime.captureGeneration());
      setBusy(true);
      try {
        const picked = await pickImageOrVideo(selectionLimit);
        if (!current()) return [{ status: "cancelled" }];
        if (picked.status === "cancelled") return [{ status: "cancelled" }];
        if (picked.status === "permission_denied")
          return [
            { status: "permission_denied", canAskAgain: picked.canAskAgain },
          ];
        const outcomes = await Promise.all(
          picked.items.map(async ({ asset, release }) => {
            try {
              const outcome = await stageAndValidate(scope, {
                sourceUri: asset.uri,
                contentType: asset.mimeType,
                filename: asset.fileName,
                width: asset.width || null,
                height: asset.height || null,
                durationSeconds:
                  asset.durationMs != null ? asset.durationMs / 1000 : null,
              });
              if (!current()) {
                if (outcome.status === "staged")
                  removeStagedFile(outcome.asset.uri);
                return { status: "cancelled" } as const;
              }
              return outcome;
            } finally {
              release?.();
            }
          }),
        );
        return outcomes;
      } catch {
        return current()
          ? [
              {
                status: "rejected",
                message:
                  "파일을 선택하거나 준비하지 못했습니다. 다시 시도해 주세요.",
              },
            ]
          : [{ status: "cancelled" }];
      } finally {
        selection.busy = false;
        if (selection.active) setBusy(false);
      }
    },
    [scope, runtime],
  );

  return { busy, pickImageOrVideoAssets };
}
