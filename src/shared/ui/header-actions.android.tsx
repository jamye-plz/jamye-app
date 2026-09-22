import {
  DropdownMenu,
  DropdownMenuItem,
  Host,
  Icon,
  IconButton,
  Row,
  Text,
} from "@expo/ui/jetpack-compose";
import { Stack } from "expo-router";
import { useState } from "react";
import type { ImageSourcePropType } from "react-native";

import { useAppThemeOrSystem } from "@/core/theme/theme-provider";
import { androidThemeColors } from "@/core/theme/tokens";
import type { AppThemeColorSpec } from "@/core/theme/tokens";
import type { AppSymbolName } from "@/shared/ui/app-symbol";
import type {
  HeaderActionsProps,
  HeaderMenuAction,
  HeaderToolbarSymbol,
} from "@/shared/ui/header-actions.types";

export type * from "@/shared/ui/header-actions.types";

/**
 * Material vector drawables: a Compose `Icon` takes an image source, not a
 * Material Symbols glyph. Toolbar buttons need every `HeaderToolbarSymbol`;
 * menu items may use any symbol listed here and go icon-less otherwise.
 */
const MATERIAL_ICONS: Record<
  HeaderToolbarSymbol | "group" | "invite",
  ImageSourcePropType
> = {
  add: require("../../../assets/icons/material/add.xml") as ImageSourcePropType,
  group:
    require("../../../assets/icons/material/group.xml") as ImageSourcePropType,
  info: require("../../../assets/icons/material/info.xml") as ImageSourcePropType,
  invite:
    require("../../../assets/icons/material/confirmation_number.xml") as ImageSourcePropType,
  more: require("../../../assets/icons/material/more_vert.xml") as ImageSourcePropType,
  refresh:
    require("../../../assets/icons/material/refresh.xml") as ImageSourcePropType,
};

const ICON_SIZE = 24;

function materialIcon(
  symbol: AppSymbolName | undefined,
): ImageSourcePropType | undefined {
  return symbol !== undefined && symbol in MATERIAL_ICONS
    ? MATERIAL_ICONS[symbol as keyof typeof MATERIAL_ICONS]
    : undefined;
}

function HeaderMenu({
  action,
  hex,
}: Readonly<{ action: HeaderMenuAction; hex: AppThemeColorSpec }>) {
  const [expanded, setExpanded] = useState(false);
  return (
    <DropdownMenu
      color={hex.surface}
      expanded={expanded}
      onDismissRequest={() => setExpanded(false)}
    >
      <DropdownMenu.Trigger>
        <IconButton
          enabled={!action.disabled}
          onClick={() => setExpanded(true)}
        >
          <Icon
            contentDescription={action.accessibilityLabel}
            size={ICON_SIZE}
            source={MATERIAL_ICONS[action.symbol]}
            tint={hex.text}
          />
        </IconButton>
      </DropdownMenu.Trigger>
      <DropdownMenu.Items>
        {action.items.map((item) => {
          const leading = materialIcon(item.symbol);
          const color = item.destructive ? hex.error : hex.text;
          return (
            <DropdownMenuItem
              enabled={!item.disabled}
              key={item.key}
              onClick={() => {
                setExpanded(false);
                item.onPress();
              }}
            >
              {leading ? (
                <DropdownMenuItem.LeadingIcon>
                  <Icon size={ICON_SIZE} source={leading} tint={color} />
                </DropdownMenuItem.LeadingIcon>
              ) : null}
              <DropdownMenuItem.Text>
                <Text color={color}>{item.title}</Text>
              </DropdownMenuItem.Text>
            </DropdownMenuItem>
          );
        })}
      </DropdownMenu.Items>
    </DropdownMenu>
  );
}

/**
 * Header actions drawn by the platform (ADR 0010), Android implementation:
 * Material 3 icon buttons and dropdown menus from `@expo/ui`'s Jetpack Compose
 * primitives, hosted in the native top app bar through `headerRight`. The
 * buttons keep Compose's transparent container (expo-router's toolbar paints
 * a box, and its modifiers reject the dynamic PlatformColor surfaces this
 * theme uses), so only the menu surface and glyphs get the plain hex colors
 * from `androidThemeColors`.
 */
export function HeaderActions({ actions }: HeaderActionsProps) {
  const { colorScheme } = useAppThemeOrSystem();
  const hex = androidThemeColors(colorScheme);
  return (
    <Stack.Screen
      options={{
        headerRight:
          actions.length > 0
            ? () => (
                <Host matchContents seedColor={hex.primary}>
                  <Row verticalAlignment="center">
                    {actions.map((action) =>
                      action.kind === "menu" ? (
                        <HeaderMenu
                          action={action}
                          hex={hex}
                          key={action.key}
                        />
                      ) : (
                        <IconButton
                          enabled={!action.disabled}
                          key={action.key}
                          onClick={action.onPress}
                        >
                          <Icon
                            contentDescription={action.accessibilityLabel}
                            size={ICON_SIZE}
                            source={MATERIAL_ICONS[action.symbol]}
                            tint={hex.text}
                          />
                        </IconButton>
                      ),
                    )}
                  </Row>
                </Host>
              )
            : undefined,
      }}
    />
  );
}
