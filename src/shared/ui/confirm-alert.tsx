import { Text, View } from "react-native";

import { CONFIRM_ALERT_DEFAULT_CANCEL_LABEL } from "./confirm-alert.types";
import type { ConfirmAlertProps } from "./confirm-alert.types";

export type * from "./confirm-alert.types";

/**
 * Fallback for platforms without a native centered-alert affordance (web): a
 * plain inline confirmation block (not an imperative `Alert.alert` call,
 * which is out of policy here). iOS and Android resolve to their own files
 * (`Alert` / `AlertDialog`).
 */
export function ConfirmAlert({
  cancelLabel = CONFIRM_ALERT_DEFAULT_CANCEL_LABEL,
  confirmLabel,
  isPresented,
  message,
  onConfirm,
  onDismiss,
  testID,
  title,
}: ConfirmAlertProps) {
  if (!isPresented) return null;
  return (
    <View accessibilityRole="alert" accessibilityViewIsModal testID={testID}>
      <Text accessibilityRole="header">{title}</Text>
      {message ? <Text>{message}</Text> : null}
      <Text accessibilityRole="button" onPress={onDismiss}>
        {cancelLabel}
      </Text>
      <Text accessibilityRole="button" onPress={onConfirm}>
        {confirmLabel}
      </Text>
    </View>
  );
}
