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
import { useEffect } from "react";
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
  ViewProps,
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

/**
 * `List` keeps `onRefresh` on the host view so `fireEvent(list, "refresh")`
 * reaches it the way a pull would.
 */
export function List({
  children,
  onRefresh,
  testID,
}: PropsWithChildren<{ onRefresh?: () => Promise<void>; testID?: string }>) {
  const refresh = { onRefresh } as unknown as ViewProps;
  return (
    <View {...refresh} testID={testID}>
      {children}
    </View>
  );
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
  /** Compose modifiers; a `combinedClickable` config wires tap / long press. */
  modifiers?: readonly unknown[];
}>;

type ClickHandlers = Readonly<{
  onClick?: () => void;
  onLongClick?: () => void;
}>;
function clickHandlers(
  modifiers: readonly unknown[] | undefined,
): ClickHandlers {
  const found = modifiers?.find(
    (modifier): modifier is ClickHandlers =>
      typeof modifier === "object" &&
      modifier !== null &&
      ("onClick" in modifier || "onLongClick" in modifier),
  );
  return found ?? {};
}

/**
 * Records one entry per `ListItem` mount (a new component instance being
 * constructed), via a `useEffect` with an empty dependency array. A prop
 * *update* delivered to an already-mounted instance never appends here --
 * only a remount (e.g. triggered by a changed `key`) does. The chat-composer
 * attach-sheet regression test uses this log to prove the availability-keyed
 * `key` workaround (see chat-composer.tsx) forces React to remount the
 * ListItem instead of diffing `onPress` away in place, which is what
 * upstream @expo/ui's Android bug crashes on.
 */
export const listItemMountLog: { testID: string | undefined }[] = [];

export function resetListItemMountLog(): void {
  listItemMountLog.length = 0;
}

export function ListItem({
  children,
  supportingText,
  onPress,
  leading,
  trailing,
  testID,
  modifiers,
}: ListItemProps) {
  useEffect(() => {
    listItemMountLog.push({ testID });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- record on mount only, not on testID prop updates
  }, []);
  const clicks = clickHandlers(modifiers);
  const press = onPress ?? clicks.onClick;
  return (
    <Pressable
      accessibilityRole={press ? "button" : undefined}
      onLongPress={clicks.onLongClick}
      onPress={press}
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
