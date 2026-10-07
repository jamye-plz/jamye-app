import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AccessibilityInfo } from "react-native";

import { getPublicEnv } from "@/core/config/public-env";
import {
  AVATAR_CLEAR_VALUE,
  AVATAR_CONTENT_TYPE,
  classifyAvatarUploadError,
} from "@/core/contracts/server";
import { useSession } from "@/core/providers/session-provider";
import { createAccountApi } from "@/features/account/data/account-api";
import {
  pickAvatarPhoto,
  type StagedAvatarFile,
} from "@/features/account/platform/avatar-photo";
import { createNativeMediaObjectPutPort } from "@/features/media/platform/media-object-transfer";

import {
  AVATAR_ANNOUNCEMENTS,
  avatarFailure,
  type AvatarFailure,
} from "./avatar-upload-failure";

export type AvatarUploadPhase =
  "idle" | "picking" | "uploading" | "clearing" | "failed";

export type AvatarUploadController = Readonly<{
  phase: AvatarUploadPhase;
  /** True while picking, uploading or clearing: every control is disabled. */
  busy: boolean;
  /** 0..1 while the PUT is running, otherwise null. */
  progress: number | null;
  failure: AvatarFailure | null;
  hasAvatar: boolean;
  selectPhoto: () => Promise<void>;
  resetToDefault: () => Promise<void>;
  /** `다시 시도`: repeats the failed action (re-uploads the kept photo). */
  retry: () => Promise<void>;
  dismissFailure: () => void;
}>;

type KeptPhoto = Readonly<{ file: StagedAvatarFile; release: () => void }>;
type LastAction = "select" | "reset";

class AvatarFailureSignal extends Error {
  constructor(readonly failure: AvatarFailure) {
    super(failure.kind);
  }
}

function announce(message: string): void {
  try {
    AccessibilityInfo.announceForAccessibility(message);
  } catch {
    // Announcing is best effort and must never affect the upload.
  }
}

function transferFailureKind(error: unknown): AvatarFailure["kind"] | null {
  if (typeof error !== "object" || error === null || !("reason" in error))
    return null;
  const { reason } = error as { reason?: unknown };
  if (reason === "network" || reason === "http_status") return "network";
  if (reason === "invalid_file" || reason === "size_limit")
    return "upload_failed";
  return null;
}

function failureFor(error: unknown): AvatarFailure {
  if (error instanceof AvatarFailureSignal) return error.failure;
  const transfer = transferFailureKind(error);
  if (transfer) return avatarFailure(transfer);
  const kind = classifyAvatarUploadError(error);
  return avatarFailure(kind === "cancelled" ? "unknown" : kind);
}

/**
 * AV-AC3: profile-photo upload and reset for the account screen.
 *
 * select: pick/crop/re-encode (platform adapter) -> U4 start -> native PUT of
 * the staged 512px JPEG (`image/jpeg`) -> U5 finalize -> `applyProfile(User)`.
 * reset: U2 `{avatar_url: ""}` -> `applyProfile`. One run at a time (a
 * synchronous ref blocks duplicate taps), progress for the PUT, a Korean
 * failure reason (never a server code) with `다시 시도`, and unmount aborts the
 * in-flight request, drops its result and deletes the staged file.
 */
export function useAvatarUpload(): AvatarUploadController {
  const session = useSession();
  const origin = session.principal?.origin ?? null;
  // U4's presigned PUT URL is verified against the configured media origin.
  const api = useMemo(
    () =>
      origin ? createAccountApi(origin, getPublicEnv().mediaOrigin) : null,
    [origin],
  );
  const putPort = useMemo(() => createNativeMediaObjectPutPort(), []);
  const hasAvatar = Boolean(session.state.profile?.avatarUrl);

  const [phase, setPhase] = useState<AvatarUploadPhase>("idle");
  const [progress, setProgress] = useState<number | null>(null);
  const [failure, setFailure] = useState<AvatarFailure | null>(null);

  const { authorizedRequest, applyProfile } = session;
  // The callbacks below stay identity-stable and read the newest session
  // functions and avatar state through this ref (updated after each commit).
  const latest = useRef({
    api,
    putPort,
    hasAvatar,
    authorizedRequest,
    applyProfile,
  });
  useEffect(() => {
    latest.current = {
      api,
      putPort,
      hasAvatar,
      authorizedRequest,
      applyProfile,
    };
  });
  const mounted = useRef(true);
  const busyRef = useRef(false);
  const abortRef = useRef<AbortController | null>(null);
  const keptRef = useRef<KeptPhoto | null>(null);
  const lastActionRef = useRef<LastAction>("select");

  const discardKept = useCallback(() => {
    const kept = keptRef.current;
    keptRef.current = null;
    kept?.release();
  }, []);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      abortRef.current?.abort();
      discardKept();
    };
  }, [discardKept]);

  const settle = useCallback(
    (next: { phase: AvatarUploadPhase; failure?: AvatarFailure | null }) => {
      if (!mounted.current) return;
      setPhase(next.phase);
      setProgress(null);
      setFailure(next.failure ?? null);
    },
    [],
  );

  /** Runs `body` as the single in-flight operation (a no-op while busy). */
  const exclusive = useCallback(
    async (body: (controller: AbortController) => Promise<void>) => {
      if (busyRef.current) return;
      busyRef.current = true;
      const controller = new AbortController();
      abortRef.current = controller;
      try {
        await body(controller);
      } finally {
        if (abortRef.current === controller) abortRef.current = null;
        busyRef.current = false;
      }
    },
    [],
  );

  const uploadPhoto = useCallback(
    async (photo: KeptPhoto, controller: AbortController) => {
      const { file, release } = photo;
      let keep = false;
      if (mounted.current) {
        setPhase("uploading");
        setProgress(0);
        setFailure(null);
        announce(AVATAR_ANNOUNCEMENTS.uploading);
      }
      try {
        const deps = latest.current;
        const api = deps.api;
        if (!api) throw new AvatarFailureSignal(avatarFailure("unknown"));
        const intent = await deps.authorizedRequest(
          (accessToken, signal) =>
            api.startAvatarUpload(accessToken, file.byteSize, signal),
          controller.signal,
        );
        const result = await deps.putPort.put({
          url: intent.put.url,
          file: {
            uri: file.uri,
            name: "avatar.jpg",
            byteSize: file.byteSize,
            contentType: AVATAR_CONTENT_TYPE,
            width: null,
            height: null,
          },
          signal: controller.signal,
          onProgress: (sent, total) => {
            if (mounted.current && !controller.signal.aborted && total > 0)
              setProgress(Math.min(1, sent / total));
          },
        });
        if (result.status < 200 || result.status >= 300)
          throw new AvatarFailureSignal(avatarFailure("upload_failed"));
        const profile = await deps.authorizedRequest(
          (accessToken, signal) =>
            api.finalizeAvatarUpload(accessToken, intent.uploadId, signal),
          controller.signal,
        );
        if (controller.signal.aborted || !mounted.current) return;
        deps.applyProfile(profile);
        settle({ phase: "idle" });
        announce(AVATAR_ANNOUNCEMENTS.changed);
      } catch (error) {
        if (controller.signal.aborted || !mounted.current) return;
        const next = failureFor(error);
        if (next.retryable) {
          keep = true;
          keptRef.current = photo;
        }
        settle({ phase: "failed", failure: next });
      } finally {
        if (!keep) release();
      }
    },
    [settle],
  );

  const selectPhoto = useCallback(async () => {
    if (busyRef.current || !latest.current.api) return;
    await exclusive(async (controller) => {
      lastActionRef.current = "select";
      discardKept();
      setPhase("picking");
      setFailure(null);
      const selection = await pickAvatarPhoto();
      if (selection.status === "ready") {
        if (!mounted.current || controller.signal.aborted) {
          selection.release();
          return;
        }
        await uploadPhoto(
          { file: selection.file, release: selection.release },
          controller,
        );
        return;
      }
      if (!mounted.current) return;
      if (selection.status === "cancelled") {
        settle({ phase: "idle" });
      } else if (selection.status === "permission_denied") {
        settle({
          phase: "failed",
          failure: avatarFailure("permission_denied"),
        });
      } else if (selection.status === "too_large") {
        settle({ phase: "failed", failure: avatarFailure("too_large") });
      } else {
        settle({ phase: "failed", failure: avatarFailure("pick_failed") });
      }
    });
  }, [discardKept, exclusive, settle, uploadPhoto]);

  const clearAvatar = useCallback(
    async (controller: AbortController) => {
      lastActionRef.current = "reset";
      setPhase("clearing");
      setFailure(null);
      try {
        const deps = latest.current;
        const api = deps.api;
        if (!api) throw new AvatarFailureSignal(avatarFailure("unknown"));
        const profile = await deps.authorizedRequest(
          (accessToken, signal) =>
            api.updateProfile(
              accessToken,
              { avatarUrl: AVATAR_CLEAR_VALUE },
              signal,
            ),
          controller.signal,
        );
        if (controller.signal.aborted || !mounted.current) return;
        deps.applyProfile(profile);
        settle({ phase: "idle" });
        announce(AVATAR_ANNOUNCEMENTS.reset);
      } catch (error) {
        if (controller.signal.aborted || !mounted.current) return;
        settle({ phase: "failed", failure: failureFor(error) });
      }
    },
    [settle],
  );

  const resetToDefault = useCallback(async () => {
    if (busyRef.current || !latest.current.api || !latest.current.hasAvatar)
      return;
    await exclusive(async (controller) => {
      discardKept();
      await clearAvatar(controller);
    });
  }, [clearAvatar, discardKept, exclusive]);

  const retry = useCallback(async () => {
    if (busyRef.current || !latest.current.api) return;
    if (lastActionRef.current === "reset") {
      await exclusive((controller) => clearAvatar(controller));
      return;
    }
    const kept = keptRef.current;
    if (!kept) {
      await selectPhoto();
      return;
    }
    keptRef.current = null;
    await exclusive((controller) => uploadPhoto(kept, controller));
  }, [clearAvatar, exclusive, selectPhoto, uploadPhoto]);

  const dismissFailure = useCallback(() => {
    discardKept();
    settle({ phase: "idle" });
  }, [discardKept, settle]);

  return {
    phase,
    busy: phase === "picking" || phase === "uploading" || phase === "clearing",
    progress,
    failure,
    hasAvatar,
    selectPhoto,
    resetToDefault,
    retry,
    dismissFailure,
  };
}
