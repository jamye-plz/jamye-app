import type { ReactNode } from "react";

export type RowActionSymbol =
  | "delete"
  | "info"
  | "invite"
  | "leave"
  | "removeMember"
  | "share"
  | "transfer";

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
  /** Leading slot content (e.g. a monogram/photo `Avatar`, G1/I4). */
  leading?: ReactNode;
  /** Primary action for a tap on the row. */
  onPress: () => void;
  /**
   * iOS: show the trailing disclosure chevron. Only rows that open another
   * screen should; rows that act in place (share, rename, delete) do not.
   * @default true
   */
  disclosure?: boolean;
  supportingText?: string;
  testID?: string;
  title: string;
}>;
