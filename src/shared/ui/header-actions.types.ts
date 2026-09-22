import type { AppSymbolName } from "@/shared/ui/app-symbol";

/**
 * Symbols that can sit in a header toolbar on both platforms: each needs an
 * SF Symbol (iOS bar button) and a Material vector drawable (Android Compose
 * icon button, see `header-actions.android.tsx`).
 */
export type HeaderToolbarSymbol = "add" | "chat" | "info" | "more" | "refresh";

export type HeaderMenuItem = Readonly<{
  key: string;
  title: string;
  onPress: () => void;
  symbol?: AppSymbolName;
  destructive?: boolean;
  disabled?: boolean;
}>;

export type HeaderButtonAction = Readonly<{
  kind?: "button";
  key: string;
  symbol: HeaderToolbarSymbol;
  accessibilityLabel: string;
  onPress: () => void;
  disabled?: boolean;
}>;

export type HeaderMenuAction = Readonly<{
  kind: "menu";
  key: string;
  symbol: HeaderToolbarSymbol;
  accessibilityLabel: string;
  items: readonly HeaderMenuItem[];
  disabled?: boolean;
}>;

export type HeaderAction = HeaderButtonAction | HeaderMenuAction;

export type HeaderActionsProps = Readonly<{ actions: readonly HeaderAction[] }>;
