import type { OAuthProvider } from "./types";

export type OAuthCallback =
  | Readonly<{ kind: "success"; code: string; state: string }>
  | Readonly<{
      kind: "error";
      error: "access_denied" | "oauth_failed";
      state: string;
    }>;

const MAX_CODE_LENGTH = 4096;
const MAX_CALLBACK_LENGTH = 8192;
const STATE_PATTERN = /^[A-Za-z0-9_-]{43}$/;

export function parseOAuthCallback(
  url: string,
  provider: OAuthProvider,
): OAuthCallback {
  if (url.length > MAX_CALLBACK_LENGTH || /%(?![0-9A-Fa-f]{2})/.test(url)) {
    throw new Error("The login callback was invalid.");
  }
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new Error("The login callback was invalid.");
  }
  if (
    parsed.protocol !== "jamye:" ||
    parsed.hostname !== "oauth" ||
    parsed.pathname !== `/${provider}` ||
    parsed.username ||
    parsed.password ||
    parsed.port ||
    parsed.hash
  ) {
    throw new Error("The login callback did not match this provider.");
  }
  const entries = [...parsed.searchParams.entries()];
  const allowed = new Set(["code", "state", "error"]);
  if (
    entries.some(([key]) => !allowed.has(key)) ||
    new Set(entries.map(([key]) => key)).size !== entries.length
  ) {
    throw new Error("The login callback was invalid.");
  }
  const state = parsed.searchParams.get("state");
  if (!state || !STATE_PATTERN.test(state))
    throw new Error("The login callback was invalid.");
  const hasCode = parsed.searchParams.has("code");
  const hasError = parsed.searchParams.has("error");
  if (hasCode === hasError) throw new Error("The login callback was invalid.");
  const code = parsed.searchParams.get("code");
  const error = parsed.searchParams.get("error");
  if (
    hasCode &&
    code &&
    code.length <= MAX_CODE_LENGTH &&
    !/[\u0000-\u001f\u007f]/.test(code)
  )
    return { kind: "success", code, state };
  if (hasError && error)
    return {
      kind: "error",
      error: error === "access_denied" ? "access_denied" : "oauth_failed",
      state,
    };
  throw new Error("The login callback was invalid.");
}
