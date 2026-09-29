import type { ReactElement } from "react";

/**
 * Hosts React Native content that sits inside a Compose row/slot (DESIGN.md
 * §4: "React Native content placed inside a Compose `LazyColumn` needs
 * `RNHostView matchContents`"). iOS has no such requirement -- the universal
 * `ListItem`'s `renderAccessory` (`@expo/ui`'s `ListItem.ios.tsx`) already
 * wraps `leading`/`trailing` in its own `RNHostView`, so wrapping again here
 * would double-host it. This file is the no-op default;
 * `compose-rn-host.android.tsx` does the actual wrapping.
 */
export function ComposeRnHost({
  children,
}: Readonly<{ children: ReactElement }>) {
  return <>{children}</>;
}
