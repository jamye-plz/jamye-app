import type { ChatMessageMenuProps } from "./chat-message-menu.types";

export type * from "./chat-message-menu.types";

/**
 * Fallback for platforms without a native message menu (web), and the base
 * module `tsc` resolves `./chat-message-menu` against. iOS and Android
 * resolve to `chat-message-menu.ios.tsx` (SwiftUI `ContextMenu`) and
 * `chat-message-menu.android.tsx` (Compose `DropdownMenu`), so neither
 * platform bundle imports the other platform's native UI package.
 */
export function ChatMessageMenu({ children }: ChatMessageMenuProps) {
  return <>{children}</>;
}
