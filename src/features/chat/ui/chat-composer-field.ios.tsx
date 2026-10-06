import { forwardRef, useImperativeHandle, useRef } from "react";
import { useWindowDimensions } from "react-native";
import { Host } from "@expo/ui";
import { TextField } from "@expo/ui/swift-ui";
import type { TextFieldRef } from "@expo/ui/swift-ui";
import { accessibilityLabel, lineLimit } from "@expo/ui/swift-ui/modifiers";

import { ChatComposerField as ChatComposerFieldFallback } from "./chat-composer-field-fallback";
import { COMPOSER_TEXT_FIELD_IMPL } from "./chat-composer-field-impl";
import type {
  ChatComposerFieldHandle,
  ChatComposerFieldProps,
} from "./chat-composer-field.types";
import {
  COMPOSER_LINE_LIMIT_MIN,
  composerMaxLines,
} from "./composer-max-lines";

/**
 * W2 (decided, default): a native SwiftUI `TextField(axis: .vertical)`
 * capped to 1-5 visible lines via the `lineLimit` modifier. The native text
 * buffer owns display state -- `onTextChange` only mirrors the current text
 * up for the composer's send/disabled logic; the field never re-feeds
 * `value` into the native buffer on every keystroke.
 *
 * Return only inserts a newline: per the SwiftUI `TextField` docs, `onSubmit`
 * fires on Return only for the default single-line/horizontal axis -- a
 * vertical-axis field inserts a newline instead. This file never attaches
 * the `onSubmit` modifier, so there is no code path that could wire Return
 * to send (E11). Clearing after a successful send is the imperative
 * `ref.clear()` contract (`ChatComposerFieldHandle`); see
 * `use-chat-composer.ts`.
 */
const NativeChatComposerField = forwardRef<
  ChatComposerFieldHandle,
  ChatComposerFieldProps
>(function NativeChatComposerField(
  {
    onChangeText,
    onFocus,
    onBlur,
    placeholder,
    accessibilityLabel: label,
    testID,
  },
  ref,
) {
  const nativeRef = useRef<TextFieldRef>(null);
  const { fontScale } = useWindowDimensions();
  useImperativeHandle(ref, () => ({
    clear: () => {
      void nativeRef.current?.clear();
    },
    focus: () => {
      void nativeRef.current?.focus();
    },
  }));
  return (
    // Content-height host, stretched across the capsule and centered in it
    // by the capsule's own layout (a `flex: 1` host pinned the text field to
    // the capsule's top edge on device).
    <Host
      matchContents={{ vertical: true }}
      style={{ alignSelf: "stretch" }}
      testID={testID}
    >
      <TextField
        axis="vertical"
        modifiers={[
          accessibilityLabel(label),
          // C15: `max` used to be a fixed `5` regardless of Dynamic Type -- at
          // large accessibility sizes five lines grew far taller than the
          // capsule's fixed 120pt cap (`appChatComposer.maxHeight`) and
          // spilled above it instead of scrolling inside the field.
          // `composerMaxLines` (`./composer-max-lines`) derives a fontScale-
          // aware max so the field's max height always stays within the cap;
          // see that file for the grounded constants and arithmetic.
          lineLimit({
            max: composerMaxLines(fontScale),
            min: COMPOSER_LINE_LIMIT_MIN,
          }),
        ]}
        onFocusChange={(focused) => (focused ? onFocus?.() : onBlur?.())}
        onTextChange={onChangeText}
        placeholder={placeholder}
        ref={nativeRef}
      />
    </Host>
  );
});

/** Falls back to the RN `TextInput` when `COMPOSER_TEXT_FIELD_IMPL === "rn"`. */
export const ChatComposerField = forwardRef<
  ChatComposerFieldHandle,
  ChatComposerFieldProps
>(function ChatComposerField(props, ref) {
  if (COMPOSER_TEXT_FIELD_IMPL === "rn") {
    return <ChatComposerFieldFallback ref={ref} {...props} />;
  }
  return <NativeChatComposerField {...props} ref={ref} />;
});
