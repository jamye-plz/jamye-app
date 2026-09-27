import { useEffect, useRef } from "react";
import { ActivityIndicator, View } from "react-native";

import type { LoadSentinelProps } from "./load-sentinel.types";

export type * from "./load-sentinel.types";

/**
 * Fallback for platforms without a native visibility-change affordance
 * (web): fires once on mount (unless already loading). iOS and Android
 * resolve to their own files (`onAppear` / `onVisibilityChanged`).
 */
export function LoadSentinel({
  isLoading,
  onVisible,
  testID,
}: LoadSentinelProps) {
  const fired = useRef(false);
  useEffect(() => {
    if (fired.current || isLoading) return;
    fired.current = true;
    onVisible();
  }, [isLoading, onVisible]);
  return (
    <View testID={testID}>
      {isLoading ? <ActivityIndicator size="small" /> : null}
    </View>
  );
}
