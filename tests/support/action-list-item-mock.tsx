import { Pressable, Text, View } from "react-native";
import type { ActionListItemProps } from "../../src/shared/ui/action-list-item.types";

/**
 * Test double for `ActionListItem`: the row is a button named
 * `"<title>, <supporting>"` and every action is a button named
 * `"<title> <action>"`, so screen tests can reach both without the platform
 * swipe / long-press affordances. Return it from a `jest.mock` factory.
 */
export function createActionListItemMock() {
  function ActionListItem(props: ActionListItemProps) {
    return (
      <View testID={props.testID}>
        <Pressable
          accessibilityLabel={
            props.supportingText
              ? `${props.title}, ${props.supportingText}`
              : props.title
          }
          accessibilityRole="button"
          onPress={props.onPress}
        >
          <Text>{props.title}</Text>
          {props.supportingText ? <Text>{props.supportingText}</Text> : null}
        </Pressable>
        {props.actions.map((action) => (
          <Pressable
            accessibilityLabel={`${props.title} ${action.title}`}
            accessibilityRole="button"
            accessibilityState={{ disabled: Boolean(action.disabled) }}
            disabled={action.disabled}
            key={action.key}
            onPress={action.onPress}
          />
        ))}
      </View>
    );
  }
  return { ActionListItem };
}
