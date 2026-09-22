import { PlatformColor } from "react-native";
import type { ColorValue } from "react-native";

export type AppColorScheme = "light" | "dark";

export type AppThemeColors = Readonly<{
  background: ColorValue;
  surface: ColorValue;
  surfaceMuted: ColorValue;
  groupedBackground: ColorValue;
  secondaryGroupedBackground: ColorValue;
  text: ColorValue;
  textMuted: ColorValue;
  textTertiary: ColorValue;
  border: ColorValue;
  divider: ColorValue;
  fill: ColorValue;
  placeholder: ColorValue;
  primary: ColorValue;
  onPrimary: ColorValue;
  error: ColorValue;
  noticeSurface: ColorValue;
  /** Selected-state container (active tab pill on Android). */
  accentContainer: ColorValue;
  onAccentContainer: ColorValue;
}>;

export type AppTheme = Readonly<{
  colorScheme: AppColorScheme;
  colors: AppThemeColors;
}>;

export const appSpacing = {
  xxs: 4,
  xs: 8,
  sm: 12,
  md: 16,
  lg: 20,
  xl: 24,
  xxl: 32,
  xxxl: 40,
  huge: 48,
} as const;

export const appRadii = {
  small: 8,
  medium: 12,
  large: 16,
  extraLarge: 24,
  full: 999,
} as const;

export const appLayout = {
  contentMaxWidth: 720,
} as const;

export const appControl = {
  standardHeight: 48,
} as const;

export const appChatLayout = {
  compactBubbleMaxWidth: 0.78,
  conversationMaxWidth: 720,
  wideBubbleMaxWidth: 0.66,
} as const;

export const appChatMessage = {
  bubbleRadius: 20,
  directionalRadius: 8,
  fontSize: 16,
  groupGap: 12,
  lineHeight: 24.8,
  sameSenderGap: 4,
  timestampFontSize: 13,
} as const;

export const appChatComposer = {
  borderRadius: 16,
  controlSize: 44,
  maxHeight: 120,
  minHeight: 48,
  pressFeedbackDurationMs: 150,
} as const;

export const appTypography = {
  title: {
    fontSize: 24,
    fontWeight: "700",
    letterSpacing: -0.48,
    lineHeight: 32,
  },
  body: {
    fontSize: 16,
    fontWeight: "400",
    lineHeight: 26,
  },
  label: {
    fontSize: 14,
    fontWeight: "600",
    lineHeight: 20,
  },
  metadata: {
    fontSize: 13,
    fontWeight: "500",
    lineHeight: 19,
  },
} as const;

export type PlatformColorIdentifiers = Readonly<{
  ios: string;
  android: string;
}>;

/**
 * Pure semantic-color resolver, decoupled from reading `process.env.EXPO_OS`
 * directly so branch coverage is unit-testable. Metro/babel-preset-expo
 * statically inlines every `process.env.EXPO_OS` occurrence to the bundle's
 * target platform at build time (the same optimization `Platform.OS` gets) —
 * under jest-expo's transform this is *always* inlined to the fixed literal
 * `"ios"` (see `jest-expo/src/resolveBabelOptions.js`'s
 * `caller: { platform: "ios" }`), so a test can never observe the "android"
 * or "unset" branches by mutating `process.env.EXPO_OS` at runtime — the
 * conditional is already baked into compiled bytecode before the test runs.
 * `buildThemeColors` below is the sole call site that reads the real env var
 * and remains what Metro inlines/dead-code-eliminates per platform bundle in
 * production; this function takes `os` as an explicit parameter so
 * `tests/core/theme/tokens.test.ts` can exercise all three branches directly.
 *
 * iOS resolves to the UIKit semantic color; Android resolves to a plain hex
 * from the Berry-seeded Material 3 palette (ADR 0011: no wallpaper dynamic
 * color, and Compose hosts reject PlatformColor values anyway); everything
 * else keeps the authored hex fallback.
 */
export function resolveThemeColorForOs(
  os: string | undefined,
  iosIdentifier: string,
  androidHex: string,
  fallback: string,
): ColorValue {
  if (os === "ios") return PlatformColor(iosIdentifier);
  if (os === "android") return androidHex;
  return fallback;
}

export type AppThemeColorSpec = Readonly<{
  background: string;
  surface: string;
  surfaceMuted: string;
  groupedBackground: string;
  secondaryGroupedBackground: string;
  text: string;
  textMuted: string;
  textTertiary: string;
  border: string;
  divider: string;
  fill: string;
  placeholder: string;
  primary: string;
  onPrimary: string;
  error: string;
  noticeSurface: string;
  accentContainer: string;
  onAccentContainer: string;
}>;

function buildThemeColors(
  fallback: AppThemeColorSpec,
  android: AppThemeColorSpec,
): AppThemeColors {
  // The only real runtime read of process.env.EXPO_OS: Metro inlines this
  // exact expression per platform bundle in production (see the doc comment
  // on resolveThemeColorForOs above for why tests exercise that function
  // directly instead of toggling this env var).
  const os = process.env.EXPO_OS;
  const resolve = (
    iosIdentifier: string,
    role: keyof AppThemeColorSpec,
  ): ColorValue =>
    resolveThemeColorForOs(os, iosIdentifier, android[role], fallback[role]);

  return {
    background: resolve("systemBackground", "background"),
    surface: resolve("secondarySystemBackground", "surface"),
    surfaceMuted: resolve("systemFill", "surfaceMuted"),
    groupedBackground: resolve("systemGroupedBackground", "groupedBackground"),
    secondaryGroupedBackground: resolve(
      "secondarySystemGroupedBackground",
      "secondaryGroupedBackground",
    ),
    text: resolve("label", "text"),
    textMuted: resolve("secondaryLabel", "textMuted"),
    textTertiary: resolve("tertiaryLabel", "textTertiary"),
    border: resolve("separator", "border"),
    divider: resolve("separator", "divider"),
    fill: resolve("systemFill", "fill"),
    placeholder: resolve("placeholderText", "placeholder"),
    // Berry accent stays a literal brand hex on every platform (ADR 0011): it
    // is the single highlight color, never a platform system color.
    primary: fallback.primary,
    onPrimary: fallback.onPrimary,
    error: resolve("systemRed", "error"),
    noticeSurface: fallback.noticeSurface,
    accentContainer: resolve("secondarySystemFill", "accentContainer"),
    onAccentContainer: resolve("label", "onAccentContainer"),
  };
}

/** Authored hex fallbacks (web, tests, unknown platforms). */
const LIGHT_FALLBACK_SPEC: AppThemeColorSpec = {
  background: "#FAF8F4",
  surface: "#FFFFFF",
  surfaceMuted: "#F5F1EC",
  groupedBackground: "#FAF8F4",
  secondaryGroupedBackground: "#FFFFFF",
  text: "#29252D",
  textMuted: "#665F6B",
  textTertiary: "#918693",
  border: "#918693",
  divider: "#E8E0D8",
  fill: "#F5F1EC",
  placeholder: "#918693",
  primary: "#9B3F68",
  onPrimary: "#FFFFFF",
  error: "#B33C48",
  noticeSurface: "#FBF3D6",
  accentContainer: "#FFD9E4",
  onAccentContainer: "#2A151D",
};

const DARK_FALLBACK_SPEC: AppThemeColorSpec = {
  background: "#1C1920",
  surface: "#252129",
  surfaceMuted: "#302A42",
  groupedBackground: "#1C1920",
  secondaryGroupedBackground: "#252129",
  text: "#F4EEF2",
  textMuted: "#A9A0AE",
  textTertiary: "#776D7C",
  border: "#776D7C",
  divider: "#322C36",
  fill: "#302A42",
  placeholder: "#776D7C",
  primary: "#E39BB8",
  onPrimary: "#2C141F",
  error: "#F2A0A8",
  noticeSurface: "#3D351F",
  accentContainer: "#5A3F49",
  onAccentContainer: "#FFD9E4",
};

/**
 * Android palette (ADR 0011): Material 3 tonal roles generated from the
 * Conversation Berry seed (#9B3F68) with @material/material-color-utilities,
 * fixed instead of the wallpaper-driven dynamic color. Neutral tones: light
 * surface 98 / container 94 / container-high 92, dark canvas 4 (the M3 floor,
 * closest to the iOS OLED black) / container 12 / container-high 17;
 * neutral-variant 30/50/60/80 for text and outlines.
 */
const LIGHT_ANDROID_SPEC: AppThemeColorSpec = {
  background: "#FFF8F8",
  surface: "#F7EBED",
  surfaceMuted: "#F1E5E7",
  groupedBackground: "#FFF8F8",
  secondaryGroupedBackground: "#F7EBED",
  text: "#201A1C",
  textMuted: "#514347",
  textTertiary: "#837377",
  border: "#837377",
  divider: "#D5C2C7",
  fill: "#F1E5E7",
  placeholder: "#514347",
  primary: "#9B3F68",
  onPrimary: "#FFFFFF",
  error: "#BA1A1A",
  noticeSurface: "#FBF3D6",
  accentContainer: "#FFD9E4",
  onAccentContainer: "#2A151D",
};

const DARK_ANDROID_SPEC: AppThemeColorSpec = {
  background: "#120D0E",
  surface: "#241E20",
  surfaceMuted: "#2E282A",
  groupedBackground: "#120D0E",
  secondaryGroupedBackground: "#241E20",
  text: "#EBE0E2",
  textMuted: "#D5C2C7",
  textTertiary: "#9D8C91",
  border: "#9D8C91",
  divider: "#514347",
  fill: "#2E282A",
  placeholder: "#D5C2C7",
  primary: "#E39BB8",
  onPrimary: "#2C141F",
  error: "#FFB4AB",
  noticeSurface: "#3D351F",
  accentContainer: "#5A3F49",
  onAccentContainer: "#FFD9E4",
};

/**
 * The Android palette as plain hex, for native hosts that reject PlatformColor
 * values (the Compose primitives behind the Android header actions).
 */
export function androidThemeColors(scheme: AppColorScheme): AppThemeColorSpec {
  return scheme === "dark" ? DARK_ANDROID_SPEC : LIGHT_ANDROID_SPEC;
}

export const lightTheme: AppTheme = {
  colorScheme: "light",
  colors: buildThemeColors(LIGHT_FALLBACK_SPEC, LIGHT_ANDROID_SPEC),
};

export const darkTheme: AppTheme = {
  colorScheme: "dark",
  colors: buildThemeColors(DARK_FALLBACK_SPEC, DARK_ANDROID_SPEC),
};

export function resolveSystemTheme(
  colorScheme: string | null | undefined,
): AppTheme {
  return colorScheme === "dark" ? darkTheme : lightTheme;
}
