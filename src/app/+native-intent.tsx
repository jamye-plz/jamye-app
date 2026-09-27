import { parsePublicApiOrigin } from "@/core/config/public-env";
import { pendingInviteStore } from "@/features/groups/model/pending-invite-store";

const INVITE_CODE_PATTERN = /^[A-Za-z0-9_-]{16,64}$/;

function configuredApiOrigin(): string | null {
  try {
    return parsePublicApiOrigin(process.env.EXPO_PUBLIC_API_ORIGIN);
  } catch {
    return null;
  }
}

/**
 * Extracts and validates an invite code from any of the three accepted
 * invite-link shapes (A3/L2/E7): a full `https://{apiOrigin}/invite/{code}`
 * Universal/App Link, a bare `/invite/{code}` path (expo-router may already
 * have stripped the origin before this runs), or the `jamye://invite/{code}`
 * custom scheme. Returns `null` for anything else, including a
 * syntactically-plausible path whose code fails
 * `^[A-Za-z0-9_-]{16,64}$` (ADR 0012) -- callers must fall back to the
 * pre-existing policy for a `null` result, never guess.
 */
export function inviteCodeFromNativeIntentPath(path: string): string | null {
  const apiOrigin = configuredApiOrigin();
  let pathname: string | null = null;
  if (apiOrigin && (path === apiOrigin || path.startsWith(`${apiOrigin}/`))) {
    try {
      const parsed = new URL(path);
      pathname = parsed.origin === apiOrigin ? parsed.pathname : null;
    } catch {
      pathname = null;
    }
  } else if (path.startsWith("jamye://invite/")) {
    pathname = `/invite/${path.slice("jamye://invite/".length)}`;
  } else if (path.startsWith("/invite/")) {
    pathname = path;
  }
  if (!pathname) return null;
  const bare = pathname.split("?")[0]!.split("#")[0]!;
  const match = /^\/invite\/([^/]+)\/?$/.exec(bare);
  const code = match?.[1] ?? null;
  return code !== null && INVITE_CODE_PATTERN.test(code) ? code : null;
}

/**
 * `+native-intent`: rewrites the URL expo-router resolves an external link
 * to, before any route mounts (ADR 0012). Invite links (initial or warm) are
 * checked first -- a valid code never reaches route params/navigation
 * history, it goes into `pendingInviteStore` and the caller always lands on
 * the code-less `/groups/join` confirmation screen. Everything else keeps
 * the pre-existing policy: oauth callbacks only redirect on the app's cold
 * `initial` launch, any other external scheme goes home, and an internal
 * `/`-prefixed path is passed through with its query stripped.
 */
export function redirectSystemPathForNativeIntent({
  path,
  initial,
}: Readonly<{ path: string; initial: boolean }>): string {
  const inviteCode = inviteCodeFromNativeIntentPath(path);
  if (inviteCode) {
    pendingInviteStore.set(inviteCode);
    return "/groups/join";
  }
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
