import type { OAuthProvider } from "@/core/auth/types";

export type BrandPalette = Readonly<{
  background: string;
  /** Google only: the guideline's neutral outline color. */
  border?: string;
  label: string;
  /** Kakao only: the guideline's 85%-opacity black label. @default 1 (opaque) */
  labelOpacity?: number;
}>;

/**
 * L1/E13 official button colors. Kakao: solid brand yellow fill, black label
 * at 85% opacity (Kakao Login button design guide). Google: white fill with
 * the guideline's neutral outline and dark-grey label (Google Identity
 * branding guidelines, "Neutral" button variant). See the round-2 result
 * report for the exact source URLs and guideline notes.
 */
export const BRAND_PALETTE: Record<OAuthProvider, BrandPalette> = {
  kakao: {
    background: "#FEE500",
    label: "#000000",
    labelOpacity: 0.85,
  },
  google: {
    background: "#FFFFFF",
    border: "#747775",
    label: "#1F1F1F",
  },
};

/**
 * Appends an alpha channel to a 6-digit hex color (`#RRGGBB` -> `#RRGGBBAA`),
 * for platforms (Android) whose color props take a single `ColorValue`
 * rather than a separate opacity modifier.
 */
export function withAlpha(hex: string, opacity: number): string {
  const alpha = Math.round(Math.min(Math.max(opacity, 0), 1) * 255)
    .toString(16)
    .padStart(2, "0");
  return `${hex}${alpha}`;
}

/**
 * Official logo assets (E13), both on a transparent background so they sit
 * directly on the button fill: the Kakao speech-bubble symbol (isolated from
 * the Kakao Login button design guide's official button artwork, its bounds
 * centred in the canvas so it lines up with the label like the official
 * button) and the Google "G" (cut from the Google Identity branding
 * guidelines' `signin-assets.zip` icon-only buttons, whose grey square used
 * to show as a box on device). See `assets/brand/{kakao,google}/` and the
 * round-2 result report for source URLs and guideline notes.
 */
export const BRAND_LOGO_SOURCES: Record<OAuthProvider, number> = {
  kakao: require("../../../../assets/brand/kakao/kakao-symbol.png"),
  google: require("../../../../assets/brand/google/google-logo.png"),
};

/** Logo box: an 18pt "G" (Google's mark size) and, with the Kakao canvas's
 * padding, a ~14pt symbol (the official 13-in-46 proportion). */
export const BRAND_LOGO_SIZE = 18;
