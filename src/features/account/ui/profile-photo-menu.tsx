import type { ProfilePhotoMenuProps } from "./profile-photo-menu.types";

export type * from "./profile-photo-menu.types";

/**
 * Fallback for platforms without a native menu (web): the account screen's
 * web variant has no profile-photo entry, so only the label content renders.
 * iOS resolves to `profile-photo-menu.ios.tsx`, Android to
 * `profile-photo-menu.android.tsx`.
 */
export function ProfilePhotoMenu({ label }: ProfilePhotoMenuProps) {
  return <>{label}</>;
}
