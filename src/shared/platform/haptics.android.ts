/**
 * C9/E7c/GROUPS-AC4: Android no-op sibling of `haptics.ios.ts`. The M17
 * date-chip selection haptic is iOS-only (matching the voice-recording
 * haptics precedent, `src/features/chat/platform/haptics.*`); this keeps
 * `topic-date-chips.ios.tsx`'s call site (and any future platform-neutral
 * caller) safe to invoke unconditionally without an `EXPO_OS` branch.
 */
export function selectionAsync(): Promise<void> {
  return Promise.resolve();
}
