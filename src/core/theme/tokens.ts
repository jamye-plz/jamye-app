export type AppColorScheme = "light" | "dark";

export type AppThemeColors = Readonly<{
  background: string;
  surface: string;
  surfaceMuted: string;
  text: string;
  textMuted: string;
  border: string;
  divider: string;
  primary: string;
  onPrimary: string;
  error: string;
  noticeSurface: string;
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

export const lightTheme: AppTheme = {
  colorScheme: "light",
  colors: {
    background: "#FAF8F4",
    surface: "#FFFFFF",
    surfaceMuted: "#F5F1EC",
    text: "#29252D",
    textMuted: "#665F6B",
    border: "#918693",
    divider: "#E8E0D8",
    primary: "#9B3F68",
    onPrimary: "#FFFFFF",
    error: "#B33C48",
    noticeSurface: "#FBF3D6",
  },
};

export const darkTheme: AppTheme = {
  colorScheme: "dark",
  colors: {
    background: "#1C1920",
    surface: "#252129",
    surfaceMuted: "#302A42",
    text: "#F4EEF2",
    textMuted: "#A9A0AE",
    border: "#776D7C",
    divider: "#322C36",
    primary: "#E39BB8",
    onPrimary: "#2C141F",
    error: "#F2A0A8",
    noticeSurface: "#3D351F",
  },
};

export function resolveSystemTheme(
  colorScheme: string | null | undefined,
): AppTheme {
  return colorScheme === "dark" ? darkTheme : lightTheme;
}
