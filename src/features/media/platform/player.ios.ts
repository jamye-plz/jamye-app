import { useCallback, useEffect, useMemo, useRef } from "react";
import {
  setAudioModeAsync,
  useAudioPlayer,
  useAudioPlayerStatus,
} from "expo-audio";
import type { AudioPlayer } from "expo-audio";

/**
 * F-11: expo-audio leaves a finished clip parked at its end on both
 * platforms, so a bare `play()` ends again at once (seen on the iOS
 * simulator and the Android emulator with a real voice message). A clip
 * within this many seconds of its end replays from the start instead.
 */
const END_OF_CLIP_SECONDS = 0.05;

function playFromStartIfFinished(
  player: AudioPlayer,
  currentTime: number,
  duration: number,
): void {
  if (duration > 0 && currentTime >= duration - END_OF_CLIP_SECONDS) {
    void player.seekTo(0).then(
      () => unlessReleased(() => player.play()),
      () => undefined,
    );
    return;
  }
  player.play();
}

/**
 * Minimal single-clip playback for the composer's own just-recorded preview
 * (V1's "미리 듣기 막대", task-app-composer). Deliberately independent of
 * `useVoicePlaybackSession` below (task-app-media, V2 chat bubbles): the
 * composer's in-progress draft preview and a sent message's voice bubble
 * are different lifecycles, and `player.ts` is the one file both round-2
 * tasks needed at the same time -- see each task's result report for how
 * this was reconciled instead of one overwriting the other. This wrapper
 * does not register with `model/audio-playback-coordinator.ts`; folding it
 * in (so opening the composer while a voice bubble is playing stops that
 * bubble) is a follow-up, not required by either task's acceptance
 * criteria.
 */
export type VoicePreviewPlayer = Readonly<{
  isPlaying: boolean;
  positionMillis: number;
  durationMillis: number;
  toggle: () => void;
}>;

export function useVoicePreviewPlayer(uri: string | null): VoicePreviewPlayer {
  const source = useMemo(() => (uri ? { uri } : null), [uri]);
  const player = useAudioPlayer(source);
  const status = useAudioPlayerStatus(player);

  useEffect(() => {
    if (status.didJustFinish) player.pause();
  }, [status.didJustFinish, player]);

  const toggle = useCallback(() => {
    if (!uri) return;
    if (player.playing) player.pause();
    else playFromStartIfFinished(player, status.currentTime, status.duration);
  }, [player, uri, status.currentTime, status.duration]);

  return {
    isPlaying: player.playing,
    positionMillis: Math.max(0, status.currentTime) * 1000,
    durationMillis: Math.max(0, status.duration) * 1000,
    toggle,
  };
}

export type VoicePlaybackSession = Readonly<{
  playing: boolean;
  currentTime: number;
  duration: number;
  isLoaded: boolean;
  play: () => void;
  pause: () => void;
  seekTo: (seconds: number) => Promise<void>;
}>;

let silentModePlaybackRequested = false;

/**
 * `useAudioPlayer` releases its native player in its own unmount cleanup, and
 * the caller's cleanups (pause on blur, the one-at-a-time coordinator) can run
 * after it; every call on a released player throws ("Cannot use shared object
 * that was already released" -- a red screen on device when leaving a chat).
 * A released player has nothing left to play or pause, so it is left alone.
 */
function unlessReleased(action: () => void): void {
  try {
    action();
  } catch {
    // Released: nothing is playing any more.
  }
}

/**
 * V2 voice-message playback session (task-app-media, chat message bubbles):
 * `expo-audio`'s player hook owns the native player's lifecycle
 * (auto-disposed when the owning component unmounts, mirroring
 * `useAudioRecorder`). The hook is created with no source
 * (`useAudioPlayer(null)`) and `player.replace({ uri })` is called
 * imperatively once the MD4-downloaded local file is ready -- the same
 * create-then-replace shape `native-video-player.tsx` uses for expo-video,
 * since `uri` starts `null` while the caller is still downloading.
 *
 * `setAudioModeAsync({ playsInSilentMode: true })` is requested once per
 * process (module-level guard) so a voice message plays even with the
 * hardware silent switch on. No `interruptionMode` override is set here:
 * expo-video's player already requests exclusive (`doNotMix`) focus on its
 * own, and the app-level "only one of {voice, video} plays" rule is
 * enforced explicitly through `model/audio-playback-coordinator.ts` (this
 * hook's callers register with it), not through the OS audio session's
 * interruption handling.
 */
export function useVoicePlaybackSession(
  uri: string | null,
): VoicePlaybackSession {
  const player = useAudioPlayer(null);
  const status = useAudioPlayerStatus(player);
  const appliedUri = useRef<string | null>(null);

  useEffect(() => {
    if (silentModePlaybackRequested) return;
    silentModePlaybackRequested = true;
    void setAudioModeAsync({ playsInSilentMode: true }).catch(() => {
      // Retried on the next voice bubble mount rather than surfaced --
      // playback still works without it, only silent-mode is affected.
      silentModePlaybackRequested = false;
    });
  }, []);

  useEffect(() => {
    if (appliedUri.current === uri) return;
    appliedUri.current = uri;
    if (uri) player.replace({ uri });
  }, [uri, player]);

  return useMemo<VoicePlaybackSession>(
    () => ({
      playing: status.playing,
      currentTime: status.currentTime,
      duration: status.duration,
      isLoaded: status.isLoaded,
      play: () =>
        unlessReleased(() =>
          playFromStartIfFinished(player, status.currentTime, status.duration),
        ),
      pause: () => unlessReleased(() => player.pause()),
      seekTo: async (seconds: number) => {
        try {
          await player.seekTo(seconds);
        } catch {
          // Released while seeking: nothing left to move.
        }
      },
    }),
    [
      status.playing,
      status.currentTime,
      status.duration,
      status.isLoaded,
      player,
    ],
  );
}
