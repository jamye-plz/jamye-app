export type RowActionSymbol =
  "delete" | "info" | "invite" | "leave" | "transfer";

/** One secondary action on a list row; the platform decides how it surfaces. */
export type RowAction = Readonly<{
  destructive?: boolean;
  disabled?: boolean;
  key: string;
  onPress: () => void;
  symbol: RowActionSymbol;
  title: string;
}>;

export type ActionListItemProps = Readonly<{
  /** Secondary actions. iOS: trailing swipe + long-press context menu. Android: long-press or the trailing ⋮ opens a dropdown menu. */
  actions: readonly RowAction[];
  /** Primary action for a tap on the row. */
  onPress: () => void;
  supportingText?: string;
  testID?: string;
  title: string;
}>;
