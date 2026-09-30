import { RNHostView } from "@expo/ui";
import { Image as ExpoImage } from "expo-image";

import {
  BRAND_LOGO_SIZE,
  BRAND_LOGO_SOURCES,
  BRAND_PALETTE,
} from "./brand-login-button.constants";
import type { BrandLoginButtonProps } from "./brand-login-button.types";
import { CapsuleLoginButton } from "./capsule-login-button.ios";

export type * from "./brand-login-button.types";

/**
 * L1/E13 brand button (iOS): a full-width capsule SwiftUI `Button` (shared
 * `CapsuleLoginButton` shell, also used by `AppleLoginButton`) painted with
 * the provider's official fill (and, for Google, its outline traced along
 * the capsule), the logo and label centred together like the official
 * artwork, and an inline `ProgressView` in the logo's slot while `busy` (so
 * the label never shifts). The logo renders through `RNHostView` +
 * `expo-image` rather than swift-ui `Image`'s `uiImage` prop: `uiImage`
 * needs a synchronously-resolved `file://` URI, which a bundled `require()`
 * asset cannot cheaply provide without an async `expo-asset` download step
 * -- the documented fallback also used by `topic-media-carousel-row.tsx`.
 * Interaction is gated by omitting `onPress` (not only the `disabled`
 * modifier) so a disabled/busy button stays inert even against a test host
 * that does not interpret modifiers.
 */
export function BrandLoginButton({
  busy = false,
  disabled = false,
  label,
  onPress,
  provider,
}: BrandLoginButtonProps) {
  const palette = BRAND_PALETTE[provider];
  const inactive = disabled || busy;
  return (
    <CapsuleLoginButton
      borderColor={palette.border}
      busy={busy}
      fill={palette.background}
      inactive={inactive}
      label={label}
      labelColor={palette.label}
      labelOpacity={palette.labelOpacity}
      logo={
        <RNHostView matchContents>
          <ExpoImage
            accessibilityIgnoresInvertColors
            contentFit="contain"
            source={BRAND_LOGO_SOURCES[provider]}
            style={{ height: BRAND_LOGO_SIZE, width: BRAND_LOGO_SIZE }}
          />
        </RNHostView>
      }
      onPress={onPress}
      testIdPrefix={provider}
    />
  );
}
