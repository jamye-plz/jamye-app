import type { ReactNode } from "react";

export type RowActionSymbol =
  | "delete"
  | "info"
  | "invite"
  | "leave"
  | "markRead"
  | "removeMember"
  | "share"
  | "transfer";

/** One secondary action on a list row; the platform decides how it surfaces. */
export type RowAction = Readonly<{
  destructive?: boolean;
  disabled?: boolean;
  /**
   * iOS swipe edge (N2, e.g. "읽음"). Android ignores this -- every action
   * surfaces the same way, via long-press or the trailing ⋮ menu.
   * @default "trailing"
   */
  edge?: "leading" | "trailing";
  key: string;
  onPress: () => void;
  symbol: RowActionSymbol;
  /**
   * iOS swipe-button caption, for when it should read shorter than `title`
   * (e.g. "읽음" on a swipe button whose context-menu row says "읽음으로
   * 표시"). Falls back to `title`. Android always uses `title` (no swipe
   * surface).
   */
  swipeLabel?: string;
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
