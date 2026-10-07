export type PublicEnv = Readonly<{
  apiOrigin: string;
  mediaOrigin: string;
}>;

export function parsePublicApiOrigin(value: string | undefined): string {
  if (!value) {
    throw new Error("EXPO_PUBLIC_API_ORIGIN is required.");
  }
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    throw new Error("EXPO_PUBLIC_API_ORIGIN must be a valid HTTPS origin.");
  }
  if (
    parsed.protocol !== "https:" ||
    parsed.username ||
    parsed.password ||
    parsed.search ||
    parsed.hash ||
    parsed.pathname !== "/"
  ) {
    throw new Error("EXPO_PUBLIC_API_ORIGIN must be a bare HTTPS origin.");
  }
  return parsed.origin;
}

/** The signed-URL allowlist never widens: a missing or malformed origin throws. */
export function parsePublicMediaOrigin(value: string | undefined): string {
  if (!value) {
    throw new Error("EXPO_PUBLIC_MEDIA_ORIGIN is required.");
  }
  try {
    return parsePublicApiOrigin(value);
  } catch {
    throw new Error("EXPO_PUBLIC_MEDIA_ORIGIN must be a bare HTTPS origin.");
  }
}

export function getPublicEnv(): PublicEnv {
  return {
    apiOrigin: parsePublicApiOrigin(process.env.EXPO_PUBLIC_API_ORIGIN),
    mediaOrigin: parsePublicMediaOrigin(process.env.EXPO_PUBLIC_MEDIA_ORIGIN),
  };
}
