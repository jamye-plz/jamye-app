import { ListItem, RNHostView, Text } from "@expo/ui";
import {
  DropdownMenu,
  DropdownMenuItem,
  Icon,
  IconButton,
  Text as ComposeText,
} from "@expo/ui/jetpack-compose";
import { combinedClickable } from "@expo/ui/jetpack-compose/modifiers";
import { useState } from "react";
import type { ImageSourcePropType } from "react-native";

import { useAppThemeOrSystem } from "@/core/theme/theme-provider";
import { androidThemeColors } from "@/core/theme/tokens";

import type {
  ActionListItemProps,
  RowActionSymbol,
} from "./action-list-item.types";

export type * from "./action-list-item.types";

const MATERIAL_ICONS: Record<RowActionSymbol | "more", ImageSourcePropType> = {
  delete:
    require("../../../assets/icons/material/delete.xml") as ImageSourcePropType,
  info: require("../../../assets/icons/material/info.xml") as ImageSourcePropType,
  invite:
    require("../../../assets/icons/material/confirmation_number.xml") as ImageSourcePropType,
  leave:
    require("../../../assets/icons/material/logout.xml") as ImageSourcePropType,
  markRead:
    require("../../../assets/icons/material/mark_email_read.xml") as ImageSourcePropType,
  more: require("../../../assets/icons/material/more_vert.xml") as ImageSourcePropType,
  removeMember:
    require("../../../assets/icons/material/person_remove.xml") as ImageSourcePropType,
  share:
    require("../../../assets/icons/material/share.xml") as ImageSourcePropType,
  transfer:
    require("../../../assets/icons/material/swap_horiz.xml") as ImageSourcePropType,
};
const ICON_SIZE = 24;

/**
 * Android row with Material affordances: a universal `ListItem` (with an
 * optional leading slot, e.g. an `Avatar`) whose tap runs the primary action
 * and whose long press, like the trailing ⋮ icon button, opens a Material 3
 * dropdown menu with the secondary actions. Swipe is deliberately absent
 * (Material reserves it for one dismiss action).
 */
export function ActionListItem({
  actions,
  leading,
  onPress,
  supportingText,
  testID,
  title,
}: ActionListItemProps) {
  const { colorScheme } = useAppThemeOrSystem();
  const hex = androidThemeColors(colorScheme);
  const [expanded, setExpanded] = useState(false);
  const hasActions = actions.length > 0;
  const open = () => setExpanded(true);
  return (
    <ListItem
      leading={
        // DESIGN.md §4: React Native content enters a Compose row only
        // through `RNHostView`. `LazyColumn` keys items by index, so removing
        // a row rebuilds every row below it; a bare RN view is then handed
        // to its new interop holder while the old one still owns it ("The
        // specified child already has a parent"). `RNHostView` detaches it
        // first.
        leading ? <RNHostView matchContents>{leading}</RNHostView> : undefined
      }
      modifiers={[
        combinedClickable({
          onClick: onPress,
          onLongClick: hasActions ? open : undefined,
        }),
      ]}
      supportingText={supportingText}
      testID={testID}
      trailing={
        hasActions ? (
          <DropdownMenu
            color={hex.surface}
            expanded={expanded}
            onDismissRequest={() => setExpanded(false)}
          >
            <DropdownMenu.Trigger>
              <IconButton onClick={open}>
                <Icon
                  contentDescription={`${title} 메뉴`}
                  size={ICON_SIZE}
                  source={MATERIAL_ICONS.more}
                  tint={hex.textMuted}
                />
              </IconButton>
            </DropdownMenu.Trigger>
            <DropdownMenu.Items>
              {actions.map((action) => {
                const color = action.destructive ? hex.error : hex.text;
                return (
                  <DropdownMenuItem
                    enabled={!action.disabled}
                    key={action.key}
                    onClick={() => {
                      setExpanded(false);
                      action.onPress();
                    }}
                  >
                    <DropdownMenuItem.LeadingIcon>
                      <Icon
                        size={ICON_SIZE}
                        source={MATERIAL_ICONS[action.symbol]}
                        tint={color}
                      />
                    </DropdownMenuItem.LeadingIcon>
                    <DropdownMenuItem.Text>
                      <ComposeText color={color}>{action.title}</ComposeText>
                    </DropdownMenuItem.Text>
                  </DropdownMenuItem>
                );
              })}
            </DropdownMenu.Items>
          </DropdownMenu>
        ) : undefined
      }
    >
      <Text>{title}</Text>
    </ListItem>
  );
}
