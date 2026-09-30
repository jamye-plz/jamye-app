import { Host } from "@expo/ui";
import { Button, HStack, ProgressView, Text } from "@expo/ui/swift-ui";
import {
  background,
  buttonStyle,
  contentShape,
  disabled as disabledModifier,
  font,
  foregroundStyle,
  frame,
  opacity,
  padding,
  shapes,
  strokeBorder,
} from "@expo/ui/swift-ui/modifiers";
import type { ReactNode } from "react";

import { appControl, appSpacing } from "@/core/theme/tokens";

import { BRAND_LOGO_SIZE } from "./brand-login-button.constants";

export type CapsuleLoginButtonProps = Readonly<{
  busy: boolean;
  /** `disabled || busy`, computed by the caller. */
  inactive: boolean;
  fill: string;
  /** Google-only outline color; omitted paints no border (Kakao/Apple). */
  borderColor?: string;
  label: string;
  labelColor: string;
  /** Kakao-only label opacity; omitted paints the label fully opaque. */
  labelOpacity?: number;
  /** Rendered in the logo slot while `!busy` (a platform-specific element the caller owns). */
  logo: ReactNode;
  onPress: () => void;
  /** `${testIdPrefix}-login-busy` on the busy ProgressView. */
  testIdPrefix: string;
}>;

/**
 * L1/E13 + U3/E14 shared capsule-button SwiftUI shell for `BrandLoginButton`
 * (kakao/google) and `AppleLoginButton` (apple): the Host/Button/HStack tree,
 * padding/frame/background/contentShape sizing, the busy-ProgressView-vs-logo
 * swap (shared `BRAND_LOGO_SIZE`), and the label `Text`. Extracted from the
 * two near-identical implementations (REFINE, reusability MEDIUM) -- callers
 * keep their own palette, logo element, and availability gating. Visual
 * output (padding, frame, capsule shape, spacing) is unchanged from before
 * the extraction.
 */
export function CapsuleLoginButton({
  busy,
  inactive,
  fill,
  borderColor,
  label,
  labelColor,
  labelOpacity,
  logo,
  onPress,
  testIdPrefix,
}: CapsuleLoginButtonProps) {
  return (
    // The SwiftUI tree needs its own Host (DESIGN.md §4); the RN column
    // stretches it to full width and it takes the button's height.
    <Host matchContents={{ vertical: true }}>
      <Button
        modifiers={[buttonStyle("plain"), disabledModifier(inactive)]}
        onPress={inactive ? undefined : onPress}
      >
        <HStack
          alignment="center"
          modifiers={[
            padding({ horizontal: appSpacing.lg }),
            // Size first, then paint: with the fill ahead of `frame` it only
            // covered the label, so the buttons showed as small chips
            // (device). `minHeight` lets large Dynamic Type grow the button.
            frame({ maxWidth: Infinity, minHeight: appControl.standardHeight }),
            background(fill, shapes.capsule()),
            ...(borderColor
              ? [
                  strokeBorder({
                    content: borderColor,
                    shape: "capsule",
                    style: { lineWidth: 1 },
                  }),
                ]
              : []),
            contentShape(shapes.capsule()),
          ]}
          spacing={appSpacing.xs}
        >
          {busy ? (
            <ProgressView
              modifiers={[
                frame({ height: BRAND_LOGO_SIZE, width: BRAND_LOGO_SIZE }),
              ]}
              testID={`${testIdPrefix}-login-busy`}
            />
          ) : (
            logo
          )}
          <Text
            modifiers={[
              font({ textStyle: "body", weight: "medium" }),
              foregroundStyle(labelColor),
              ...(labelOpacity !== undefined ? [opacity(labelOpacity)] : []),
            ]}
          >
            {label}
          </Text>
        </HStack>
      </Button>
    </Host>
  );
}
