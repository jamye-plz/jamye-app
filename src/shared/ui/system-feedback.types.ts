/**
 * One system-level notice (L2 button-press errors, N4 "can't open" alerts):
 * a message with an optional single action, always dismissible with one
 * button. This is not for destructive confirmation, which stays on the
 * existing `ConfirmAlert` (C2) -- `useSystemFeedback` never asks a yes/no
 * question.
 */
export type SystemFeedbackOptions = Readonly<{
  /** iOS only: the `Alert` title. Android's `Snackbar` has no title slot. */
  title?: string;
  message: string;
  /** Omit for a single acknowledge button ("확인" / plain dismiss). */
  actionLabel?: string;
  /** Ignored unless `actionLabel` is also given. */
  onAction?: () => void;
}>;

export type SystemFeedbackContextValue = Readonly<{
  /** Shows one notice: iOS a centered `Alert`, Android a `Snackbar`. */
  showNotice: (options: SystemFeedbackOptions) => void;
}>;
