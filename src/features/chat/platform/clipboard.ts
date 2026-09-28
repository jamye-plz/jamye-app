import * as Clipboard from "expo-clipboard";
import * as Haptics from "expo-haptics";

/**
 * R2 `복사` sanctioned import point for `expo-clipboard`/`expo-haptics`
 * (`eslint.config.js` `FORBIDDEN_PERSISTENCE_MODULES` comment: "expo-haptics
 * and expo-clipboard -> src/features/chat/platform/** (voice record bar
 * haptics and R2 message-copy)"). `chat-message-row.tsx` (a `ui/` file) may
 * not import either package directly and calls this wrapper instead.
 *
 * iOS gets a light success haptic on copy (common-rules: "expo-haptics는
 * iOS에서만 호출한다"); Android has no OS-level haptic for this gesture, so
 * the call is a no-op there.
 */
export async function copyMessageBodyToClipboard(body: string): Promise<void> {
  await Clipboard.setStringAsync(body);
  if (process.env.EXPO_OS === "ios") {
    void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
  }
}
