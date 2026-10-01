import { Host } from "@expo/ui";
import {
  Form,
  Section,
  Text,
  TextField,
  useNativeState,
} from "@expo/ui/swift-ui";
import { disabled } from "@expo/ui/swift-ui/modifiers";
import { Stack } from "expo-router";
import { useEffect } from "react";

import { useAppTheme } from "@/core/theme/theme-provider";

import type { NativeInputShellProps } from "./native-input-shell.types";

export type * from "./native-input-shell.types";

/**
 * One-line input screen scaffold (C3): the caller's route sets
 * `presentation: "modal"`; this renders the toolbar `취소` / submit actions
 * (left/right, per C3) and the `Form`/`Section` body, with the section
 * footer holding the error text (or helper text when there's no error).
 * `busy` disables the field and both actions so a slow submit can't
 * double-fire. The field is bound to an `ObservableState` (`useNativeState`)
 * solely so `initialValue` (e.g. a pending-invite code, A3) can be pushed in
 * after mount; typed input still only reaches the caller through
 * `onChangeValue` — this does not make the field JS-controlled. Android
 * resolves to `native-input-dialog.android.tsx`.
 */
export function NativeInputSheet({
  autoFocus,
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
}: NativeInputShellProps) {
  const { colors } = useAppTheme();
  const disableSubmit = Boolean(submitDisabled) || Boolean(busy);
  const footerText = errorText ?? helperText;
  const text = useNativeState(initialValue ?? "");
  useEffect(() => {
    if (initialValue !== undefined) text.set(initialValue);
  }, [initialValue, text]);
  return (
    <>
      <Stack.Screen options={{ title }} />
      <Stack.Toolbar placement="left">
        <Stack.Toolbar.Button
          accessibilityLabel="취소"
          disabled={busy}
          onPress={onCancel}
        >
          취소
        </Stack.Toolbar.Button>
      </Stack.Toolbar>
      <Stack.Toolbar placement="right">
        <Stack.Toolbar.Button
          accessibilityLabel={submitLabel}
          disabled={disableSubmit}
          onPress={onSubmit}
          tintColor={colors.primary}
          variant="done"
        >
          {submitLabel}
        </Stack.Toolbar.Button>
      </Stack.Toolbar>
      <Host style={{ flex: 1 }} testID={testID} useViewportSizeMeasurement>
        <Form>
          <Section footer={footerText ? <Text>{footerText}</Text> : undefined}>
            <TextField
              autoFocus={autoFocus}
              modifiers={busy ? [disabled(true)] : undefined}
              onTextChange={onChangeValue}
              placeholder={placeholder}
              text={text}
            />
          </Section>
        </Form>
      </Host>
    </>
  );
}
