import { Text, TextInput, View } from "react-native";

import {
  isNativeInputShellSubmitDisabled,
  NativeInputShellStatusText,
} from "./native-input-shell.shared";
import type { NativeInputShellProps } from "./native-input-shell.types";

export type * from "./native-input-shell.types";

/**
 * Fallback for platforms without a native full-screen-dialog affordance
 * (web). Android resolves to `native-input-dialog.android.tsx`.
 */
export function NativeInputDialog({
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
      <Text accessibilityRole="button" onPress={onCancel}>
        닫기
      </Text>
      <Text accessibilityRole="header">{title}</Text>
      <Text
        accessibilityRole="button"
        accessibilityState={{ disabled: disableSubmit }}
        onPress={disableSubmit ? undefined : onSubmit}
      >
        {submitLabel}
      </Text>
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
    </View>
  );
}
