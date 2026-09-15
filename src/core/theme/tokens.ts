import { Platform, PlatformColor } from "react-native";
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
 */
/** Android `@android:color/system_*_{light,dark}` Material 3 roles exist from API 34. */
export const ANDROID_SYSTEM_COLOR_MIN_API = 34;

export function resolveThemeColorForOs(
  os: string | undefined,
  identifiers: PlatformColorIdentifiers,
  fallback: string,
  androidApiLevel: number = typeof Platform.Version === "number"
    ? Platform.Version
    : 0,
): ColorValue {
  if (os === "ios") {
    return PlatformColor(identifiers.ios);
  }
  if (os === "android") {
    // An unknown resource name crashes ColorPropConverter natively, so older
    // Android keeps the authored hex fallback instead of a Material role.
    if (androidApiLevel < ANDROID_SYSTEM_COLOR_MIN_API) return fallback;
    return PlatformColor(identifiers.android);
  }
  return fallback;
}

/** Scheme-suffixed Material 3 system color resource (API 34+). */
export function androidSystemColor(
  role: string,
  scheme: AppColorScheme,
): string {
  return `@android:color/system_${role}_${scheme}`;
}

function buildThemeColors(
  scheme: AppColorScheme,
  spec: {
    background: string;
    surface: string;
    surfaceMuted: string;
    groupedBackground: string;
    secondaryGroupedBackground: string;
    text: string;
    textMuted: string;
    textTertiary: string;
    border: string;
    fill: string;
    placeholder: string;
    primary: string;
    onPrimary: string;
    error: string;
    noticeSurface: string;
  },
): AppThemeColors {
  // The only real runtime read of process.env.EXPO_OS: Metro inlines this
  // exact expression per platform bundle in production (see the doc comment
  // on resolveThemeColorForOs above for why tests exercise that function
  // directly instead of toggling this env var).
  const os = process.env.EXPO_OS;
  const resolve = (identifiers: PlatformColorIdentifiers, fallback: string) =>
    resolveThemeColorForOs(os, identifiers, fallback);
  const md = (role: string) => androidSystemColor(role, scheme);

  return {
    background: resolve(
      { ios: "systemBackground", android: md("surface") },
      spec.background,
    ),
    surface: resolve(
      {
        ios: "secondarySystemBackground",
        android: md("surface_container"),
      },
      spec.surface,
    ),
    surfaceMuted: resolve(
      { ios: "systemFill", android: md("surface_container_high") },
      spec.surfaceMuted,
    ),
    groupedBackground: resolve(
      { ios: "systemGroupedBackground", android: md("surface") },
      spec.groupedBackground,
    ),
    secondaryGroupedBackground: resolve(
      {
        ios: "secondarySystemGroupedBackground",
        android: md("surface_container"),
      },
      spec.secondaryGroupedBackground,
    ),
    text: resolve({ ios: "label", android: md("on_surface") }, spec.text),
    textMuted: resolve(
      { ios: "secondaryLabel", android: md("on_surface_variant") },
      spec.textMuted,
    ),
    textTertiary: resolve(
      { ios: "tertiaryLabel", android: md("outline") },
      spec.textTertiary,
    ),
    border: resolve({ ios: "separator", android: md("outline") }, spec.border),
    divider: resolve(
      { ios: "separator", android: md("outline_variant") },
      spec.border,
    ),
    fill: resolve(
      { ios: "systemFill", android: md("surface_container_high") },
      spec.fill,
    ),
    placeholder: resolve(
      { ios: "placeholderText", android: md("on_surface_variant") },
      spec.placeholder,
    ),
    // Berry accent stays a literal brand hex (D2): not a platform system color.
    primary: spec.primary,
    onPrimary: spec.onPrimary,
    error: resolve({ ios: "systemRed", android: md("error") }, spec.error),
    noticeSurface: spec.noticeSurface,
  };
}

export const lightTheme: AppTheme = {
  colorScheme: "light",
  colors: buildThemeColors("light", {
    background: "#FAF8F4",
    surface: "#FFFFFF",
    surfaceMuted: "#F5F1EC",
    groupedBackground: "#FAF8F4",
    secondaryGroupedBackground: "#FFFFFF",
    text: "#29252D",
    textMuted: "#665F6B",
    textTertiary: "#918693",
    border: "#918693",
    fill: "#F5F1EC",
    placeholder: "#918693",
    primary: "#9B3F68",
    onPrimary: "#FFFFFF",
    error: "#B33C48",
    noticeSurface: "#FBF3D6",
  }),
};

export const darkTheme: AppTheme = {
  colorScheme: "dark",
  colors: buildThemeColors("dark", {
    background: "#1C1920",
    surface: "#252129",
    surfaceMuted: "#302A42",
    groupedBackground: "#1C1920",
    secondaryGroupedBackground: "#252129",
    text: "#F4EEF2",
    textMuted: "#A9A0AE",
    textTertiary: "#776D7C",
    border: "#776D7C",
    fill: "#302A42",
    placeholder: "#776D7C",
    primary: "#E39BB8",
    onPrimary: "#2C141F",
    error: "#F2A0A8",
    noticeSurface: "#3D351F",
  }),
};

export function resolveSystemTheme(
  colorScheme: string | null | undefined,
): AppTheme {
  return colorScheme === "dark" ? darkTheme : lightTheme;
}
