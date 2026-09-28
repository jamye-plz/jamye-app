import { forwardRef, useImperativeHandle, useRef } from "react";
import { TextInput } from "react-native";
import type { TextInput as RNTextInput } from "react-native";

import { useAppTheme } from "@/core/theme/theme-provider";
import { appChatComposer } from "@/core/theme/tokens";
import type {
  ChatComposerFieldHandle,
  ChatComposerFieldProps,
} from "./chat-composer-field.types";

/**
 * W2 fallback: the RN `TextInput` text field, switchable via
 * `COMPOSER_TEXT_FIELD_IMPL` (`chat-composer-field-impl.ts`). Round 1 proved
 * this exact controlled-`TextInput` shape safe for Korean IME composition,
 * explicit-send-only (E11), and post-send focus/keyboard retention -- this
 * file only extracts that proven shape behind the shared
 * `ChatComposerFieldHandle` ref contract so the platform shells can swap it
 * in for the native default without duplicating markup. It renders only the
 * text input itself; the glass/M3 chrome around it is the caller's
 * responsibility (`chat-composer.ios.tsx` / `.android.tsx`).
 */
export const ChatComposerField = forwardRef<
  ChatComposerFieldHandle,
  ChatComposerFieldProps
>(function ChatComposerField(
  {
    value,
    onChangeText,
    onFocus,
    onBlur,
    placeholder,
    accessibilityLabel,
    testID,
  },
  ref,
) {
  const { colors } = useAppTheme();
  const inputRef = useRef<RNTextInput>(null);
  useImperativeHandle(ref, () => ({
    clear: () => inputRef.current?.clear(),
    focus: () => inputRef.current?.focus(),
  }));
  return (
    <TextInput
      accessibilityLabel={accessibilityLabel}
      multiline
      onBlur={onBlur}
      onChangeText={onChangeText}
      onFocus={onFocus}
      placeholder={placeholder}
      placeholderTextColor={colors.placeholder as string}
      ref={inputRef}
      style={{
        backgroundColor: "transparent",
        color: colors.text,
        flex: 1,
        fontSize: 16,
        lineHeight: 22,
        maxHeight: appChatComposer.maxHeight,
        minHeight: appChatComposer.minHeight,
        paddingHorizontal: 16,
        paddingVertical: 12,
      }}
      testID={testID}
      value={value}
    />
  );
});
