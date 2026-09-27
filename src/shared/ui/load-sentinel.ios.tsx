import { ProgressView, VStack } from "@expo/ui/swift-ui";
import { frame, onAppear } from "@expo/ui/swift-ui/modifiers";

import type { LoadSentinelProps } from "./load-sentinel.types";

export type * from "./load-sentinel.types";

/**
 * Auto-load sentinel (C1): place at the end of a list. `onAppear` is
 * edge-triggered (SwiftUI calls it once when the view enters view, not
 * repeatedly while it stays visible), so gating on `isLoading` alone is
 * enough to keep one in-flight page from firing `onVisible` twice for the
 * same cursor: once a page starts loading, later appear events are ignored
 * until the caller's `isLoading` flips back to false. Android resolves to
 * `load-sentinel.android.tsx` (`onVisibilityChanged`).
 */
export function LoadSentinel({
  isLoading,
  onVisible,
  testID,
}: LoadSentinelProps) {
  return (
    <VStack
      modifiers={[
        onAppear(() => {
          if (!isLoading) onVisible();
        }),
      ]}
      testID={testID}
    >
      {isLoading ? (
        <ProgressView modifiers={[frame({ height: 20, width: 20 })]} />
      ) : null}
    </VStack>
  );
}
