/**
 * W2 (user decision): the composer's text field defaults to the
 * platform-native SwiftUI/Jetpack Compose text field. The RN `TextInput`
 * implementation (`chat-composer-field-fallback.tsx`) is kept as a
 * switchable fallback -- jest cannot exercise the real native text buffer's
 * on-device IME composition, Return-key, or post-send focus/keyboard
 * behavior, so task-app-device flips this single constant to `"rn"` if
 * on-device verification finds a native regression, without another code
 * change or a redeploy of the composer shell.
 */
export type ComposerTextFieldImpl = "native" | "rn";

export const COMPOSER_TEXT_FIELD_IMPL: ComposerTextFieldImpl = "native";
