import { useCallback, useEffect, useRef, useState } from "react";
import { AppState } from "react-native";

import {
  removeStagedFile,
  stageOwnedCopy,
} from "@/features/media/platform/media-staging";
import {
  deleteVoiceRecordingFile as deleteVoiceRecordingFileIOS,
  useVoiceRecorder as useVoiceRecorderIOS,
} from "@/features/media/platform/recorder.ios";
import {
  deleteVoiceRecordingFile as deleteVoiceRecordingFileAndroid,
  useVoiceRecorder as useVoiceRecorderAndroid,
} from "@/features/media/platform/recorder.android";
import { useVoicePreviewPlayer as useVoicePreviewPlayerIOS } from "@/features/media/platform/player.ios";
import { useVoicePreviewPlayer as useVoicePreviewPlayerAndroid } from "@/features/media/platform/player.android";
import type {
  MediaAttachmentController,
  StagedMediaAsset,
} from "@/features/media/ui/media-attachment-types";
import {
  hapticVoiceMessageSent as hapticVoiceMessageSentIOS,
  hapticVoiceRecordingStarted as hapticVoiceRecordingStartedIOS,
  hapticVoiceRecordingStopped as hapticVoiceRecordingStoppedIOS,
} from "@/features/chat/platform/haptics.ios";
import {
  hapticVoiceMessageSent as hapticVoiceMessageSentAndroid,
  hapticVoiceRecordingStarted as hapticVoiceRecordingStartedAndroid,
  hapticVoiceRecordingStopped as hapticVoiceRecordingStoppedAndroid,
} from "@/features/chat/platform/haptics.android";

// `tsc` (unlike jest's moduleFileExtensions/Metro's platform resolution)
// cannot resolve a bare "./recorder"-style import across a *.ios/*.android
// pair that has no shared base file, so both are imported explicitly here
// and selected by `process.env.EXPO_OS` (inlined at build time, matching
// project convention; see `haptics.ios.ts`'s docstring for why this couldn't
// be a single runtime-branching file instead). Deleting the recorded file
// goes through the platform wrapper's own export (not a direct
// `expo-file-system` import here) -- this UI-layer file is not on the
// eslint-approved list of native-persistence-importing paths.
const IS_IOS = process.env.EXPO_OS === "ios";
const useVoiceRecorder = IS_IOS ? useVoiceRecorderIOS : useVoiceRecorderAndroid;
const useVoicePreviewPlayer = IS_IOS
  ? useVoicePreviewPlayerIOS
  : useVoicePreviewPlayerAndroid;
const deleteVoiceRecordingFile = IS_IOS
  ? deleteVoiceRecordingFileIOS
  : deleteVoiceRecordingFileAndroid;
const hapticVoiceMessageSent = IS_IOS
  ? hapticVoiceMessageSentIOS
  : hapticVoiceMessageSentAndroid;
const hapticVoiceRecordingStarted = IS_IOS
  ? hapticVoiceRecordingStartedIOS
  : hapticVoiceRecordingStartedAndroid;
const hapticVoiceRecordingStopped = IS_IOS
  ? hapticVoiceRecordingStoppedIOS
  : hapticVoiceRecordingStoppedAndroid;

/** V1 user note: app-side auto-stop at 3:00. Distinct from the server's
 * 330s duration ceiling (E2), which stays untouched. */
export const VOICE_RECORDING_MAX_MS = 180_000;
/** E2: recordings under one second are never sent. */
export const VOICE_RECORDING_MIN_MS = 1_000;
export const VOICE_TOO_SHORT_MESSAGE =
  "녹음이 너무 짧아요. 1초 이상 녹음해 주세요.";
export const VOICE_MIC_PERMISSION_DENIED_MESSAGE =
  "마이크 접근 권한이 필요합니다. 기기 설정에서 Jamye의 마이크 접근을 허용해 주세요.";
export const VOICE_PREPARE_FAILED_MESSAGE =
  "음성 메시지를 준비하지 못했어요. 다시 녹음해 주세요.";
export const VOICE_UPLOAD_FAILED_MESSAGE = "음성 메시지를 올리지 못했어요.";

export type VoiceComposerPhase = "idle" | "recording" | "preview";

type VoiceTake = Readonly<{
  uri: string;
  contentType: StagedMediaAsset["contentType"];
  durationMs: number;
}>;

export type VoiceComposerRecorder = Readonly<{
  phase: VoiceComposerPhase;
  recording: Readonly<{ elapsedMs: number; metering: number }> | null;
  preview: Readonly<{
    isPlaying: boolean;
    positionMillis: number;
    durationMillis: number;
    togglePlayback: () => void;
  }> | null;
  startRecording: () => Promise<void>;
  stopRecording: () => Promise<void>;
  /** Discards the take/draft from either "recording" or "preview". */
  cancelRecording: () => void;
  /** Composer calls this from the preview bar's send button, before the
   * normal text/media `send()` path runs (V1: haptic on send). */
  notifyVoiceMessageSent: () => void;
  /** Composer calls this from the existing `clearDraft` callback after a
   * successful send -- the attachment item is already removed by that same
   * callback; this only resets this hook's own idle/preview bookkeeping. A
   * no-op when nothing was in flight. */
  resetAfterSend: () => void;
}>;

/**
 * Orchestrates V1 (tap-to-record -> preview -> send) and V4/E8 (background
 * keeps the preview, leaving the room discards everything) on top of the
 * platform recorder/player wrappers. Lives under `chat-composer*` (not
 * `media/model`) because it owns the one cross-feature concern -- calling
 * the `chat/platform` haptics wrapper -- that `media/*` code must not import
 * directly (eslint native-module path rule).
 */
export function useChatComposerRecorder(params: {
  attachmentController: MediaAttachmentController | null;
  onPermissionDenied: () => void;
  onTooShort: () => void;
  /** The take could not be copied into app-owned staging for upload. */
  onPrepareFailed: () => void;
}): VoiceComposerRecorder {
  const {
    attachmentController,
    onPermissionDenied,
    onTooShort,
    onPrepareFailed,
  } = params;
  const recorder = useVoiceRecorder();
  const [phase, setPhase] = useState<VoiceComposerPhase>("idle");
  const [recordedUri, setRecordedUri] = useState<string | null>(null);
  const stagedLocalIdRef = useRef<string | null>(null);
  /** A take in preview whose upload waits for the app to be active again. */
  const pendingTakeRef = useRef<VoiceTake | null>(null);
  const recordedUriRef = useRef<string | null>(null);
  const phaseRef = useRef<VoiceComposerPhase>("idle");
  useEffect(() => {
    phaseRef.current = phase;
  }, [phase]);

  const preview = useVoicePreviewPlayer(recordedUri);

  const discardStagedUpload = useCallback(() => {
    const localId = stagedLocalIdRef.current;
    stagedLocalIdRef.current = null;
    if (localId) attachmentController?.remove(localId);
  }, [attachmentController]);

  const discardRecordedFile = useCallback(() => {
    const uri = recordedUriRef.current;
    recordedUriRef.current = null;
    setRecordedUri(null);
    if (uri) deleteVoiceRecordingFile(uri);
  }, []);

  const startRecording = useCallback(async () => {
    if (phaseRef.current !== "idle") return;
    const permission = await recorder.requestPermission();
    if (!permission.granted) {
      onPermissionDenied();
      return;
    }
    await recorder.start();
    setPhase("recording");
    hapticVoiceRecordingStarted();
  }, [recorder, onPermissionDenied]);

  /**
   * Stages the take and queues its upload. Uploads only read app-owned staged
   * files (as picked photos are), so the recorder's file is copied into
   * staging and itself stays for the preview player -- sending it directly
   * failed every upload before it started (device: voice messages never
   * sent). The media runtime drops uploads while the app is in the
   * background, and backgrounding is exactly what stops a take into preview
   * (V4), so such a take waits for the app to be active again; queued there,
   * the upload was silently rejected and the preview could never be sent.
   */
  const queueTake = useCallback(
    async (take: VoiceTake) => {
      pendingTakeRef.current = null;
      if (recordedUriRef.current !== take.uri) return;
      if (AppState.currentState !== "active") {
        pendingTakeRef.current = take;
        return;
      }
      const filename = `voice-${Date.now()}.m4a`;
      let staged: Awaited<ReturnType<typeof stageOwnedCopy>>;
      try {
        staged = await stageOwnedCopy({
          sourceUri: take.uri,
          suggestedName: filename,
        });
      } catch {
        if (recordedUriRef.current === take.uri) {
          discardRecordedFile();
          setPhase("idle");
        }
        onPrepareFailed();
        return;
      }
      if (recordedUriRef.current !== take.uri) {
        // Deleted or sent while the copy was being made.
        removeStagedFile(staged.uri);
        return;
      }
      if (AppState.currentState !== "active") {
        removeStagedFile(staged.uri);
        pendingTakeRef.current = take;
        return;
      }
      const localId = `voice:${Date.now()}:${Math.random().toString(36).slice(2, 8)}`;
      stagedLocalIdRef.current = localId;
      const asset: StagedMediaAsset = {
        localId,
        kind: "audio",
        scope: "chat",
        uri: staged.uri,
        contentType: take.contentType,
        byteSize: staged.byteSize,
        filename,
        width: null,
        height: null,
        durationSeconds: take.durationMs / 1000,
      };
      attachmentController?.addAudio(asset);
    },
    [attachmentController, discardRecordedFile, onPrepareFailed],
  );

  const stopRecording = useCallback(async () => {
    if (phaseRef.current !== "recording") return;
    const result = await recorder.stop();
    hapticVoiceRecordingStopped();
    if (!result) {
      setPhase("idle");
      return;
    }
    if (result.durationMs < VOICE_RECORDING_MIN_MS) {
      deleteVoiceRecordingFile(result.uri);
      onTooShort();
      setPhase("idle");
      return;
    }
    recordedUriRef.current = result.uri;
    setRecordedUri(result.uri);
    setPhase("preview");
    await queueTake(result);
  }, [recorder, onTooShort, queueTake]);

  const cancelRecording = useCallback(() => {
    pendingTakeRef.current = null;
    if (phaseRef.current === "recording") {
      recorder.cancel();
    } else if (phaseRef.current === "preview") {
      discardStagedUpload();
      discardRecordedFile();
    }
    setPhase("idle");
  }, [recorder, discardStagedUpload, discardRecordedFile]);

  const resetAfterSend = useCallback(() => {
    if (phaseRef.current === "idle") return;
    stagedLocalIdRef.current = null;
    pendingTakeRef.current = null;
    // The upload used its own staged copy; the preview's file is done.
    discardRecordedFile();
    setPhase("idle");
  }, [discardRecordedFile]);

  // V1: 180s app-side recording cap (E2 keeps the separate 330s server
  // ceiling untouched). The threshold check only schedules the stop (rather
  // than calling it synchronously) so this effect never calls setState
  // directly from its own body.
  useEffect(() => {
    if (phase !== "recording") return;
    if (recorder.state.durationMillis < VOICE_RECORDING_MAX_MS) return;
    const timeoutId = setTimeout(() => {
      void stopRecording();
    }, 0);
    return () => clearTimeout(timeoutId);
  }, [phase, recorder.state.durationMillis, stopRecording]);

  // V4/E8: backgrounding or an audio interruption (a phone call also drives
  // iOS to "inactive") stops the recording into the preview state -- the
  // take is kept, never discarded, so returning to the app can send or
  // delete it. Only leaving the room (unmount, below) discards it. The
  // subscription lives for the whole mount (latest callbacks via refs):
  // returning to the app re-renders, and a re-subscribing effect's cleanup
  // cancelled the waiting take's queueing before it ran (device).
  const stopRecordingRef = useRef(stopRecording);
  const queueTakeRef = useRef(queueTake);
  useEffect(() => {
    stopRecordingRef.current = stopRecording;
    queueTakeRef.current = queueTake;
  }, [stopRecording, queueTake]);
  useEffect(() => {
    let queueTimer: ReturnType<typeof setTimeout> | undefined;
    const subscription = AppState.addEventListener("change", (next) => {
      if (next !== "active" && phaseRef.current === "recording") {
        void stopRecordingRef.current();
      }
      const waiting = pendingTakeRef.current;
      if (next === "active" && waiting) {
        // Next tick: the media runtime's own "active" listener re-enables
        // uploads first.
        clearTimeout(queueTimer);
        queueTimer = setTimeout(() => void queueTakeRef.current(waiting), 0);
      }
    });
    return () => {
      clearTimeout(queueTimer);
      subscription.remove();
    };
  }, []);

  // E8: leaving the chat room discards both the recording and its upload
  // draft, regardless of phase. UIBackgroundModes audio is intentionally
  // not used, so nothing keeps recording once JS stops running.
  // `cancelRecording` already implements exactly this discard-from-either-
  // phase behavior; a ref indirection lets this stay a true mount/unmount-
  // only effect (empty deps, satisfying exhaustive-deps) while still
  // invoking the latest closure on unmount.
  const cancelRecordingRef = useRef(cancelRecording);
  useEffect(() => {
    cancelRecordingRef.current = cancelRecording;
  }, [cancelRecording]);
  useEffect(() => {
    return () => {
      cancelRecordingRef.current();
    };
  }, []);

  return {
    phase,
    recording:
      phase === "recording"
        ? {
            elapsedMs: recorder.state.durationMillis,
            metering: recorder.state.metering,
          }
        : null,
    preview:
      phase === "preview"
        ? {
            isPlaying: preview.isPlaying,
            positionMillis: preview.positionMillis,
            durationMillis: preview.durationMillis,
            togglePlayback: preview.toggle,
          }
        : null,
    startRecording,
    stopRecording,
    cancelRecording,
    notifyVoiceMessageSent: hapticVoiceMessageSent,
    resetAfterSend,
  };
}
