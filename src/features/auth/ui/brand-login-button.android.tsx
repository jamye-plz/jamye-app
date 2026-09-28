import { Host } from "@expo/ui";
import {
  Box,
  Button,
  CircularProgressIndicator,
  Image,
  Row,
  Text,
} from "@expo/ui/jetpack-compose";
import {
  background,
  clip,
  defaultMinSize,
  fillMaxWidth,
  paddingAll,
  Shapes,
  size,
} from "@expo/ui/jetpack-compose/modifiers";

import { useAppThemeOrSystem } from "@/core/theme/theme-provider";
import {
  androidThemeColors,
  appControl,
  appSpacing,
} from "@/core/theme/tokens";

import {
  BRAND_LOGO_SIZE,
  BRAND_LOGO_SOURCES,
  BRAND_PALETTE,
  withAlpha,
} from "./brand-login-button.constants";
import type { BrandLoginButtonProps } from "./brand-login-button.types";

export type * from "./brand-login-button.types";

const OUTLINE_WIDTH = 1;

/**
 * L1/E13 brand button (Android): a full-width M3 `Button` (Material's
 * default shape is already fully rounded, matching "M3 둥근 모서리") painted
 * with the provider's official `containerColor`/`contentColor`, the logo and
 * label centred together like the official artwork, and a
 * `CircularProgressIndicator` in the logo's slot while `busy` (so the label
 * never shifts). Google's outline is a ring of the guideline hex around the
 * button: the `border` modifier has no shape and drew a rectangle around the
 * rounded button (device), and the `Button` colors have no border field.
 * `enabled={false}` and omitting `onClick` both gate interaction so a
 * disabled/busy button stays inert even against a test host that ignores
 * `enabled`.
 */
export function BrandLoginButton({
  busy = false,
  disabled = false,
  label,
  onPress,
  provider,
}: BrandLoginButtonProps) {
  const { colorScheme } = useAppThemeOrSystem();
  const hex = androidThemeColors(colorScheme);
  const palette = BRAND_PALETTE[provider];
  const inactive = disabled || busy;
  const labelColor = palette.labelOpacity
    ? withAlpha(palette.label, palette.labelOpacity)
    : palette.label;
  const outline = palette.border ? OUTLINE_WIDTH : 0;
  return (
    // The Compose tree needs its own Host with the Berry seed (DESIGN.md §4).
    <Host matchContents={{ vertical: true }} seedColor={hex.primary}>
      <Box
        modifiers={[
          fillMaxWidth(),
          ...(palette.border
            ? [
                clip(Shapes.RoundedCorner(appControl.standardHeight / 2)),
                background(palette.border),
                paddingAll(outline),
              ]
            : []),
        ]}
      >
        <Button
          colors={{
            containerColor: palette.background,
            contentColor: labelColor,
            disabledContainerColor: palette.background,
            disabledContentColor: labelColor,
          }}
          enabled={!inactive}
          modifiers={[
            fillMaxWidth(),
            defaultMinSize({
              minHeight: appControl.standardHeight - 2 * outline,
            }),
          ]}
          onClick={inactive ? undefined : onPress}
        >
          <Row
            horizontalArrangement={{ spacedBy: appSpacing.xs }}
            verticalAlignment="center"
          >
            {busy ? (
              <CircularProgressIndicator
                color={labelColor}
                modifiers={[size(BRAND_LOGO_SIZE, BRAND_LOGO_SIZE)]}
                strokeWidth={2}
              />
            ) : (
              <Image
                contentDescription={null}
                contentScale="fit"
                modifiers={[size(BRAND_LOGO_SIZE, BRAND_LOGO_SIZE)]}
                source={BRAND_LOGO_SOURCES[provider]}
              />
            )}
            <Text color={labelColor}>{label}</Text>
          </Row>
        </Button>
      </Box>
    </Host>
  );
}
