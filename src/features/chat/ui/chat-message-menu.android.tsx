import { Host } from "@expo/ui";
import {
  Box,
  DropdownMenu,
  DropdownMenuItem,
  Text as ComposeText,
} from "@expo/ui/jetpack-compose";
import { useEffect, useState } from "react";
import { Pressable, View } from "react-native";

import { useAppThemeOrSystem } from "@/core/theme/theme-provider";
import { androidThemeColors } from "@/core/theme/tokens";

import type { ChatMessageMenuProps } from "./chat-message-menu.types";

export type * from "./chat-message-menu.types";

/**
 * Android: an M3 `DropdownMenu` anchored to the bubble, opened by a
 * long-press on the bubble itself. The bubble stays a plain React Native
 * view with a long-press `Pressable`: hosted inside a Compose tree
 * (`RNHostView` under the menu trigger) it received no touches on device,
 * which also cut off the taps its attachments need. The menu's Compose
 * `Host` is a 1x1 anchor at the bubble's bottom edge (start or end, matching
 * the row side), mounted only while the menu is open, so rows pay for no
 * native host otherwise. Menu items render text-only (no leading icon asset
 * exists for these three actions yet).
 */
export function ChatMessageMenu({
  actions,
  alignEnd,
  children,
  openRef,
}: ChatMessageMenuProps) {
  const { colorScheme } = useAppThemeOrSystem();
  const hex = androidThemeColors(colorScheme);
  const [expanded, setExpanded] = useState(false);
  const hasActions = actions.length > 0;
  useEffect(() => {
    if (!openRef || !hasActions) return undefined;
    openRef.current = () => setExpanded(true);
    return () => {
      openRef.current = null;
    };
  }, [openRef, hasActions]);
  if (!hasActions) return <>{children}</>;
  return (
    <View style={{ alignSelf: alignEnd ? "flex-end" : "flex-start" }}>
      <Pressable
        accessibilityHint="길게 눌러 메뉴 열기"
        onLongPress={() => setExpanded(true)}
      >
        {children}
      </Pressable>
      {expanded ? (
        <Host
          seedColor={hex.primary}
          style={{
            bottom: 0,
            height: 1,
            position: "absolute",
            width: 1,
            ...(alignEnd ? { right: 0 } : { left: 0 }),
          }}
          testID="chat-message-menu-anchor"
        >
          <DropdownMenu
            color={hex.surface}
            expanded
            onDismissRequest={() => setExpanded(false)}
          >
            <DropdownMenu.Trigger>
              <Box />
            </DropdownMenu.Trigger>
            <DropdownMenu.Items>
              {actions.map((action) => {
                const color = action.destructive ? hex.error : hex.text;
                return (
                  <DropdownMenuItem
                    key={action.key}
                    onClick={() => {
                      setExpanded(false);
                      action.onPress();
                    }}
                  >
                    <DropdownMenuItem.Text>
                      <ComposeText color={color}>{action.label}</ComposeText>
                    </DropdownMenuItem.Text>
                  </DropdownMenuItem>
                );
              })}
            </DropdownMenu.Items>
          </DropdownMenu>
        </Host>
      ) : null}
    </View>
  );
}
