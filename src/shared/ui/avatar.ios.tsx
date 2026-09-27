import { Host } from "@expo/ui";

import { JamyeAvatarNativeView } from "@/shared/ui/jamye-ui-native";
import { avatarImageUri } from "@/shared/ui/avatar.shared";
import type { AvatarProps } from "@/shared/ui/avatar.types";

export type { AvatarProps } from "@/shared/ui/avatar.types";

/**
 * iOS: the jamye-ui `JamyeAvatarView` (T3) -- SwiftUI `AsyncImage` with a
 * monogram placeholder for loading/failure/no-uri, composed inside the same
 * expo-ui `Host` SwiftUI tree the surrounding row/header uses. No color hex
 * is passed: the native view falls back to real iOS semantic colors
 * (`.secondarySystemFill` / `.label`), which is the "iOS는 시스템 semantic
 * 색" rule with no JS-side plumbing.
 */
export function Avatar({ uri, name, size, testID }: AvatarProps) {
  if (!JamyeAvatarNativeView) return null;
  return (
    <Host style={{ height: size, width: size }}>
      <JamyeAvatarNativeView
        name={name}
        size={size}
        testID={testID}
        uri={avatarImageUri(uri)}
      />
    </Host>
  );
}
