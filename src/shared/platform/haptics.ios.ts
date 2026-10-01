import * as Haptics from "expo-haptics";

/**
 * C9/E7c/GROUPS-AC4: shared iOS-only selection haptic. Mirrors the existing
 * `src/features/chat/platform/haptics.ios.ts` voice-recording wrapper's
 * shape (a thin async function over `expo-haptics`) so both the chat
 * composer and this shared module stay the two sanctioned `expo-haptics`
 * import points (C9's lint-scope note). Android resolves to
 * `haptics.android.ts` (no-op); a bare import resolves here via
 * `haptics.ts` for `tsc`.
 */
export async function selectionAsync(): Promise<void> {
  await Haptics.selectionAsync();
}
