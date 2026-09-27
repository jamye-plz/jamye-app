import { ListItem, Text } from "@expo/ui";

import type { ActionListItemProps } from "./action-list-item.types";

export type * from "./action-list-item.types";

/**
 * Fallback for platforms without a native action affordance (web): a plain
 * universal `ListItem` with the primary tap and leading slot only. iOS and
 * Android resolve to their own files.
 */
export function ActionListItem({
  leading,
  onPress,
  supportingText,
  testID,
  title,
}: ActionListItemProps) {
  return (
    <ListItem
      leading={leading}
      onPress={onPress}
      supportingText={supportingText}
      testID={testID}
    >
      <Text>{title}</Text>
    </ListItem>
  );
}
