export type PublicAppMode = "local-fixture" | "connected-auth";

export type PublicEnv = Readonly<{
  appMode: PublicAppMode;
  apiOrigin?: string;
}>;

export function parsePublicAppMode(value: string | undefined): PublicAppMode {
  if (!value) {
    throw new Error(
      "EXPO_PUBLIC_APP_MODE is required. Set it to local-fixture or connected-auth.",
    );
  }

  if (value !== "local-fixture" && value !== "connected-auth") {
    throw new Error(
      "EXPO_PUBLIC_APP_MODE is invalid. Use local-fixture or connected-auth.",
    );
  }

  return value;
}

export function parsePublicApiOrigin(value: string | undefined): string {
  if (!value) {
    throw new Error("EXPO_PUBLIC_API_ORIGIN is required for connected-auth.");
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

export function getPublicEnv(): PublicEnv {
  const appMode = parsePublicAppMode(process.env.EXPO_PUBLIC_APP_MODE);
  return {
    appMode,
    ...(appMode === "connected-auth"
      ? { apiOrigin: parsePublicApiOrigin(process.env.EXPO_PUBLIC_API_ORIGIN) }
      : {}),
  };
}
