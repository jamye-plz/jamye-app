/**
 * Shared prop contract for `Avatar` (`avatar.tsx` / `.ios.tsx` / `.android.tsx`).
 * Kept in its own non-platform-suffixed file so every variant can import the
 * same type without a self-referential import back through the platform
 * resolver (importing "./avatar" from inside "avatar.ios.tsx" would resolve
 * back to "avatar.ios.tsx" itself).
 */
export type AvatarProps = Readonly<{
  /** OAuth profile image / group avatar URL. Missing, loading, or failed
   * always falls back to the monogram (T3). */
  uri?: string | null;
  /** Source of the monogram letter (first character, uppercased). */
  name: string;
  /** Circle diameter in points/dp. */
  size: number;
  testID?: string;
}>;
