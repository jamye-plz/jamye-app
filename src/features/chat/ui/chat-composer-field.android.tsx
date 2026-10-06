import { forwardRef, useImperativeHandle, useRef } from "react";
import { RNHostView } from "@expo/ui";
import { Shape, Text, TextField } from "@expo/ui/jetpack-compose";
import type { TextFieldRef } from "@expo/ui/jetpack-compose";
import {
  semantics,
  testID as testIdModifier,
  weight,
} from "@expo/ui/jetpack-compose/modifiers";

import { useAppThemeOrSystem } from "@/core/theme/theme-provider";
import { androidThemeColors } from "@/core/theme/tokens";
import { COMPOSER_TEXT_FIELD_IMPL } from "./chat-composer-field-impl";
import { ChatComposerField as ChatComposerFieldFallback } from "./chat-composer-field-fallback";
import type {
  ChatComposerFieldHandle,
  ChatComposerFieldProps,
} from "./chat-composer-field.types";
import {
  COMPOSER_LINE_LIMIT_MAX,
  COMPOSER_LINE_LIMIT_MIN,
} from "./composer-max-lines";

// W1: a rounded filled field (no underline indicator), like Messages.
const FIELD_CORNER_RADIUS = 24;

/**
 * W2 (decided, default): a native Material3 `TextField` (filled, muted
 * surface tone) capped at 5 lines. A direct Compose child of the caller's
 * `Row` (`chat-composer.android.tsx` owns the single outer `Host` -- a field
 * does not get its own nested `Host`; that both breaks Compose's `Row`
 * weight-based sizing and error's the SwiftUI-only `modifiers` prop off the
 * universal root `Host` type), sized via the `weight(1)` modifier so it
 * fills the row like the other siblings size themselves.
 *
 * Mirrors the SwiftUI variant's contract: the native buffer owns display
 * state, `onValueChange` only mirrors text up, and clearing after a
 * successful send goes through `ref.clear()` (`ChatComposerFieldHandle`).
 * Compose's `TextField` has no dedicated "submit" callback wired here --
 * multiline input's hardware/IME return key inserts a newline by default,
 * and this file never wires `keyboardActions.onDone/onSend`, so there is no
 * path that could turn Return into a send (E11).
 *
 * `@expo/ui/jetpack-compose`'s `TextField` has no dedicated accessibility-
 * name prop; A11YF-AC2 wires the Korean `accessibilityLabel` through the
 * `semantics({ contentDescription })` modifier (TalkBack name) and `testID`
 * through the `testID(...)` modifier (`node_modules/@expo/ui/build/jetpack-
 * compose/modifiers/index.d.ts`), the same escape hatch `ListItem`/`Switch`
 * use elsewhere in this app.
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
  const { colorScheme } = useAppThemeOrSystem();
  const hex = androidThemeColors(colorScheme);
  const nativeRef = useRef<TextFieldRef>(null);
  useImperativeHandle(ref, () => ({
    clear: () => {
      void nativeRef.current?.clear();
    },
    focus: () => {
      void nativeRef.current?.focus();
    },
  }));
  return (
    <TextField
      colors={{
        focusedContainerColor: hex.surfaceMuted,
        focusedIndicatorColor: "transparent",
        unfocusedContainerColor: hex.surfaceMuted,
        unfocusedIndicatorColor: "transparent",
      }}
      maxLines={COMPOSER_LINE_LIMIT_MAX}
      minLines={COMPOSER_LINE_LIMIT_MIN}
      modifiers={[
        weight(1),
        semantics({ contentDescription: label }),
        ...(testID ? [testIdModifier(testID)] : []),
      ]}
      onFocusChanged={(focused) => (focused ? onFocus?.() : onBlur?.())}
      onValueChange={onChangeText}
      ref={nativeRef}
      shape={Shape.RoundedCorner({
        cornerRadii: {
          bottomEnd: FIELD_CORNER_RADIUS,
          bottomStart: FIELD_CORNER_RADIUS,
          topEnd: FIELD_CORNER_RADIUS,
          topStart: FIELD_CORNER_RADIUS,
        },
      })}
    >
      {/* Compose slots take Compose content: a bare string here is an RN
          text node outside <Text> and throws on device. */}
      <TextField.Placeholder>
        <Text color={hex.textMuted}>{placeholder}</Text>
      </TextField.Placeholder>
    </TextField>
  );
});

/** Falls back to the RN `TextInput`, hosted via `RNHostView`, when
 * `COMPOSER_TEXT_FIELD_IMPL === "rn"`. */
export const ChatComposerField = forwardRef<
  ChatComposerFieldHandle,
  ChatComposerFieldProps
>(function ChatComposerField(props, ref) {
  if (COMPOSER_TEXT_FIELD_IMPL === "rn") {
    return (
      <RNHostView modifiers={[weight(1)]}>
        <ChatComposerFieldFallback ref={ref} {...props} />
      </RNHostView>
    );
  }
  return <NativeChatComposerField {...props} ref={ref} />;
});
