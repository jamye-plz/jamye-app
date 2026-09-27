import { Alert, Button, Spacer, Text } from "@expo/ui/swift-ui";

import { CONFIRM_ALERT_DEFAULT_CANCEL_LABEL } from "./confirm-alert.types";
import type { ConfirmAlertProps } from "./confirm-alert.types";

export type * from "./confirm-alert.types";

/**
 * Centered destructive-confirmation alert (C2): SwiftUI `Alert`, presentation
 * controlled entirely by `isPresented`. `Alert.Trigger` is a required slot
 * but never receives user interaction here, so it holds an invisible
 * `Spacer`. Android resolves to `confirm-alert.android.tsx` (Compose
 * `AlertDialog`). RN `Alert`/action sheets are not used (C2).
 */
export function ConfirmAlert({
  cancelLabel = CONFIRM_ALERT_DEFAULT_CANCEL_LABEL,
  confirmLabel,
  destructive,
  isPresented,
  message,
  onConfirm,
  onDismiss,
  testID,
  title,
}: ConfirmAlertProps) {
  return (
    <Alert
      isPresented={isPresented}
      onIsPresentedChange={(presented) => {
        if (!presented) onDismiss();
      }}
      testID={testID}
      title={title}
    >
      <Alert.Trigger>
        <Spacer />
      </Alert.Trigger>
      <Alert.Actions>
        <Button label={cancelLabel} onPress={onDismiss} role="cancel" />
        <Button
          label={confirmLabel}
          onPress={onConfirm}
          role={destructive ? "destructive" : undefined}
        />
      </Alert.Actions>
      {message !== undefined ? (
        <Alert.Message>
          <Text>{message}</Text>
        </Alert.Message>
      ) : null}
    </Alert>
  );
}
