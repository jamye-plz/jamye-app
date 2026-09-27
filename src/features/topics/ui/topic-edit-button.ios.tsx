import { Stack } from "expo-router";

import type { TopicEditButtonProps } from "./topic-edit-button.types";

export type * from "./topic-edit-button.types";

/**
 * iOS entry point into D2's integrated edit screen: a nav-bar `편집` text
 * button (matches C3/D2's toolbar-button convention; the pencil glyph is the
 * Android affordance instead, see `topic-edit-button.android.tsx`). Rendered
 * only while `TopicDetailScreen` is not already in edit mode.
 */
export function TopicEditButton({ onPress }: TopicEditButtonProps) {
  return (
    <Stack.Toolbar placement="right">
      <Stack.Toolbar.Button accessibilityLabel="주제 편집" onPress={onPress}>
        편집
      </Stack.Toolbar.Button>
    </Stack.Toolbar>
  );
}
