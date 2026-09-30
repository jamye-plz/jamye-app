import { AlertDialog, Text, TextButton } from "@expo/ui/jetpack-compose";
import { testID as testIDModifier } from "@expo/ui/jetpack-compose/modifiers";

import { useAppThemeOrSystem } from "@/core/theme/theme-provider";
import { androidThemeColors } from "@/core/theme/tokens";

import { CONFIRM_ALERT_DEFAULT_CANCEL_LABEL } from "./confirm-alert.types";
import type { ConfirmAlertProps } from "./confirm-alert.types";

export type * from "./confirm-alert.types";

/**
 * Centered destructive-confirmation alert (C2), Android: Compose
 * `AlertDialog`, mounted only while `isPresented` (Compose shows a dialog
 * for as long as it stays composed). A destructive confirm label uses the
 * Material error color (`androidThemeColors`). iOS resolves to
 * `confirm-alert.ios.tsx`. `acknowledge` (task-app-device fix1) drops the
 * `DismissButton` slot for a single-button notice alert (e.g. account-delete
 * failure).
 */
export function ConfirmAlert({
  acknowledge,
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
  const { colorScheme } = useAppThemeOrSystem();
  const hex = androidThemeColors(colorScheme);
  if (!isPresented) return null;
  return (
    <AlertDialog
      modifiers={testID ? [testIDModifier(testID)] : undefined}
      onDismissRequest={onDismiss}
    >
      {/* expo-ui `Text` applies its own default style over the dialog slots,
          so the M3 dialog type roles are set explicitly. */}
      <AlertDialog.Title>
        <Text style={{ typography: "headlineSmall" }}>{title}</Text>
      </AlertDialog.Title>
      {message !== undefined ? (
        <AlertDialog.Text>
          <Text color={hex.textMuted} style={{ typography: "bodyMedium" }}>
            {message}
          </Text>
        </AlertDialog.Text>
      ) : null}
      {acknowledge ? null : (
        <AlertDialog.DismissButton>
          <TextButton onClick={onDismiss}>
            <Text color={hex.primary} style={{ typography: "labelLarge" }}>
              {cancelLabel}
            </Text>
          </TextButton>
        </AlertDialog.DismissButton>
      )}
      <AlertDialog.ConfirmButton>
        <TextButton onClick={onConfirm}>
          <Text
            color={destructive ? hex.error : hex.primary}
            style={{ typography: "labelLarge" }}
          >
            {confirmLabel}
          </Text>
        </TextButton>
      </AlertDialog.ConfirmButton>
    </AlertDialog>
  );
}
