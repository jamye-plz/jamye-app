import { Host } from "@expo/ui";
import { Icon, IconButton } from "@expo/ui/jetpack-compose";
import { Stack } from "expo-router";
import type { ImageSourcePropType } from "react-native";

import { useAppThemeOrSystem } from "@/core/theme/theme-provider";
import { androidThemeColors } from "@/core/theme/tokens";

import type { TopicEditButtonProps } from "./topic-edit-button.types";

export type * from "./topic-edit-button.types";

const EDIT_ICON =
  require("../../../../assets/icons/material/edit.xml") as ImageSourcePropType;
const ICON_SIZE = 24;

/**
 * Android entry point into D2's integrated edit screen: a Material pencil
 * icon button in `headerRight`, mirroring `HeaderActions`'s own Compose
 * icon-button wiring (`src/shared/ui/header-actions.android.tsx`) but kept
 * local to this feature since the shared header action set has no pencil
 * glyph registered. iOS resolves to `topic-edit-button.ios.tsx`.
 */
export function TopicEditButton({ onPress }: TopicEditButtonProps) {
  const { colorScheme } = useAppThemeOrSystem();
  const hex = androidThemeColors(colorScheme);
  return (
    <Stack.Screen
      options={{
        headerRight: () => (
          <Host matchContents seedColor={hex.primary}>
            <IconButton enabled onClick={onPress}>
              <Icon
                contentDescription="주제 편집"
                size={ICON_SIZE}
                source={EDIT_ICON}
                tint={hex.text}
              />
            </IconButton>
          </Host>
        ),
      }}
    />
  );
}
