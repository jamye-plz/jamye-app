import { Stack } from "expo-router";

import { APP_SYMBOLS } from "@/shared/ui/app-symbol";
import type { AppSymbolName } from "@/shared/ui/app-symbol";
import type { HeaderActionsProps } from "@/shared/ui/header-actions.types";

export type * from "@/shared/ui/header-actions.types";

function sfSymbol(symbol: AppSymbolName | undefined) {
  return symbol === undefined ? undefined : APP_SYMBOLS[symbol].ios;
}

/**
 * Header actions drawn by the platform (ADR 0010). This is the iOS (and
 * default) implementation: `Stack.Toolbar` places native bar button items and
 * `UIMenu` pull-downs in the navigation bar, which iOS 26 renders in Liquid
 * Glass with the system glyph color. Android resolves to
 * `header-actions.android.tsx` (Material 3 icon buttons and dropdown menus).
 */
export function HeaderActions({ actions }: HeaderActionsProps) {
  return (
    <Stack.Toolbar placement="right">
      {actions.map((action) =>
        action.kind === "menu" ? (
          <Stack.Toolbar.Menu
            accessibilityLabel={action.accessibilityLabel}
            disabled={action.disabled}
            icon={sfSymbol(action.symbol)}
            key={action.key}
          >
            {action.items.map((item) => (
              <Stack.Toolbar.MenuAction
                destructive={item.destructive}
                disabled={item.disabled}
                icon={sfSymbol(item.symbol)}
                key={item.key}
                onPress={item.onPress}
              >
                {item.title}
              </Stack.Toolbar.MenuAction>
            ))}
          </Stack.Toolbar.Menu>
        ) : (
          <Stack.Toolbar.Button
            accessibilityLabel={action.accessibilityLabel}
            disabled={action.disabled}
            icon={sfSymbol(action.symbol)}
            key={action.key}
            onPress={action.onPress}
          />
        ),
      )}
    </Stack.Toolbar>
  );
}
