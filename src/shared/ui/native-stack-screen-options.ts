import { DarkTheme, DefaultTheme } from "expo-router";
import type { Stack } from "expo-router";
import type { ComponentProps } from "react";

import { useAppTheme } from "@/core/theme/theme-provider";
import type { AppColorScheme, AppThemeColors } from "@/core/theme/tokens";
import { androidThemeColors } from "@/core/theme/tokens";

export type NavigationTheme = typeof DefaultTheme;

/**
 * react-navigation paints the native Stack header (and the container behind
 * transitions) from its own theme, which expo-router leaves at the light
 * DefaultTheme regardless of the system scheme. Pick the theme by scheme and
 * point its canvas colors at the platform background so the iOS bar matches
 * `UIColor.systemBackground` instead of react-navigation's own grays.
 */
export function resolveNavigationTheme(
  colorScheme: AppColorScheme,
  os: string | undefined,
): NavigationTheme {
  const base = colorScheme === "dark" ? DarkTheme : DefaultTheme;
  const canvas =
    os === "android"
      ? androidThemeColors(colorScheme).background
      : colorScheme === "dark"
        ? "#000000"
        : "#FFFFFF";
  return {
    ...base,
    colors: { ...base.colors, background: canvas, card: canvas },
  };
}

export function useNavigationTheme(): NavigationTheme {
  const { colorScheme } = useAppTheme();
  return resolveNavigationTheme(colorScheme, process.env.EXPO_OS);
}

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
