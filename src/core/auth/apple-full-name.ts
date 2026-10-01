const APPLE_FULL_NAME_MAX_LENGTH = 256;
// Matches the control characters (Unicode Cc: C0, DEL, C1) that the server's
// A6 validation rejects in full_name (Rust `char::is_control`), so the app
// omits such a name instead of failing the whole login with 422.
const APPLE_FULL_NAME_CONTROL_CHARS = /[\u0000-\u001F\u007F-\u009F]/;

/**
 * APPCON-AC3: gates the Apple port's already-trimmed `fullName` (see
 * `apple-authentication-port.ios.ts`'s `formatName()`) against A6's
 * `full_name` wire contract (trim, 1..256 chars, no control characters)
 * before it is ever sent. `undefined` in either direction means "omit the
 * field" -- the server then assigns `Apple{6}` (E4/U6), never a 400.
 */
export function sendableFullName(
  value: string | undefined,
): string | undefined {
  if (value === undefined) return undefined;
  const trimmed = value.trim();
  if (trimmed.length === 0 || trimmed.length > APPLE_FULL_NAME_MAX_LENGTH)
    return undefined;
  return APPLE_FULL_NAME_CONTROL_CHARS.test(trimmed) ? undefined : trimmed;
}
