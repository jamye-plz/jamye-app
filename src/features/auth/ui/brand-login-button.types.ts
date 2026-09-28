import type { OAuthProvider } from "@/core/auth/types";

/**
 * L1/E13 brand login button contract (`api_contracts.app_login.brandButtonApi`):
 * a capsule (iOS) / M3 rounded (Android) button painted with the provider's
 * official colors, its official logo mark, and an in-button spinner while
 * `busy`. `label` is the Korean call-to-action text ("카카오로 계속하기" /
 * "Google로 계속하기"), never the provider's own baked-in button copy.
 */
export type BrandLoginButtonProps = Readonly<{
  /** Selects the brand palette and logo asset. */
  provider: OAuthProvider;
  label: string;
  /** Shows an inline spinner and blocks interaction. Only the pressed provider's button is busy. */
  busy?: boolean;
  /** Blocks interaction without a spinner (e.g. the other button, or session restore still in flight). */
  disabled?: boolean;
  onPress: () => void;
}>;
