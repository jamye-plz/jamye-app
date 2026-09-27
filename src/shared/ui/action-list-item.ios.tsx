import { Icon, ListItem, Text } from "@expo/ui";
import { Button, ContextMenu, SwipeActions } from "@expo/ui/swift-ui";
import { disabled } from "@expo/ui/swift-ui/modifiers";
import type { ComponentProps } from "react";

import type {
  ActionListItemProps,
  RowAction,
  RowActionSymbol,
} from "./action-list-item.types";

export type * from "./action-list-item.types";

type SystemImage = NonNullable<ComponentProps<typeof Button>["systemImage"]>;
const SF_SYMBOLS: Record<RowActionSymbol, SystemImage> = {
  delete: "trash",
  info: "info.circle",
  invite: "ticket",
  leave: "rectangle.portrait.and.arrow.right",
  removeMember: "person.badge.minus",
  share: "square.and.arrow.up",
  transfer: "arrow.left.arrow.right",
};

function actionButton(action: RowAction, keyPrefix: string) {
  return (
    <Button
      key={`${keyPrefix}-${action.key}`}
      label={action.title}
      modifiers={action.disabled ? [disabled(true)] : undefined}
      onPress={action.onPress}
      role={action.destructive ? "destructive" : undefined}
      systemImage={SF_SYMBOLS[action.symbol]}
    />
  );
}

/**
 * iOS row with the platform's own action affordances: a universal `ListItem`
 * (with an optional leading slot, e.g. an `Avatar`) inside SwiftUI
 * `swipeActions` (trailing; the destructive action sits at the edge, full
 * swipe stays off) and a `contextMenu` on long press with the same items.
 * Tap runs the primary action.
 */
export function ActionListItem({
  actions,
  disclosure = true,
  leading,
  onPress,
  supportingText,
  testID,
  title,
}: ActionListItemProps) {
  const row = (
    <ListItem
      leading={leading}
      onPress={onPress}
      supportingText={supportingText}
      testID={testID}
      trailing={
        disclosure ? (
          <Icon name="chevron.right" size={14} style={{ opacity: 0.3 }} />
        ) : undefined
      }
    >
      <Text>{title}</Text>
    </ListItem>
  );
  if (actions.length === 0) return row;
  const swipeOrder = [...actions].sort(
    (a, b) => Number(Boolean(b.destructive)) - Number(Boolean(a.destructive)),
  );
  return (
    <SwipeActions>
      <ContextMenu>
        <ContextMenu.Trigger>{row}</ContextMenu.Trigger>
        <ContextMenu.Items>
          {actions.map((action) => actionButton(action, "menu"))}
        </ContextMenu.Items>
      </ContextMenu>
      <SwipeActions.Actions allowsFullSwipe={false} edge="trailing">
        {swipeOrder.map((action) => actionButton(action, "swipe"))}
      </SwipeActions.Actions>
    </SwipeActions>
  );
}
