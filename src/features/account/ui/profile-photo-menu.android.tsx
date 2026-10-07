import {
  DropdownMenu,
  DropdownMenuItem,
  Icon,
  IconButton,
  Text as ComposeText,
} from "@expo/ui/jetpack-compose";
import type { ImageSourcePropType } from "react-native";

import { useAppThemeOrSystem } from "@/core/theme/theme-provider";
import { androidThemeColors } from "@/core/theme/tokens";

import { PROFILE_PHOTO_MENU_LABEL } from "./profile-photo-menu.shared";
import type { ProfilePhotoMenuProps } from "./profile-photo-menu.types";

export type * from "./profile-photo-menu.types";

const MORE_ICON =
  require("../../../../assets/icons/material/more_vert.xml") as ImageSourcePropType;
const ICON_SIZE = 24;

/**
 * Android: a Material 3 `DropdownMenu` (chat-message-menu.android /
 * action-list-item.android pattern) with a 48dp `IconButton` trigger. The
 * open state is controlled so the header avatar (plain React Native) and the
 * `프로필 사진` row open the same menu: DESIGN.md notes that an RN touchable
 * nested under a Compose menu trigger receives no touches on device, so the
 * only Compose-owned trigger is this icon button. Items are text-only, and
 * must render inside a `Host` with the Berry `seedColor` (the account screen's
 * Host).
 */
export function ProfilePhotoMenu({
  actions,
  expanded = false,
  onExpandedChange,
}: ProfilePhotoMenuProps) {
  const { colorScheme } = useAppThemeOrSystem();
  const hex = androidThemeColors(colorScheme);
  return (
    <DropdownMenu
      color={hex.surface}
      expanded={expanded}
      onDismissRequest={() => onExpandedChange?.(false)}
    >
      <DropdownMenu.Trigger>
        <IconButton onClick={() => onExpandedChange?.(true)}>
          <Icon
            contentDescription={PROFILE_PHOTO_MENU_LABEL}
            size={ICON_SIZE}
            source={MORE_ICON}
            tint={hex.textMuted}
          />
        </IconButton>
      </DropdownMenu.Trigger>
      <DropdownMenu.Items>
        {actions.map((action) => (
          <DropdownMenuItem
            enabled={!action.disabled}
            key={action.key}
            onClick={() => {
              onExpandedChange?.(false);
              action.onPress();
            }}
          >
            <DropdownMenuItem.Text>
              <ComposeText color={action.disabled ? hex.textMuted : hex.text}>
                {action.label}
              </ComposeText>
            </DropdownMenuItem.Text>
          </DropdownMenuItem>
        ))}
      </DropdownMenu.Items>
    </DropdownMenu>
  );
}
