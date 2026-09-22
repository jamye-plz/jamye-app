import type { Stack } from "expo-router";
import type { ComponentProps } from "react";

import { useAppTheme } from "@/core/theme/theme-provider";
import type { AppColorScheme, AppThemeColors } from "@/core/theme/tokens";

type StackScreenOptionsProp = ComponentProps<typeof Stack>["screenOptions"];

export type NativeStackScreenOptions = Exclude<
  Exclude<StackScreenOptionsProp, undefined>,
  (...args: never[]) => unknown
>;

export type ResolveNativeStackScreenOptionsArgs = Readonly<{
  colorScheme: AppColorScheme;
  colors: AppThemeColors;
  os: string | undefined;
}>;

/**
 * Shared native Stack header options for the root Stack and every tab Stack.
 * Header chrome is monochrome (ADR 0011): back button, bar buttons and
 * titles all use the platform label color; Berry is reserved for highlights.
 * Pure so the ios/android branch stays unit-testable independent of
 * process.env.EXPO_OS inlining.
 */
export function resolveNativeStackScreenOptions({
  colorScheme,
  colors,
  os,
}: ResolveNativeStackScreenOptionsArgs): NativeStackScreenOptions {
  const titleColor = colorScheme === "dark" ? "#FFFFFF" : "#000000";
  return {
    headerShown: true,
    headerTintColor: colors.text,
    headerBackButtonDisplayMode: "minimal",
    headerShadowVisible: false,
    // Android's Material top app bar shares the surface color with the
    // content; iOS keeps the system header material (see PlatformColor note).
    ...(os === "android"
      ? { headerStyle: { backgroundColor: colors.background } }
      : {}),
    headerTitleStyle: { color: titleColor },
    headerLargeTitleStyle: { color: titleColor },
    contentStyle: { backgroundColor: colors.background },
  };
}

export function useNativeStackScreenOptions(): NativeStackScreenOptions {
  const { colorScheme, colors } = useAppTheme();
  return resolveNativeStackScreenOptions({
    colorScheme,
    colors,
    os: process.env.EXPO_OS,
  });
}
