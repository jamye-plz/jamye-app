import { useCallback, useEffect, useMemo, useSyncExternalStore } from "react";
import { useFocusEffect } from "expo-router";
import type {
  MediaScope,
  UploadFinalizeResult,
} from "@/core/contracts/server/media";
import type {
  MediaAttachmentQueueItem,
  StagedMediaAsset,
} from "../ui/media-attachment-types";
import { toPendingAttachmentDraft } from "./media-attachment";
import { evaluateMediaContentPolicy } from "./media-policy";
import {
  createMediaUploadController,
  type MediaUploadState,
} from "./media-upload-controller";
import { useMediaRuntime, type MediaRuntime } from "./media-runtime";

function fileOf(asset: StagedMediaAsset) {
  return {
    uri: asset.uri,
    name: asset.filename,
    contentType: asset.contentType,
    byteSize: asset.byteSize,
    width: asset.width,
    height: asset.height,
  };
}

function queueItem(
  asset: StagedMediaAsset,
  state: MediaUploadState,
): MediaAttachmentQueueItem {
  const confirmed =
    state.status === "confirmed" && state.result.scope === "chat"
      ? toPendingAttachmentDraft(state.result, fileOf(asset))
      : null;
  const failed = "error" in state;
  return {
    localId: asset.localId,
    kind: asset.kind,
    filename: asset.filename,
    byteSize: asset.byteSize,
    width: asset.width,
    height: asset.height,
    duration: confirmed?.duration ?? null,
    confirmed,
    status: failed
      ? "failed"
      : state.status === "requesting_intent"
        ? "uploading"
        : state.status,
    progress:
      state.status === "uploading" && state.totalBytes > 0
        ? Math.min(1, Math.max(0, state.sentBytes / state.totalBytes))
        : 0,
    errorMessage: failed
      ? state.status === "put_expired"
        ? "업로드 주소가 만료됐습니다. 다시 시도하면 새 업로드를 시작합니다."
        : state.status === "finalize_failed"
          ? "업로드 확인에 실패했습니다. 같은 파일의 확인을 다시 시도합니다."
          : "미디어 업로드에 실패했습니다. 연결·권한·파일 형식을 확인하고 다시 시도해 주세요."
      : null,
  };
}

/** A foreground-only draft queue. Confirmed C4 commands live in the existing SQLite outbox, not here. */
export function createMediaDraftQueue(
  runtime: MediaRuntime | null,
  scope: MediaScope,
  targetId: string,
) {
  const assets = new Map<string, StagedMediaAsset>();
  const listeners = new Set<() => void>();
  let active = false;
  let allowed = false;
  let done: ((result: UploadFinalizeResult) => void) | undefined;
  let revision = 0;
  let items: readonly MediaAttachmentQueueItem[] = [];
  const publish = (next: readonly MediaAttachmentQueueItem[]) => {
    items = next;
    for (const listener of listeners) listener();
  };
  const engine = runtime
    ? createMediaUploadController({
        api: runtime.api,
        authorize: runtime.authorize,
        objectPut: runtime.objectPut,
        cleanup: runtime.cleanup,
        getGeneration: () =>
          `${runtime.accountKey}:${runtime.captureGeneration()}:${revision}`,
      })
    : null;

  const clear = () => {
    revision += 1;
    for (const id of assets.keys()) engine?.remove(id);
    assets.clear();
    if (items.length > 0) publish([]);
  };

  engine?.subscribe((id, state) => {
    const asset = assets.get(id);
    if (!asset || !active || !allowed) return;
    const next = queueItem(asset, state);
    publish(
      items.some((item) => item.localId === id)
        ? items.map((item) => (item.localId === id ? next : item))
        : [...items, next],
    );
    if (state.status === "confirmed") done?.(state.result);
  });

  const add = (asset: StagedMediaAsset) => {
    const reject = () => {
      void runtime?.cleanup.deleteIfExists(asset.uri).catch(() => undefined);
    };
    if (
      !runtime ||
      !engine ||
      !active ||
      !allowed ||
      !runtime.isCurrent(runtime.captureGeneration()) ||
      asset.scope !== scope
    ) {
      reject();
      return;
    }
    const selected = [...assets.values()];
    if (
      assets.has(asset.localId) ||
      (scope === "topic" && selected.length > 0) ||
      (scope === "chat" &&
        (selected.length >= 4 ||
          (selected.length > 0 &&
            (asset.kind === "audio" ||
              selected.some((item) => item.kind === "audio")))))
    ) {
      reject();
      return;
    }
    if (!evaluateMediaContentPolicy(scope, fileOf(asset)).ok) {
      reject();
      return;
    }
    assets.set(asset.localId, asset);
    engine.start({
      draftId: asset.localId,
      scope,
      targetId,
      file: fileOf(asset),
    });
  };

  const retry = (id: string) => {
    if (!allowed || !active || !runtime?.isCurrent(runtime.captureGeneration()))
      return;
    if (engine?.getState(id)?.status === "put_expired")
      engine.retryWithNewIntent(id);
    else engine?.retry(id);
  };
  const remove = (id: string) => {
    engine?.remove(id);
    assets.delete(id);
    publish(items.filter((item) => item.localId !== id));
  };
  return {
    scopeKey: targetId,
    getSnapshot: () => items,
    subscribe: (listener: () => void) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    setActive: (value: boolean) => {
      active = value;
      if (!value) clear();
    },
    configure: (value: boolean, handler?: typeof done) => {
      allowed = value;
      done = handler;
      if (!value) clear();
    },
    dispose: () => {
      engine?.dispose();
      assets.clear();
      listeners.clear();
    },
    available: runtime !== null,
    addImageOrVideo: add,
    addAudio: add,
    cancel: (id: string) => {
      engine?.cancel(id);
      remove(id);
    },
    retry,
    remove,
    clear,
  };
}

export function useMediaUploadQueue(
  scope: MediaScope,
  targetId: string,
  enabled: boolean,
  onConfirmed?: (result: UploadFinalizeResult) => void,
) {
  const runtime = useMediaRuntime();
  const store = useMemo(
    () => createMediaDraftQueue(runtime, scope, targetId),
    [runtime, scope, targetId],
  );
  const items = useSyncExternalStore(
    store.subscribe,
    store.getSnapshot,
    store.getSnapshot,
  );
  useEffect(() => {
    store.configure(enabled, onConfirmed);
  }, [store, enabled, onConfirmed]);
  useEffect(
    () => runtime?.subscribeInvalidation(store.clear),
    [runtime, store],
  );
  // Focus cleanup cancels and clears every draft on blur/unmount. Do not
  // permanently dispose this memoized engine: React may replay these effects
  // with the same store. External subscriptions are cleaned up separately.
  useFocusEffect(
    useCallback(() => {
      store.setActive(true);
      return () => store.setActive(false);
    }, [store]),
  );
  return useMemo(
    () => ({ ...store, items: enabled ? items : [] }),
    [store, items, enabled],
  );
}
