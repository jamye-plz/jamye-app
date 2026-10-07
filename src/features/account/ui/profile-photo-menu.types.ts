import type { ReactNode } from "react";

import type { ProfilePhotoAction } from "./profile-photo-menu.shared";

/**
 * Shared prop contract for `ProfilePhotoMenu` (`.tsx` / `.ios.tsx` /
 * `.android.tsx`), kept in a non-platform-suffixed file like
 * `avatar.types.ts` so each variant imports the same type.
 */
export type ProfilePhotoMenuProps = Readonly<{
  actions: readonly ProfilePhotoAction[];
  /** iOS: the content that opens the menu on tap (header avatar / row). */
  label?: ReactNode;
  /** Android: controlled open state, so the header avatar and the row open
   * the same menu. */
  expanded?: boolean;
  onExpandedChange?: (expanded: boolean) => void;
  testID?: string;
}>;
