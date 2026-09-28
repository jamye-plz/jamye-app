import { Host, RNHostView } from "@expo/ui";
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
import { Image as ExpoImage } from "expo-image";

import { appControl, appSpacing } from "@/core/theme/tokens";

import {
  BRAND_LOGO_SIZE,
  BRAND_LOGO_SOURCES,
  BRAND_PALETTE,
} from "./brand-login-button.constants";
import type { BrandLoginButtonProps } from "./brand-login-button.types";

export type * from "./brand-login-button.types";

/**
 * L1/E13 brand button (iOS): a full-width capsule SwiftUI `Button` painted
 * with the provider's official fill (and, for Google, its outline traced
 * along the capsule), the logo and label centred together like the official
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
            background(palette.background, shapes.capsule()),
            ...(palette.border
              ? [
                  strokeBorder({
                    content: palette.border,
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
              testID={`${provider}-login-busy`}
            />
          ) : (
            <RNHostView matchContents>
              <ExpoImage
                accessibilityIgnoresInvertColors
                contentFit="contain"
                source={BRAND_LOGO_SOURCES[provider]}
                style={{ height: BRAND_LOGO_SIZE, width: BRAND_LOGO_SIZE }}
              />
            </RNHostView>
          )}
          <Text
            modifiers={[
              font({ textStyle: "body", weight: "medium" }),
              foregroundStyle(palette.label),
              ...(palette.labelOpacity !== undefined
                ? [opacity(palette.labelOpacity)]
                : []),
            ]}
          >
            {label}
          </Text>
        </HStack>
      </Button>
    </Host>
  );
}
