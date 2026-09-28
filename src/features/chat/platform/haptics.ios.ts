import {
  ImpactFeedbackStyle,
  NotificationFeedbackType,
  impactAsync,
  notificationAsync,
} from "expo-haptics";

/**
 * V3: `expo-haptics` is imported only from files under
 * `src/features/chat/platform/**` (eslint rule set by task-app-native). This
 * is the iOS half of the pair -- see `haptics.android.ts` for the no-op
 * Android twin (Android never calls expo-haptics, V3). Split by platform
 * file (rather than a runtime `process.env.EXPO_OS` check in one shared
 * file) because Expo's babel config statically inlines `process.env.EXPO_OS`
 * at transform time, which a jest test cannot toggle at runtime -- the
 * project's own `*.ios`/`*.android` + `jest.requireActual` convention is the
 * only way to exercise both branches in jest.
 */
export function hapticVoiceRecordingStarted(): void {
  void impactAsync(ImpactFeedbackStyle.Medium);
}

export function hapticVoiceRecordingStopped(): void {
  void impactAsync(ImpactFeedbackStyle.Light);
}

export function hapticVoiceMessageSent(): void {
  void notificationAsync(NotificationFeedbackType.Success);
}
