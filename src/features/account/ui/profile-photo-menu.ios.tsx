import { Button, Menu } from "@expo/ui/swift-ui";
import { disabled } from "@expo/ui/swift-ui/modifiers";
import type { ComponentProps } from "react";

import type { ProfilePhotoMenuProps } from "./profile-photo-menu.types";

export type * from "./profile-photo-menu.types";

type SystemImage = NonNullable<ComponentProps<typeof Button>["systemImage"]>;
const SF_SYMBOLS: Record<"select" | "reset", SystemImage> = {
  select: "photo",
  reset: "person.crop.circle.badge.xmark",
};

/**
 * iOS: a SwiftUI `Menu` (a single tap on its label opens the system menu)
 * whose items are native `Button`s, like chat-message-menu.ios and
 * action-list-item.ios: no RN pressables inside the menu. It must render
 * inside a `Host` (the account screen's `Form` already does). The label is
 * whatever the caller passes -- the header avatar via `RNHostView`, or the
 * `프로필 사진` row's native `Text`.
 */
export function ProfilePhotoMenu({
  actions,
  label,
  testID,
}: ProfilePhotoMenuProps) {
  return (
    <Menu label={label} testID={testID}>
      {actions.map((action) => (
        <Button
          key={action.key}
          label={action.label}
          modifiers={action.disabled ? [disabled(true)] : undefined}
          onPress={action.onPress}
          systemImage={SF_SYMBOLS[action.key]}
          testID={testID ? `${testID}-action-${action.key}` : undefined}
        />
      ))}
    </Menu>
  );
}
