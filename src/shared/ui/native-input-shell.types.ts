/**
 * Shared prop contract for the one-line input screen scaffold (C3: new
 * group, join by invite code, new topic). iOS renders it as
 * `native-input-sheet.ios.tsx` (modal `Form` sheet); Android as
 * `native-input-dialog.android.tsx` (M3 full-screen dialog). A page task's
 * `.ios.tsx` route imports `NativeInputSheet`, its `.android.tsx` route
 * imports `NativeInputDialog` — both take this exact prop shape.
 */
export type NativeInputShellProps = Readonly<{
  title: string;
  /** e.g. "만들기" or "가입". */
  submitLabel: string;
  submitDisabled?: boolean;
  /** While true, disables the field and both actions so a slow submit can't double-fire. */
  busy?: boolean;
  onCancel: () => void;
  onSubmit: () => void;
  value: string;
  onChangeValue: (value: string) => void;
  placeholder?: string;
  /** Shown as help text until `errorText` is set, which takes over the same slot. */
  helperText?: string;
  errorText?: string;
  autoFocus?: boolean;
  /**
   * Pre-fills the native field once (e.g. a pending-invite code consumed on
   * focus, A3/L2). The field still manages its own keystrokes internally
   * (`onChangeValue` is the only feedback channel); this only pushes a new
   * value into the native side via `ObservableState.set` when it changes,
   * it does not make the field fully controlled.
   */
  initialValue?: string;
  testID?: string;
}>;
