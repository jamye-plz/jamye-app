import { LazyColumn, PullToRefreshBox } from "@expo/ui/jetpack-compose";
import type { ModifierConfig } from "@expo/ui/jetpack-compose/modifiers";
import {
  fillMaxSize,
  testID as testIDModifier,
} from "@expo/ui/jetpack-compose/modifiers";
import { useState } from "react";

import type { NativeListProps } from "./native-list.types";

export type * from "./native-list.types";

/**
 * Android list container. The universal `List` (@expo/ui 57.0.17) composes
 * `PullToRefreshBox` + `LazyColumn` without size modifiers, so both wrap the
 * content height and a pull that starts below the last row does nothing.
 * This composes the same pair with `fillMaxSize` so the whole host area is
 * pullable, and drives the Material 3 indicator from the refresh promise
 * exactly like the universal implementation.
 */
export function NativeList({ children, onRefresh, testID }: NativeListProps) {
  const [refreshing, setRefreshing] = useState(false);
  const refresh = async () => {
    setRefreshing(true);
    try {
      await onRefresh();
    } finally {
      setRefreshing(false);
    }
  };
  const listModifiers: ModifierConfig[] = [fillMaxSize()];
  if (testID) listModifiers.push(testIDModifier(testID));
  return (
    <PullToRefreshBox
      contentAlignment="topCenter"
      isRefreshing={refreshing}
      modifiers={[fillMaxSize()]}
      onRefresh={() => void refresh()}
    >
      <LazyColumn modifiers={listModifiers}>{children}</LazyColumn>
    </PullToRefreshBox>
  );
}
