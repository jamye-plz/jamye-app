import { createContext, useContext, useState } from "react";
import type { PropsWithChildren } from "react";
import { Text, View } from "react-native";

import type {
  SystemFeedbackContextValue,
  SystemFeedbackOptions,
} from "./system-feedback.types";

export type * from "./system-feedback.types";

const SystemFeedbackContext = createContext<
  SystemFeedbackContextValue | undefined
>(undefined);

const SYSTEM_FEEDBACK_OK_LABEL = "확인";

/**
 * Fallback for platforms without a native notice affordance (web): a plain
 * inline block instead of an OS alert/snackbar, mirroring `ConfirmAlert`'s
 * own fallback (`confirm-alert.tsx`). iOS and Android resolve to their own
 * files (`Alert` / `Snackbar`).
 */
export function SystemFeedbackHost({
  children,
  testID,
}: PropsWithChildren<{ testID?: string }>) {
  const [notice, setNotice] = useState<SystemFeedbackOptions | null>(null);
  const dismiss = () => setNotice(null);
  return (
    <SystemFeedbackContext.Provider value={{ showNotice: setNotice }}>
      {children}
      {notice ? (
        <View
          accessibilityRole="alert"
          accessibilityViewIsModal
          testID={testID}
        >
          {notice.title ? (
            <Text accessibilityRole="header">{notice.title}</Text>
          ) : null}
          <Text>{notice.message}</Text>
          {notice.actionLabel ? (
            <Text
              accessibilityRole="button"
              onPress={() => {
                const onAction = notice.onAction;
                dismiss();
                onAction?.();
              }}
            >
              {notice.actionLabel}
            </Text>
          ) : null}
          <Text accessibilityRole="button" onPress={dismiss}>
            {SYSTEM_FEEDBACK_OK_LABEL}
          </Text>
        </View>
      ) : null}
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
