import type { ReactNode } from "react";
import { Pressable, View } from "react-native";

type ToolbarProps = Readonly<{
  backgroundColor?: unknown;
  children?: ReactNode;
  placement?: string;
}>;
type ItemProps = Readonly<{
  accessibilityLabel?: string;
  children?: ReactNode;
  disabled?: boolean;
  icon?: unknown;
  onPress?: () => void;
}>;

/**
 * Test double for expo-router's `Stack.Toolbar`: buttons, menu triggers and
 * menu actions become pressable React Native elements so RNTL role queries
 * keep working. Menu actions render eagerly (no open state). Spread the result
 * into an `expo-router` mock's `Stack`.
 */
export function createStackToolbarMock() {
  function Toolbar({ children, placement = "bottom" }: ToolbarProps) {
    return <View testID={`stack-toolbar-${placement}`}>{children}</View>;
  }
  function ToolbarButton({
    accessibilityLabel,
    disabled = false,
    onPress,
  }: ItemProps) {
    return (
      <Pressable
        accessibilityLabel={accessibilityLabel}
        accessibilityRole="button"
        accessibilityState={{ disabled }}
        disabled={disabled}
        onPress={onPress}
      />
    );
  }
  function ToolbarMenu({
    accessibilityLabel,
    children,
    disabled = false,
  }: ItemProps) {
    return (
      <View testID="stack-toolbar-menu">
        <Pressable
          accessibilityLabel={accessibilityLabel}
          accessibilityRole="button"
          accessibilityState={{ disabled }}
          disabled={disabled}
        />
        {children}
      </View>
    );
  }
  function ToolbarMenuAction({
    children,
    disabled = false,
    onPress,
  }: ItemProps) {
    return (
      <Pressable
        accessibilityLabel={typeof children === "string" ? children : undefined}
        accessibilityRole="menuitem"
        accessibilityState={{ disabled }}
        disabled={disabled}
        onPress={onPress}
      />
    );
  }
  Toolbar.Button = ToolbarButton;
  Toolbar.Menu = ToolbarMenu;
  Toolbar.MenuAction = ToolbarMenuAction;
  return { Toolbar };
}
