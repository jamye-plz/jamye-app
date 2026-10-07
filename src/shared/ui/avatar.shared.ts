const WEB_URL = /^https?:\/\/[^\s/?#]+\S*$/i;

/**
 * The only avatar URLs a platform variant hands to a network image loader
 * (iOS `AsyncImage`, Android Compose `Image`). The server's `User.avatar_url`
 * is `null`, `""` (cleared) or an `https://` URL of at most 512 characters --
 * `PATCH /me` accepts only `""` (clear) or a valid https URL, and an uploaded
 * photo is the server-hosted public `GET /api/v1/avatars/{avatar_id}` URL --
 * but a stale cache or a provider URL may still carry other shapes, so
 * anything but an absolute web URL (`file:`, `data:`, relative paths, `""`)
 * is dropped and the monogram shows instead. Cleartext `http:` is upgraded
 * rather than dropped: Kakao hands out `http://` profile image URLs unless
 * the server asks for `secure_resource`, iOS ATS and Android release builds
 * refuse cleartext, and the CDN serves the same path over https.
 */
export function avatarImageUri(
  uri: string | null | undefined,
): string | undefined {
  if (typeof uri !== "string" || !WEB_URL.test(uri)) return undefined;
  return uri.replace(/^http:/i, "https:");
}

export function monogramLetter(name: string): string {
  const trimmed = name.trim();
  return trimmed ? trimmed[0]!.toUpperCase() : "?";
}
