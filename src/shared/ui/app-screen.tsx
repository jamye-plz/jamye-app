import { useContext } from "react";
import type { PropsWithChildren } from "react";
import type {
  ColorValue,
  ScrollViewProps,
  StyleProp,
  ViewStyle,
} from "react-native";
import { ScrollView } from "react-native";
import type { EdgeInsets } from "react-native-safe-area-context";
import {
  SafeAreaInsetsContext,
  initialWindowMetrics,
} from "react-native-safe-area-context";

import { useAppThemeOrSystem } from "@/core/theme/theme-provider";
import { appLayout, appSpacing } from "@/core/theme/tokens";

export type ResolveScreenPaddingArgs = Readonly<{
  headered: boolean;
  insets: Pick<EdgeInsets, "bottom" | "top">;
  os: string | undefined;
}>;

const ZERO_INSETS: EdgeInsets = { bottom: 0, left: 0, right: 0, top: 0 };

/**
 * Safe-area insets that never throw: the root error-boundary fallback mounts
 * above expo-router's SafeAreaProvider, so a missing provider falls back to the
 * native initial window metrics (or zero in tests).
 */
export function useScreenInsets(): EdgeInsets {
  const contextInsets = useContext(SafeAreaInsetsContext);
  return contextInsets ?? initialWindowMetrics?.insets ?? ZERO_INSETS;
}

export type ScreenPadding = Readonly<{
  paddingBottom: number;
  paddingTop: number;
}>;

/**
 * Pure padding resolver so branch coverage (ios/android x headered) is
 * unit-testable independent of process.env.EXPO_OS inlining (see the doc
 * comment on resolveThemeColorForOs in core/theme/tokens.ts for why this
 * pattern is used across the codebase).
 */
export function resolveScreenPadding({
  headered,
  insets,
  os,
}: ResolveScreenPaddingArgs): ScreenPadding {
  const paddingTop = headered ? appSpacing.md : insets.top + appSpacing.md;
  const isIosHeadered = os === "ios" && headered;
  const paddingBottom = (isIosHeadered ? 0 : insets.bottom) + appSpacing.md;
  return { paddingBottom, paddingTop };
}

type AppScreenProps = PropsWithChildren<
  Pick<ScrollViewProps, "refreshControl"> & {
    backgroundColor?: ColorValue;
    contentStyle?: StyleProp<ViewStyle>;
    headered?: boolean;
    keyboardShouldPersistTaps?: ScrollViewProps["keyboardShouldPersistTaps"];
    style?: StyleProp<ViewStyle>;
    testID?: string;
  }
>;

export function AppScreen({
  backgroundColor,
  children,
  contentStyle,
  headered = true,
  keyboardShouldPersistTaps = "handled",
  refreshControl,
  style,
  testID,
}: AppScreenProps) {
  const { colors } = useAppThemeOrSystem();
  const insets = useScreenInsets();
  const os = process.env.EXPO_OS;
  const resolvedBackgroundColor = backgroundColor ?? colors.background;
  const { paddingBottom, paddingTop } = resolveScreenPadding({
    headered,
    insets,
    os,
  });

  return (
    <ScrollView
      contentContainerStyle={[
        {
          alignSelf: "center",
          flexGrow: 1,
          gap: appSpacing.md,
          maxWidth: appLayout.contentMaxWidth,
          paddingBottom,
          paddingHorizontal: appSpacing.md,
          paddingTop,
          width: "100%",
        },
        contentStyle,
      ]}
      contentInsetAdjustmentBehavior="automatic"
      keyboardDismissMode={os === "ios" ? "interactive" : undefined}
      keyboardShouldPersistTaps={keyboardShouldPersistTaps}
      refreshControl={refreshControl}
      style={[{ backgroundColor: resolvedBackgroundColor, flex: 1 }, style]}
      testID={testID}
    >
      {children}
    </ScrollView>
  );
}
