import { List } from "@expo/ui";

import type { NativeListProps } from "./native-list.types";

export type * from "./native-list.types";

/**
 * Scrollable, refreshable list for rows drawn by `@expo/ui`: the universal
 * `List` (SwiftUI `List` + `.refreshable` on iOS). Android resolves to
 * `native-list.android.tsx`. Not virtualized: for short, paginated lists.
 */
export function NativeList({ children, onRefresh, testID }: NativeListProps) {
  return (
    <List onRefresh={onRefresh} testID={testID}>
      {children}
    </List>
  );
}
