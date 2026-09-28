import { Host, RNHostView } from "@expo/ui";
import { Button, ContextMenu } from "@expo/ui/swift-ui";

import type { ChatMessageMenuProps } from "./chat-message-menu.types";

export type * from "./chat-message-menu.types";

/**
 * iOS: the system lifted-bubble context menu (user decision R2, R3-5
 * correction) -- an `@expo/ui` `Host` + swift-ui `ContextMenu` whose
 * `ContextMenu.Trigger` wraps the RN bubble in `RNHostView matchContents` so
 * the trigger's hit area and lift preview exactly match the rendered
 * bubble, and whose `ContextMenu.Items` list native swift-ui `Button`s (no
 * RN pressables inside the menu itself). Long-pressing the trigger is the
 * native gesture -- no manual open/close state here, unlike the Android
 * `DropdownMenu` shell.
 *
 * When there are no actions for this row, renders the bubble directly with
 * no `Host`/`ContextMenu` at all -- avoids paying for a native menu host on
 * every row (perf note in the round-2 plan: "행 Host 비용은 기기 검증
 * 대상 ... 코드에서는 불필요한 재렌더를 막는다").
 */
export function ChatMessageMenu({
  actions,
  alignEnd,
  children,
}: ChatMessageMenuProps) {
  if (actions.length === 0) return <>{children}</>;
  return (
    <Host
      matchContents
      style={{ alignSelf: alignEnd ? "flex-end" : "flex-start" }}
    >
      <ContextMenu>
        <ContextMenu.Trigger>
          <RNHostView matchContents>{children}</RNHostView>
        </ContextMenu.Trigger>
        <ContextMenu.Items>
          {actions.map((action) => (
            <Button
              key={action.key}
              label={action.label}
              onPress={action.onPress}
              role={action.destructive ? "destructive" : undefined}
              systemImage={action.systemImage}
            />
          ))}
        </ContextMenu.Items>
      </ContextMenu>
    </Host>
  );
}
