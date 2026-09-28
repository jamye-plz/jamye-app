/**
 * V2 playback coordinator: exactly one voice message (or video) plays at a
 * time, app-wide. Pure JS, no native import -- native audio calls stay
 * confined to `platform/player.ios.ts` / `platform/player.android.ts` (and
 * expo-video's `platform/native-video-player.tsx`), so this file can be
 * imported from `model/` without tripping the eslint rule that restricts
 * `expo-audio` to `src/features/media/platform/**`.
 *
 * A source registers itself (with a `stop` callback) exactly when it
 * *starts* playing. Registering evicts (stops) whatever was previously
 * registered -- this alone gives voice-to-voice one-at-a-time. It also
 * implements the recorded video/voice coexistence decision: "starting a
 * voice message stops a currently playing video". `native-video-player.tsx`
 * registers itself through the same function when its video starts
 * playing, so a voice bubble starting playback stops it exactly like it
 * would stop another voice bubble -- no direct media/video <-> media/audio
 * dependency needed, only this shared registry.
 */

type ActiveSource = Readonly<{ id: string; stop: () => void }>;

let active: ActiveSource | null = null;

/** Stops whatever is currently the single active source, if any. */
export function stopActivePlayback(): void {
  const current = active;
  if (!current) return;
  active = null;
  current.stop();
}

/**
 * Registers `id` as the active playback source, stopping the previous
 * active source first (unless it is already this same `id`). Returns an
 * unregister function -- call it once this source stops on its own
 * (pause/finish/unmount) so a later eviction does not call `stop` on a
 * source that has already stopped itself.
 */
export function registerActivePlayback(
  id: string,
  stop: () => void,
): () => void {
  if (active?.id !== id) stopActivePlayback();
  const source: ActiveSource = { id, stop };
  active = source;
  return () => {
    if (active === source) active = null;
  };
}

/** Test-only: clears module-level state between test cases. */
export function resetAudioPlaybackCoordinatorForTests(): void {
  active = null;
}
