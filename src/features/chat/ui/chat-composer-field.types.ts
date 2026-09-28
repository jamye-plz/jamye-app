/**
 * Shared prop/handle contract for the composer's text field, implemented by
 * three interchangeable components: `chat-composer-field.ios.tsx` (native
 * SwiftUI `TextField` by default), `chat-composer-field.android.tsx` (native
 * Jetpack Compose `TextField` by default), and `chat-composer-field-fallback.tsx`
 * (the RN `TextInput` both platform files fall back to when
 * `COMPOSER_TEXT_FIELD_IMPL === "rn"`, see `chat-composer-field-impl.ts`).
 */
export type ChatComposerFieldProps = Readonly<{
  /**
   * Mirrors the field's current text for the composer's send/disabled logic
   * and seeds the RN fallback's controlled `value`. The native SwiftUI/
   * Compose variants let the native text buffer own display state instead of
   * re-controlling it on every keystroke -- round-tripping every keystroke
   * back through a JS-held `value` is exactly what risks breaking Korean IME
   * composition on a native field. They only read `onChangeText` to mirror
   * text up; clearing after a successful send is the imperative
   * `ChatComposerFieldHandle.clear()` contract below, not a `value` change.
   */
  value: string;
  onChangeText: (text: string) => void;
  onFocus?: () => void;
  onBlur?: () => void;
  placeholder: string;
  accessibilityLabel: string;
  testID?: string;
}>;

/** Imperative handle every field variant exposes via `ref`. */
export type ChatComposerFieldHandle = Readonly<{
  /** Clears the visible text after a successful send while keeping focus. */
  clear: () => void;
  focus: () => void;
}>;
