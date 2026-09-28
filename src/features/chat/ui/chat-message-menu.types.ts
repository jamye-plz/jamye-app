import type { ReactElement } from "react";
import type { SFSymbol } from "sf-symbols-typescript";

/**
 * R2 (revision_log R3-5) message long-press menu: one action list shared by
 * both platform shells (`chat-message-menu.ios.tsx` / `.android.tsx`), which
 * only differ in the native chrome (SwiftUI `ContextMenu` vs. an anchored M3
 * `DropdownMenu`). `chat-message-row.tsx` builds this list per row (복사 when
 * there is body text, 저장·공유 when there are attachments, 다시 보내기 when
 * the send failed).
 */
export type ChatMessageMenuAction = Readonly<{
  key: string;
  label: string;
  /** SF Symbol name (iOS `Button systemImage`, typed by `@expo/ui`'s own
   * `sf-symbols-typescript` dependency). Ignored on Android -- the M3 menu
   * renders text-only, matching plain `DropdownMenuItem` rows elsewhere that
   * have no dedicated vector asset yet. */
  systemImage?: SFSymbol;
  destructive?: boolean;
  onPress: () => void;
}>;

export type ChatMessageMenuProps = Readonly<{
  actions: readonly ChatMessageMenuAction[];
  /** Matches the wrapped bubble's own row alignment so the native menu host
   * (sized to its content, not the full row width) still sits on the
   * correct side. */
  alignEnd: boolean;
  /** Always the row's single bubble `View` -- `RNHostView`'s own type
   * (iOS) requires exactly one `ReactElement`, not an arbitrary `ReactNode`. */
  children: ReactElement;
}>;
