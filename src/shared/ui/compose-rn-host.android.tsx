import { RNHostView } from "@expo/ui";
import type { ReactElement } from "react";

/**
 * Hosts React Native content that sits inside a Compose row/slot (DESIGN.md
 * §4: "React Native content placed inside a Compose `LazyColumn` needs
 * `RNHostView matchContents`" -- missing it can crash: `LazyColumn` keys
 * items by index, so removing a row rebuilds every row below it and hands a
 * bare RN view to a new interop holder while the old one still owns it,
 * "The specified child already has a parent" (device defect 1). Mirrors
 * `action-list-item.android.tsx`'s `leading` hosting; extracted here (REFINE
 * Step 11) so `group-row-actions.tsx`'s ownership-transfer picker -- a
 * universal `ListItem` `leading`, not an `ActionListItem` -- gets the same
 * fix.
 */
export function ComposeRnHost({
  children,
}: Readonly<{ children: ReactElement }>) {
  return <RNHostView matchContents>{children}</RNHostView>;
}
