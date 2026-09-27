import { Text } from "react-native";

import type { NativeInputShellProps } from "./native-input-shell.types";

type NativeInputShellStatusProps = Pick<
  NativeInputShellProps,
  "errorText" | "helperText"
>;

// Shared by the web/default fallbacks of `NativeInputDialog` and
// `NativeInputSheet`; the native `.ios.tsx` / `.android.tsx` shells render
// their own platform controls.
export function isNativeInputShellSubmitDisabled(
  submitDisabled: NativeInputShellProps["submitDisabled"],
  busy: NativeInputShellProps["busy"],
): boolean {
  return Boolean(submitDisabled) || Boolean(busy);
}

export function NativeInputShellStatusText({
  errorText,
  helperText,
}: NativeInputShellStatusProps) {
  return errorText ? (
    <Text accessibilityRole="alert">{errorText}</Text>
  ) : helperText ? (
    <Text>{helperText}</Text>
  ) : null;
}
