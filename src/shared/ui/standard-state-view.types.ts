import type { AppSymbolName } from "./app-symbol";

export type StandardStateViewAction = Readonly<{
  label: string;
  onPress: () => void;
  /** Primary gets the emphasized style (iOS `glassProminent`/`borderedProminent`, Android filled); others are secondary. */
  primary?: boolean;
}>;

/** First load: no title/icon, just the platform spinner. */
export type StandardStateViewLoadingProps = Readonly<{
  kind: "loading";
  testID?: string;
}>;

/**
 * Empty (G4/T6), error-with-no-rows, or terminal "deleted" (M15/AC6, e.g. a
 * topic removed out from under an open detail screen) state: icon, title,
 * optional description and actions. `kind` is a caller-facing discriminant
 * only -- every variant renders identically here (no retry affordance is
 * implied by "error"; callers supply their own `actions`).
 */
export type StandardStateViewContentProps = Readonly<{
  kind: "empty" | "error" | "deleted";
  title: string;
  description?: string;
  systemImage: AppSymbolName;
  actions?: readonly StandardStateViewAction[];
  testID?: string;
}>;

/**
 * Both views render SwiftUI (iOS) / Compose (Android) nodes, so the caller
 * must place them inside a `Host` from `@expo/ui`; outside one, Android
 * reports "must be rendered as a direct child of a <Host>" and draws nothing.
 */
export type StandardStateViewProps =
  StandardStateViewLoadingProps | StandardStateViewContentProps;

/** The "list already has rows" error path (C1): iOS gets an inline top-of-list row; Android uses the Snackbar host instead. */
export type StandardStateViewErrorRowProps = Readonly<{
  message: string;
  /** @default "다시 시도" */
  retryLabel?: string;
  onRetry: () => void;
  testID?: string;
}>;
