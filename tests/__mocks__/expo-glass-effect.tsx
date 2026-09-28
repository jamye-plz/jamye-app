/**
 * jest manual mock for `expo-glass-effect`, auto-picked-up like
 * `tests/__mocks__/@expo/ui.tsx` (jest `roots` includes `tests/`) for any
 * `import ... from "expo-glass-effect"` without an explicit `jest.mock(...)`
 * call. Unlike `@expo/ui`'s components, `GlassView`/`GlassContainer` are
 * plain `View`-shaped native wrappers (not the shared `ExpoUIModule`
 * bridge), so this mock only needs to keep their RN children queryable
 * under test -- there is no opaque host node to work around.
 */
import type { PropsWithChildren } from "react";
import { View } from "react-native";
import type { StyleProp, ViewStyle } from "react-native";

type MockGlassProps = PropsWithChildren<{
  style?: StyleProp<ViewStyle>;
  testID?: string;
}>;

export function GlassView({ children, style, testID }: MockGlassProps) {
  return (
    <View style={style} testID={testID}>
      {children}
    </View>
  );
}

export function GlassContainer({ children, style, testID }: MockGlassProps) {
  return (
    <View style={style} testID={testID}>
      {children}
    </View>
  );
}

export function isLiquidGlassAvailable(): boolean {
  return true;
}

export function isGlassEffectAPIAvailable(): boolean {
  return true;
}
