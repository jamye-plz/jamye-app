/**
 * V3: Android never calls `expo-haptics` for the voice composer (record
 * start/stop/send stay silent haptically). See `haptics.ios.ts` for the real
 * iOS implementation this mirrors the API of.
 */
export function hapticVoiceRecordingStarted(): void {
  // Intentional no-op on Android.
}

export function hapticVoiceRecordingStopped(): void {
  // Intentional no-op on Android.
}

export function hapticVoiceMessageSent(): void {
  // Intentional no-op on Android.
}
