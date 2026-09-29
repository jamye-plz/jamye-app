import { Icon, ListItem, Text } from "@expo/ui";
import { Button, ContextMenu, SwipeActions } from "@expo/ui/swift-ui";
import { disabled, tint } from "@expo/ui/swift-ui/modifiers";
import type { ComponentProps } from "react";
import type { ColorValue } from "react-native";

import { useAppThemeOrSystem } from "@/core/theme/theme-provider";

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
  markRead: "envelope.open",
  removeMember: "person.badge.minus",
  share: "square.and.arrow.up",
  transfer: "arrow.left.arrow.right",
};

function actionButton(
  action: RowAction,
  keyPrefix: string,
  isSwipe = false,
  destructiveTint?: ColorValue,
) {
  // M15/AC3/AC5 r3: a swipe button never gets `role="destructive"`. SwiftUI's
  // `swipeActions` treats a destructive-role button as "delete this row" and
  // hides the row the instant it's tapped -- before the `ConfirmAlert` this
  // app always shows first (E10) can run. A red `tint` (the theme's iOS
  // `systemRed`, the same red the destructive role rendered, and dark-mode
  // aware -- unlike a literal hex) keeps the same look without that
  // built-in hide animation. The long-press `contextMenu` has no such side
  // effect, so its buttons keep the real destructive role.
  const modifiers = [
    ...(action.destructive && isSwipe && destructiveTint
      ? [tint(destructiveTint)]
      : []),
    ...(action.disabled ? [disabled(true)] : []),
  ];
  return (
    <Button
      key={`${keyPrefix}-${action.key}`}
      label={isSwipe ? (action.swipeLabel ?? action.title) : action.title}
      modifiers={modifiers.length > 0 ? modifiers : undefined}
      onPress={action.onPress}
      role={action.destructive && !isSwipe ? "destructive" : undefined}
      systemImage={SF_SYMBOLS[action.symbol]}
    />
  );
}

/**
 * iOS row with the platform's own action affordances: a universal `ListItem`
 * (with an optional leading slot, e.g. an `Avatar`) inside SwiftUI
 * `swipeActions` -- a trailing group (destructive action at the edge, full
 * swipe stays off) and, when an action opts in via `edge: "leading"` (N2
 * "읽음"), a second leading-edge group -- plus a `contextMenu` on long press
 * listing every action (leading and trailing alike) in the given order. Tap
 * runs the primary action. A leading action may set `swipeLabel` for a
 * shorter swipe-button caption (e.g. "읽음") distinct from its `title`, which
 * stays the context-menu wording (e.g. "읽음으로 표시").
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
  const { colors } = useAppThemeOrSystem();
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
  const leadingActions = actions.filter((action) => action.edge === "leading");
  const trailingActions = actions.filter((action) => action.edge !== "leading");
  const trailingOrder = [...trailingActions].sort(
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
      {leadingActions.length > 0 ? (
        <SwipeActions.Actions edge="leading">
          {leadingActions.map((action) =>
            actionButton(action, "swipe-leading", true, colors.error),
          )}
        </SwipeActions.Actions>
      ) : null}
      {trailingOrder.length > 0 ? (
        <SwipeActions.Actions allowsFullSwipe={false} edge="trailing">
          {trailingOrder.map((action) =>
            actionButton(action, "swipe-trailing", true, colors.error),
          )}
        </SwipeActions.Actions>
      ) : null}
    </SwipeActions>
  );
}
