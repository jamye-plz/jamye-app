import { Image } from "@expo/ui/swift-ui";
import { foregroundStyle } from "@expo/ui/swift-ui/modifiers";
import { useEffect, useState } from "react";

import { appleAuthenticationPort } from "@/core/auth/apple-authentication-port";
import { useAppTheme } from "@/core/theme/theme-provider";

import { BRAND_LOGO_SIZE } from "./brand-login-button.constants";
import { CapsuleLoginButton } from "./capsule-login-button.ios";

export type AppleLoginButtonProps = Readonly<{
  busy?: boolean;
  disabled?: boolean;
  onPress: () => void;
}>;

const APPLE_LABEL = "Apple로 로그인";

/**
 * U3/E14 Apple button (iOS only): the same 48pt capsule / max-440 shape as
 * `BrandLoginButton` (kakao/google) via the shared `CapsuleLoginButton` shell,
 * painted with U3's own light/dark polarity -- light: black fill + white
 * label; dark: white fill + black label, the reverse of the app's usual
 * semantic background/text, so it is derived from `colorScheme` here rather
 * than reused from `useAppTheme().colors` -- and SF Symbol `apple.logo` in
 * the logo slot (plan `login_screen_E14_U3.logo_choice`). Hidden entirely
 * until `AppleAuthentication.isAvailableAsync()` resolves `true` (D16/U3: no
 * Apple button where the OS does not support it). `busy`/`disabled` are
 * driven by the caller (`auth-screen.tsx`) exactly like the brand buttons,
 * so all three buttons disable together while any one is signing in.
 */
export function AppleLoginButton({
  busy = false,
  disabled = false,
  onPress,
}: AppleLoginButtonProps) {
  const { colorScheme } = useAppTheme();
  const [available, setAvailable] = useState(false);
  useEffect(() => {
    let cancelled = false;
    void appleAuthenticationPort.isAvailableAsync().then((value) => {
      if (!cancelled) setAvailable(value);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  if (!available) return null;

  const isDark = colorScheme === "dark";
  const fill = isDark ? "#FFFFFF" : "#000000";
  const label = isDark ? "#000000" : "#FFFFFF";
  const inactive = disabled || busy;

  return (
    <CapsuleLoginButton
      busy={busy}
      fill={fill}
      inactive={inactive}
      label={APPLE_LABEL}
      labelColor={label}
      logo={
        <Image
          modifiers={[foregroundStyle(label)]}
          size={BRAND_LOGO_SIZE}
          systemName="apple.logo"
          testID="apple-login-logo"
        />
      }
      onPress={onPress}
      testIdPrefix="apple"
    />
  );
}
