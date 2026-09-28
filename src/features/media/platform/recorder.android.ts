import { useCallback, useRef } from "react";
import {
  AudioModule,
  RecordingPresets,
  setAudioModeAsync,
  useAudioRecorder,
  useAudioRecorderState,
} from "expo-audio";
import { File } from "expo-file-system";

/**
 * V1/E2 platform wrapper around expo-audio's recorder hooks. iOS and Android
 * share one implementation because expo-audio itself abstracts the native
 * recording session -- this file is still split per the project's
 * `*.ios`/`*.android` convention for native-module-touching platform files,
 * leaving room for future platform-specific divergence (e.g. interruption
 * handling). See `recorder.ios.ts` for the iOS twin -- the two are
 * intentionally identical today.
 *
 * `RecordingPresets.HIGH_QUALITY` -> AAC `.m4a`; the composer uploads the
 * result as `audio/mp4` (E2). Metering is enabled for the live level bar
 * (V1's "실시간 소리 크기 막대").
 */

export type VoiceRecorderLiveState = Readonly<{
  isRecording: boolean;
  durationMillis: number;
  /** dBFS, roughly -160 (silence) .. 0 (loud); mirrors expo-audio metering. */
  metering: number;
}>;

export type VoiceRecorderStopResult = Readonly<{
  uri: string;
  contentType: "audio/mp4";
  durationMs: number;
}>;

export type VoiceRecorderPermission = Readonly<{
  granted: boolean;
  canAskAgain: boolean;
}>;

export type VoiceRecorderEngine = Readonly<{
  state: VoiceRecorderLiveState;
  /** First tap only actually prompts the OS; a later tap after grant is a
   * no-op resolve, and a later tap after denial reports the current denial
   * without prompting again (the composer then offers "설정 열기"). */
  requestPermission: () => Promise<VoiceRecorderPermission>;
  start: () => Promise<void>;
  /** Stops and returns the take, or null if nothing was recording. */
  stop: () => Promise<VoiceRecorderStopResult | null>;
  /** Stops (if needed) and deletes the temp file without staging an upload. */
  cancel: () => void;
}>;

const RECORDER_OPTIONS = Object.freeze({
  ...RecordingPresets.HIGH_QUALITY,
  isMeteringEnabled: true,
});

/** Exported so the composer-level orchestrator can delete an already-`stop()`ed
 * take on cancel/unmount (E8) without re-implementing file cleanup. */
export function deleteVoiceRecordingFile(uri: string): void {
  try {
    const file = new File(uri);
    if (file.exists) file.delete();
  } catch {
    // Best-effort cleanup only; never throw out of a cancel/cleanup path.
  }
}

export function useVoiceRecorder(): VoiceRecorderEngine {
  const recorder = useAudioRecorder(RECORDER_OPTIONS);
  const recorderState = useAudioRecorderState(recorder, 100);
  const activeRef = useRef(false);

  const requestPermission =
    useCallback(async (): Promise<VoiceRecorderPermission> => {
      const existing = await AudioModule.getRecordingPermissionsAsync();
      if (existing.granted)
        return { granted: true, canAskAgain: existing.canAskAgain };
      const requested = await AudioModule.requestRecordingPermissionsAsync();
      return { granted: requested.granted, canAskAgain: requested.canAskAgain };
    }, []);

  const start = useCallback(async () => {
    await setAudioModeAsync({ allowsRecording: true, playsInSilentMode: true });
    await recorder.prepareToRecordAsync();
    recorder.record();
    activeRef.current = true;
  }, [recorder]);

  const stop =
    useCallback(async (): Promise<VoiceRecorderStopResult | null> => {
      if (!activeRef.current) return null;
      activeRef.current = false;
      // Read the take's length first: a stopped recorder reports 0 elapsed
      // time, which on device turned every take into "녹음이 너무 짧아요".
      const durationBeforeStop = recorder.getStatus().durationMillis;
      await recorder.stop();
      await setAudioModeAsync({
        allowsRecording: false,
        playsInSilentMode: true,
      }).catch(() => undefined);
      const uri = recorder.uri;
      if (!uri) return null;
      const durationMs = Math.max(
        durationBeforeStop,
        recorder.getStatus().durationMillis,
      );
      return { uri, contentType: "audio/mp4", durationMs };
    }, [recorder]);

  const cancel = useCallback(() => {
    const wasActive = activeRef.current;
    activeRef.current = false;
    let uri: string | null = null;
    try {
      uri = recorder.uri;
      if (wasActive) void recorder.stop().catch(() => undefined);
    } catch {
      // Leaving the room runs this after `useAudioRecorder`'s own unmount
      // cleanup has released the recorder, which then throws on any use;
      // a released recorder has already stopped.
    }
    if (wasActive)
      void setAudioModeAsync({
        allowsRecording: false,
        playsInSilentMode: true,
      }).catch(() => undefined);
    if (uri) deleteVoiceRecordingFile(uri);
  }, [recorder]);

  return {
    state: {
      isRecording: recorderState.isRecording,
      durationMillis: recorderState.durationMillis,
      metering: recorderState.metering ?? -160,
    },
    requestPermission,
    start,
    stop,
    cancel,
  };
}
