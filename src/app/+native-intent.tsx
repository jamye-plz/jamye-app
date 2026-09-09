export function redirectSystemPathForNativeIntent({
  path,
  initial,
}: Readonly<{ path: string; initial: boolean }>): string {
  if (!initial || !path.startsWith("jamye://oauth/"))
    return path.startsWith("/") ? path.split("?")[0] : "/";
  try {
    const parsed = new URL(path);
    const provider = parsed.pathname.slice(1);
    return parsed.protocol === "jamye:" &&
      parsed.hostname === "oauth" &&
      (provider === "kakao" || provider === "google")
      ? `/oauth/${provider}`
      : "/";
  } catch {
    return "/";
  }
}

export function redirectSystemPath({
  path,
  initial,
}: Readonly<{ path: string; initial: boolean }>): string {
  return redirectSystemPathForNativeIntent({ path, initial });
}
