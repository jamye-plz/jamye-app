import { ActivityIndicator, Image, Pressable, Text } from "react-native";

import { appControl, appSpacing } from "@/core/theme/tokens";

import {
  BRAND_LOGO_SIZE,
  BRAND_LOGO_SOURCES,
  BRAND_PALETTE,
} from "./brand-login-button.constants";
import type { BrandLoginButtonProps } from "./brand-login-button.types";

export type * from "./brand-login-button.types";

/**
 * Fallback for platforms without a native brand-button affordance (web);
 * iOS and Android resolve to their own files (`brand-login-button.ios.tsx`'s
 * SwiftUI `Button`, `brand-login-button.android.tsx`'s Compose `Button`).
 * This file also gives `tsc`/bundlers a base module to resolve `./
 * brand-login-button` against, mirroring `standard-state-view.tsx` and
 * `system-feedback.tsx`'s plain-RN fallback pattern.
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
    <Pressable
      disabled={inactive}
      onPress={inactive ? undefined : onPress}
      style={{
        alignItems: "center",
        backgroundColor: palette.background,
        borderColor: palette.border,
        borderRadius: appControl.standardHeight / 2,
        borderWidth: palette.border ? 1 : 0,
        flexDirection: "row",
        gap: appSpacing.xs,
        height: appControl.standardHeight,
        justifyContent: "center",
      }}
    >
      {busy ? (
        <ActivityIndicator testID={`${provider}-login-busy`} />
      ) : (
        <Image
          source={BRAND_LOGO_SOURCES[provider]}
          style={{ height: BRAND_LOGO_SIZE, width: BRAND_LOGO_SIZE }}
        />
      )}
      <Text
        style={{ color: palette.label, opacity: palette.labelOpacity ?? 1 }}
      >
        {label}
      </Text>
    </Pressable>
  );
}
