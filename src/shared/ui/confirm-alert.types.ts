/** Default cancel-button label when the caller doesn't supply one (C2). */
export const CONFIRM_ALERT_DEFAULT_CANCEL_LABEL = "취소";

export type ConfirmAlertProps = Readonly<{
  isPresented: boolean;
  title: string;
  message?: string;
  confirmLabel: string;
  /** @default "취소" */
  cancelLabel?: string;
  /** Styles the confirm action as destructive (iOS `role="destructive"` / Android error color). */
  destructive?: boolean;
  /**
   * Single-button mode (task-app-device fix1): hides the cancel/dismiss
   * button entirely, leaving only `confirmLabel`'s button. For an
   * acknowledge-only notice (e.g. a delete-failure alert) with no cancel
   * action -- `cancelLabel` is ignored while this is set.
   */
  acknowledge?: boolean;
  onConfirm: () => void;
  /** Called for cancel and for any other dismissal (e.g. tap outside, back gesture). */
  onDismiss: () => void;
  testID?: string;
}>;
