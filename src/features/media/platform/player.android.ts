import { useCallback, useEffect, useMemo, useRef } from "react";
import {
  setAudioModeAsync,
  useAudioPlayer,
  useAudioPlayerStatus,
} from "expo-audio";

/**
 * Minimal single-clip playback for the composer's own just-recorded preview
 * (V1's "미리 듣기 막대", task-app-composer). See `player.ios.ts` for why
 * this coexists with `useVoicePlaybackSession` below (task-app-media, V2
 * chat bubbles) instead of one replacing the other -- both round-2 tasks
 * needed this same file path.
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
    else player.play();
  }, [player, uri]);

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
 * V2 voice-message playback session, Android: same `expo-audio` player-hook
 * shape as `player.ios.ts` (create-with-no-source, then imperative
 * `player.replace({ uri })` once the MD4-downloaded local file is ready).
 * Kept as a separate file per platform (rather than one shared `player.ts`)
 * to match the repo's native-module-wrapper convention and leave room for a
 * platform-specific audio-session tweak later without touching iOS.
 * `playsInSilentMode` has no Android equivalent (there is no hardware mute
 * switch) but is harmless to request; `setAudioModeAsync` is still called
 * once per process so both platforms share one code path.
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
      play: () => unlessReleased(() => player.play()),
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
