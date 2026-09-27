import { Stack } from "expo-router";

import type { TopicEditButtonProps } from "./topic-edit-button.types";

export type * from "./topic-edit-button.types";

/**
 * Fallback for platforms without a dedicated header icon affordance (web): a
 * plain text toolbar button. iOS resolves to `topic-edit-button.ios.tsx`
 * (pencil nav-bar button), Android to `topic-edit-button.android.tsx`
 * (Material pencil icon button), both entry points into D2's integrated
 * edit screen.
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
