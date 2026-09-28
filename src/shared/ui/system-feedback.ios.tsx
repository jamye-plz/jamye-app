import { Host } from "@expo/ui";
import { Alert, Button, Spacer, Text } from "@expo/ui/swift-ui";
import { createContext, useContext, useState } from "react";
import type { PropsWithChildren } from "react";

import type {
  SystemFeedbackContextValue,
  SystemFeedbackOptions,
} from "./system-feedback.types";

export type * from "./system-feedback.types";

const SystemFeedbackContext = createContext<
  SystemFeedbackContextValue | undefined
>(undefined);

const SYSTEM_FEEDBACK_OK_LABEL = "확인";
const SYSTEM_FEEDBACK_DISMISS_LABEL = "닫기";

/**
 * Provides `useSystemFeedback` to its subtree and renders the iOS notice
 * surface (L2/N4): a screen mounts one `SystemFeedbackHost` around its
 * content, and any descendant calls `useSystemFeedback().showNotice(...)` to
 * raise a centered SwiftUI `Alert` -- a single `확인` button, or
 * `닫기`/`actionLabel` when the caller passes an action (e.g. `다시 시도`).
 * Destructive confirmation stays on `ConfirmAlert` (C2); this host never
 * asks a yes/no question, so it always has exactly one non-cancel action.
 */
export function SystemFeedbackHost({
  children,
  testID,
}: PropsWithChildren<{ testID?: string }>) {
  const [notice, setNotice] = useState<SystemFeedbackOptions | null>(null);
  const dismiss = () => setNotice(null);
  return (
    <SystemFeedbackContext.Provider
      value={{ showNotice: (options) => setNotice(options) }}
    >
      {children}
      {/* The SwiftUI `Alert` must sit inside its own `Host` (DESIGN.md §4:
          SwiftUI views render inside a Host); `children` are RN views. */}
      <Host>
        <Alert
          isPresented={notice !== null}
          onIsPresentedChange={(presented) => {
            if (!presented) dismiss();
          }}
          testID={testID}
          title={notice?.title ?? ""}
        >
          <Alert.Trigger>
            <Spacer />
          </Alert.Trigger>
          <Alert.Actions>
            {notice && notice.actionLabel !== undefined ? (
              <>
                <Button
                  label={SYSTEM_FEEDBACK_DISMISS_LABEL}
                  onPress={dismiss}
                  role="cancel"
                />
                <Button
                  label={notice.actionLabel}
                  onPress={() => {
                    const onAction = notice.onAction;
                    dismiss();
                    onAction?.();
                  }}
                />
              </>
            ) : (
              <Button
                label={SYSTEM_FEEDBACK_OK_LABEL}
                onPress={dismiss}
                role="cancel"
              />
            )}
          </Alert.Actions>
          {notice?.message !== undefined ? (
            <Alert.Message>
              <Text>{notice.message}</Text>
            </Alert.Message>
          ) : null}
        </Alert>
      </Host>
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
