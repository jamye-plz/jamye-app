/**
 * jest manual mock for `@expo/ui`. jest-expo renders `@expo/ui`'s native
 * components as an opaque `ViewManagerAdapter_ExpoUI` host node that cannot be
 * queried by text/role, so every `@expo/ui`-consuming component under test
 * needs an RN-equivalent stand-in instead. This file lives under
 * `tests/__mocks__/@expo/ui.tsx` (jest `roots` includes `tests/`) so it is
 * picked up automatically for any `import ... from "@expo/ui"` without an
 * explicit `jest.mock("@expo/ui")` call in the consuming test file.
 */
import type { PropsWithChildren, ReactNode } from "react";
import {
  Pressable,
  Switch as RNSwitch,
  Text as RNText,
  View,
} from "react-native";
import type {
  StyleProp,
  SwitchProps,
  TextStyle,
  ViewStyle,
} from "react-native";

type PassThroughViewProps = PropsWithChildren<{
  testID?: string;
  style?: StyleProp<ViewStyle>;
}>;

type PassThroughTextProps = PropsWithChildren<{
  testID?: string;
  style?: StyleProp<TextStyle>;
}>;

function PassThroughView({ children, testID, style }: PassThroughViewProps) {
  return (
    <View style={style} testID={testID}>
      {children}
    </View>
  );
}

export const Host = PassThroughView;
export const Column = PassThroughView;
export const Row = PassThroughView;
export const Spacer = PassThroughView;
export const FieldGroup = PassThroughView;
export const List = PassThroughView;
export const ScrollView = PassThroughView;
export const Collapsible = PassThroughView;
export const RNHostView = PassThroughView;
export const Picker = PassThroughView;
export const Slider = PassThroughView;
export const Checkbox = PassThroughView;
export const TextInput = PassThroughView;

export function Icon() {
  return null;
}

export function Text({ children, testID, style }: PassThroughTextProps) {
  return (
    <RNText style={style} testID={testID}>
      {children}
    </RNText>
  );
}

type ButtonProps = Readonly<{
  label?: string;
  children?: ReactNode;
  onPress?: () => void;
  disabled?: boolean;
  variant?: string;
  testID?: string;
}>;

export function Button({
  label,
  children,
  onPress,
  disabled,
  testID,
}: ButtonProps) {
  return (
    <Pressable
      accessibilityLabel={label}
      accessibilityRole="button"
      accessibilityState={{ disabled: !!disabled }}
      disabled={disabled}
      onPress={onPress}
      testID={testID}
    >
      {children ?? <RNText>{label}</RNText>}
    </Pressable>
  );
}

type ListItemProps = Readonly<{
  children?: ReactNode;
  supportingText?: string;
  onPress?: () => void;
  leading?: ReactNode;
  trailing?: ReactNode;
  testID?: string;
}>;

export function ListItem({
  children,
  supportingText,
  onPress,
  leading,
  trailing,
  testID,
}: ListItemProps) {
  return (
    <Pressable
      accessibilityRole={onPress ? "button" : undefined}
      onPress={onPress}
      testID={testID}
    >
      {leading}
      {children}
      {supportingText != null ? <RNText>{supportingText}</RNText> : null}
      {trailing}
    </Pressable>
  );
}

type BottomSheetProps = Readonly<{
  isPresented?: boolean;
  children?: ReactNode;
  testID?: string;
}>;

export function BottomSheet({
  isPresented,
  children,
  testID,
}: BottomSheetProps) {
  if (!isPresented) return null;
  return <View testID={testID ?? "bottom-sheet"}>{children}</View>;
}

export function Switch({ value, onValueChange, ...rest }: SwitchProps) {
  return <RNSwitch onValueChange={onValueChange} value={value} {...rest} />;
}

export function useNativeState<T>(value: T): { value: T } {
  return { value };
}
