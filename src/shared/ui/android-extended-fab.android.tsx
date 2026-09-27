import { Host } from "@expo/ui";
import {
  DropdownMenu,
  DropdownMenuItem,
  ExtendedFloatingActionButton,
  Icon,
  Text,
} from "@expo/ui/jetpack-compose";
import { testID as testIDModifier } from "@expo/ui/jetpack-compose/modifiers";
import { useState } from "react";
import type { ImageSourcePropType } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useAppThemeOrSystem } from "@/core/theme/theme-provider";
import { androidThemeColors, appSpacing } from "@/core/theme/tokens";
import type { AppSymbolName } from "@/shared/ui/app-symbol";

/**
 * Material drawables this FAB is actually asked to render (M14 round 1: G3's
 * "그룹 추가"/"새 그룹 만들기" and T5's "새 주제"). Extend when a page task
 * needs another icon here.
 */
const MATERIAL_ICON_SOURCES: Partial<
  Record<AppSymbolName, ImageSourcePropType>
> = {
  add: require("../../../assets/icons/material/add.xml") as ImageSourcePropType,
  groupAdd:
    require("../../../assets/icons/material/group_add.xml") as ImageSourcePropType,
  invite:
    require("../../../assets/icons/material/confirmation_number.xml") as ImageSourcePropType,
};
const FALLBACK_ICON_SOURCE = MATERIAL_ICON_SOURCES.add as ImageSourcePropType;
const ICON_SIZE = 24;

export type AndroidExtendedFabItem = Readonly<{
  key: string;
  label: string;
  /** Leading icon shown only when the FAB opens a menu (2+ items). */
  icon?: AppSymbolName;
  onPress: () => void;
}>;

export type AndroidExtendedFabProps = Readonly<{
  /** The FAB's own icon+label, e.g. `icon="add"`, `label="그룹 추가"` or `label="새 주제"`. */
  icon: AppSymbolName;
  label: string;
  accessibilityLabel?: string;
  /** One item runs immediately on tap; two or more open a dropdown menu first (G3, T5). */
  items: readonly AndroidExtendedFabItem[];
  testID?: string;
}>;

/**
 * Bottom-right Extended FAB (G3, T5), positioned above the bottom safe area
 * so it never overlaps the bottom navigation bar. iOS has no counterpart file
 * — the nav bar `+` (pull-down menu) covers the same entry points there
 * (ADR 0010: no FAB on iOS).
 */
export function AndroidExtendedFab({
  accessibilityLabel,
  icon,
  items,
  label,
  testID,
}: AndroidExtendedFabProps) {
  const { colorScheme } = useAppThemeOrSystem();
  const hex = androidThemeColors(colorScheme);
  const insets = useSafeAreaInsets();
  const [expanded, setExpanded] = useState(false);
  const hasMenu = items.length >= 2;
  const primaryItem = items[0];

  const fab = (
    <ExtendedFloatingActionButton
      modifiers={testID ? [testIDModifier(testID)] : undefined}
      onClick={() => {
        if (hasMenu) setExpanded(true);
        else primaryItem?.onPress();
      }}
    >
      <ExtendedFloatingActionButton.Icon>
        <Icon
          contentDescription={accessibilityLabel ?? label}
          size={ICON_SIZE}
          source={MATERIAL_ICON_SOURCES[icon] ?? FALLBACK_ICON_SOURCE}
        />
      </ExtendedFloatingActionButton.Icon>
      <ExtendedFloatingActionButton.Text>
        <Text>{label}</Text>
      </ExtendedFloatingActionButton.Text>
    </ExtendedFloatingActionButton>
  );

  const content = hasMenu ? (
    <DropdownMenu
      color={hex.surface}
      expanded={expanded}
      onDismissRequest={() => setExpanded(false)}
    >
      <DropdownMenu.Trigger>{fab}</DropdownMenu.Trigger>
      <DropdownMenu.Items>
        {items.map((item) => {
          const itemIconSource = item.icon
            ? MATERIAL_ICON_SOURCES[item.icon]
            : undefined;
          return (
            <DropdownMenuItem
              key={item.key}
              onClick={() => {
                setExpanded(false);
                item.onPress();
              }}
            >
              {itemIconSource ? (
                <DropdownMenuItem.LeadingIcon>
                  <Icon
                    size={ICON_SIZE}
                    source={itemIconSource}
                    tint={hex.text}
                  />
                </DropdownMenuItem.LeadingIcon>
              ) : null}
              <DropdownMenuItem.Text>
                <Text color={hex.text}>{item.label}</Text>
              </DropdownMenuItem.Text>
            </DropdownMenuItem>
          );
        })}
      </DropdownMenu.Items>
    </DropdownMenu>
  ) : (
    fab
  );

  // Seeded like every other host so the FAB's primaryContainer comes from the
  // app palette rather than the device wallpaper (Material You).
  return (
    <Host
      matchContents
      seedColor={hex.primary}
      style={{
        bottom: insets.bottom + appSpacing.md,
        position: "absolute",
        right: appSpacing.md,
      }}
    >
      {content}
    </Host>
  );
}
