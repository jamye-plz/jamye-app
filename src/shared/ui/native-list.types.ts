import type { ReactNode } from "react";

export type NativeListProps = Readonly<{
  children: ReactNode;
  /** Pull-to-refresh handler; the native indicator stays until it settles. */
  onRefresh: () => Promise<void>;
  testID?: string;
}>;
