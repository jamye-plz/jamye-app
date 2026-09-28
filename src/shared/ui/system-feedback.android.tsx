import { createContext, useCallback, useContext, useRef } from "react";
import type { PropsWithChildren } from "react";

import { AndroidSnackbarHost } from "./snackbar-host.android";
import type { SnackbarHostRef } from "./snackbar-host.android";
import type {
  SystemFeedbackContextValue,
  SystemFeedbackOptions,
} from "./system-feedback.types";

export type * from "./system-feedback.types";

const SystemFeedbackContext = createContext<
  SystemFeedbackContextValue | undefined
>(undefined);

/**
 * Provides `useSystemFeedback` to its subtree and renders the Android notice
 * surface (L2/N4): a screen mounts one `SystemFeedbackHost` around its
 * content, and any descendant calls `useSystemFeedback().showNotice(...)` to
 * raise a `Snackbar` via the existing `AndroidSnackbarHost`
 * (`snackbar-host.android.tsx`) with an optional action (e.g. `다시 시도`).
 * `title` has no Android surface (Snackbar has no title slot) and is
 * ignored. Destructive confirmation stays on `ConfirmAlert` (C2).
 */
export function SystemFeedbackHost({
  children,
  testID,
}: PropsWithChildren<{ testID?: string }>) {
  const hostRef = useRef<SnackbarHostRef>(null);
  const showNotice = useCallback((options: SystemFeedbackOptions) => {
    void hostRef.current
      ?.showSnackbar({
        actionLabel: options.actionLabel,
        message: options.message,
      })
      .then((result) => {
        if (result === "actionPerformed") options.onAction?.();
      });
  }, []);
  return (
    <SystemFeedbackContext.Provider value={{ showNotice }}>
      {children}
      <AndroidSnackbarHost ref={hostRef} testID={testID} />
    </SystemFeedbackContext.Provider>
  );
}

export function useSystemFeedback(): SystemFeedbackContextValue {
  const ctx = useContext(SystemFeedbackContext);
  if (ctx === undefined) {
    throw new Error(
      "useSystemFeedback must be used inside SystemFeedbackHost.",
    );
  }
  return ctx;
}

/**
 * Like `useSystemFeedback`, but returns `null` outside a `SystemFeedbackHost`
 * instead of throwing, for shared components (the chat composer) that may
 * render in a tree without a host.
 */
export function useOptionalSystemFeedback(): SystemFeedbackContextValue | null {
  return useContext(SystemFeedbackContext) ?? null;
}
