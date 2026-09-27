import { Pressable, Text, TextInput, View } from "react-native";

import type { NativeInputShellProps } from "@/shared/ui/native-input-shell.types";

/**
 * Test double for the C3 input shell (`NativeInputSheet` /
 * `NativeInputDialog`): the field, supporting text and both actions become
 * React Native elements so a screen test can drive the shell's prop contract.
 * The shell's own native rendering is covered by `native-input-shell.test.tsx`.
 */
export function NativeInputShellMock({
  busy,
  errorText,
  helperText,
  initialValue,
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
  const submitBlocked = Boolean(submitDisabled) || Boolean(busy);
  return (
    <View testID={testID}>
      <Text accessibilityRole="header">{title}</Text>
      <Pressable
        accessibilityLabel="취소"
        accessibilityRole="button"
        accessibilityState={{ disabled: Boolean(busy) }}
        disabled={busy}
        onPress={onCancel}
      />
      <TextInput
        accessibilityHint={initialValue}
        accessibilityLabel={placeholder}
        editable={!busy}
        onChangeText={onChangeValue}
        value={value}
      />
      {(errorText ?? helperText) ? (
        <Text>{errorText ?? helperText}</Text>
      ) : null}
      <Pressable
        accessibilityLabel={submitLabel}
        accessibilityRole="button"
        accessibilityState={{ disabled: submitBlocked }}
        disabled={submitBlocked}
        onPress={onSubmit}
      />
    </View>
  );
}
