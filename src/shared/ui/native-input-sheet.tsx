import { Text, TextInput, View } from "react-native";

import {
  isNativeInputShellSubmitDisabled,
  NativeInputShellStatusText,
} from "./native-input-shell.shared";
import type { NativeInputShellProps } from "./native-input-shell.types";

export type * from "./native-input-shell.types";

/**
 * Fallback for platforms without a native modal-sheet affordance (web).
 * iOS resolves to `native-input-sheet.ios.tsx`.
 */
export function NativeInputSheet({
  autoFocus,
  busy,
  errorText,
  helperText,
  onCancel,
  onChangeValue,
  onSubmit,
  placeholder,
  submitDisabled,
  submitLabel,
  testID,
  title,
  value,
}: NativeInputShellProps) {
  const disableSubmit = isNativeInputShellSubmitDisabled(submitDisabled, busy);
  return (
    <View testID={testID}>
      <Text accessibilityRole="header">{title}</Text>
      <TextInput
        autoFocus={autoFocus}
        editable={!busy}
        onChangeText={onChangeValue}
        placeholder={placeholder}
        value={value}
      />
      <NativeInputShellStatusText
        errorText={errorText}
        helperText={helperText}
      />
      <Text accessibilityRole="button" onPress={onCancel}>
        취소
      </Text>
      <Text
        accessibilityRole="button"
        accessibilityState={{ disabled: disableSubmit }}
        onPress={disableSubmit ? undefined : onSubmit}
      >
        {submitLabel}
      </Text>
    </View>
  );
}
