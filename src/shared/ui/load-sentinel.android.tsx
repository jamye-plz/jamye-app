import { Column, LoadingIndicator } from "@expo/ui/jetpack-compose";
import {
  onVisibilityChanged,
  size,
  testID as testIDModifier,
} from "@expo/ui/jetpack-compose/modifiers";
import type { ModifierConfig } from "@expo/ui/jetpack-compose/modifiers";

import type { LoadSentinelProps } from "./load-sentinel.types";

export type * from "./load-sentinel.types";

/**
 * Auto-load sentinel (C1), Android: `onVisibilityChanged` is edge-triggered
 * (Compose calls it once per transition, not repeatedly while the value
 * stays the same), so gating on `isLoading` alone keeps one in-flight page
 * from firing `onVisible` twice for the same cursor. iOS resolves to
 * `load-sentinel.ios.tsx` (`onAppear`).
 */
export function LoadSentinel({
  isLoading,
  onVisible,
  testID,
}: LoadSentinelProps) {
  const modifiers: ModifierConfig[] = [
    onVisibilityChanged((visible) => {
      if (visible && !isLoading) onVisible();
    }),
  ];
  if (testID) modifiers.push(testIDModifier(testID));
  return (
    <Column modifiers={modifiers}>
      {isLoading ? <LoadingIndicator modifiers={[size(20, 20)]} /> : null}
    </Column>
  );
}
